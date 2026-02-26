/**
 * Worker Service
 * 
 * Main service for running distributed workflow workers.
 * Consumes jobs from queue and processes them with appropriate workers.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { QueueClient, NodeJob, createQueueClient } from './queue-client';
import { StorageManager } from './storage-manager';
import { DistributedOrchestrator } from './distributed-orchestrator';
import { NodeWorker } from './node-worker';
import { OllamaWorker } from './workers/ollama-worker';
import { PassThroughWorker } from './workers/pass-through-worker';
import { LightricksWorker } from './workers/lightricks-worker';
import { getSupabaseClient } from '../../../core/database/supabase-compat';
import { createObjectStorageService } from '../object-storage-service';

export interface WorkerServiceConfig {
  nodeTypes?: string[]; // Specific node types to process (if empty, processes all)
  prefetch?: number; // Number of jobs to prefetch
}

/**
 * Worker Service
 * 
 * Main service that consumes jobs from queue and processes them.
 */
export class WorkerService {
  private supabase: SupabaseClient;
  private queue: QueueClient;
  private storage: StorageManager;
  private orchestrator: DistributedOrchestrator;
  private workers: Map<string, NodeWorker> = new Map();
  private config: WorkerServiceConfig;
  private isRunning: boolean = false;

  constructor(config: WorkerServiceConfig = {}) {
    this.config = config;
    this.supabase = getSupabaseClient();
    this.queue = createQueueClient();
    this.storage = new StorageManager(
      this.supabase,
      createObjectStorageService()
    );
    this.orchestrator = new DistributedOrchestrator(
      this.supabase,
      this.queue,
      this.storage
    );

    // Register workers
    this.registerWorkers();
  }

  /**
   * Register all available workers
   */
  private registerWorkers(): void {
    const baseConfig = {
      supabase: this.supabase,
      storage: this.storage,
      orchestrator: this.orchestrator,
    };

    // Register Pass-Through workers (simple nodes that pass input to output)
    this.workers.set('manual_trigger', new PassThroughWorker({ ...baseConfig, nodeType: 'manual_trigger' }));
    this.workers.set('chat_trigger', new PassThroughWorker({ ...baseConfig, nodeType: 'chat_trigger' }));
    this.workers.set('set_variable', new PassThroughWorker({ ...baseConfig, nodeType: 'set_variable' }));
    this.workers.set('text_formatter', new PassThroughWorker({ ...baseConfig, nodeType: 'text_formatter' }));
    this.workers.set('log_output', new PassThroughWorker({ ...baseConfig, nodeType: 'log_output' }));

    // Register Ollama worker (for AI nodes)
    this.workers.set('ollama_embed', new OllamaWorker({ ...baseConfig, nodeType: 'ollama_embed' }));
    this.workers.set('ollama_generate', new OllamaWorker({ ...baseConfig, nodeType: 'ollama_generate' }));
    this.workers.set('ollama_train', new OllamaWorker({ ...baseConfig, nodeType: 'ollama_train' }));
    this.workers.set('ollama', new OllamaWorker({ ...baseConfig, nodeType: 'ollama' }));
    this.workers.set('ai_agent', new OllamaWorker({ ...baseConfig, nodeType: 'ai_agent' }));

    // Register Lightricks worker (for video generation)
    this.workers.set('lightricks', new LightricksWorker({ ...baseConfig, nodeType: 'lightricks' }));
    this.workers.set('ltx2', new LightricksWorker({ ...baseConfig, nodeType: 'ltx2' }));
    this.workers.set('ltx_2', new LightricksWorker({ ...baseConfig, nodeType: 'ltx_2' }));

    // Add more workers here as needed
    // this.workers.set('upload', new DocumentUploadWorker({ ...baseConfig, nodeType: 'upload' }));
    // this.workers.set('chunk', new TextChunkingWorker({ ...baseConfig, nodeType: 'chunk' }));
  }

  /**
   * Start worker service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[WorkerService] Already running');
      return;
    }

    console.log('[WorkerService] 🚀 Starting worker service...');

    // Connect to queue
    await this.queue.connect();

    // Start consuming jobs
    await this.queue.consumeJobs(
      async (job: NodeJob) => {
        await this.processJob(job);
      },
      { prefetch: this.config.prefetch || 1 }
    );

    this.isRunning = true;
    console.log('[WorkerService] ✅ Worker service started');
  }

  /**
   * Stop worker service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[WorkerService] ⏹️  Stopping worker service...');
    await this.queue.close();
    this.isRunning = false;
    console.log('[WorkerService] ✅ Worker service stopped');
  }

  /**
   * Process a job from the queue
   * Public for testing purposes
   */
  async processJob(job: NodeJob): Promise<void> {
    const { node_type, node_id, execution_id, step_id, job_id } = job;

    // IDEMPOTENCY CHECK: Verify step is not already completed
    if (step_id) {
      const { data: existingStep, error: stepError } = await this.supabase
        .from('execution_steps')
        .select('id, status, output_refs')
        .eq('id', step_id)
        .single();

      if (!stepError && existingStep) {
        // Step already completed - skip processing (idempotency)
        if (existingStep.status === 'completed') {
          console.log(`[WorkerService] ⏭️  Step ${step_id} already completed, skipping (idempotency)`);
          return;
        }

        // Step is running - check if it's a duplicate job
        if (existingStep.status === 'running') {
          // Check if this is a duplicate job (same job_id)
          if (job_id) {
            // For now, we'll allow duplicate jobs to proceed if step is stuck
            // The recovery manager will handle truly stuck steps
            console.log(`[WorkerService] ⚠️  Step ${step_id} is already running, but processing anyway (may be stuck)`);
          } else {
            // No job_id - this is a duplicate, skip it
            console.log(`[WorkerService] ⏭️  Step ${step_id} is already running, skipping duplicate job`);
            return;
          }
        }
      }
    }

    // Find appropriate worker
    const worker = this.findWorker(node_type);

    if (!worker) {
      console.error(`[WorkerService] ❌ No worker found for node type: ${node_type}`);
      throw new Error(`No worker found for node type: ${node_type}`);
    }

    // Process job
    await worker.processJob(job);
  }

  /**
   * Find worker for node type
   */
  private findWorker(nodeType: string): NodeWorker | null {
    // Direct match
    if (this.workers.has(nodeType)) {
      return this.workers.get(nodeType)!;
    }

    // Check if node type starts with any registered worker type
    for (const [workerType, worker] of this.workers.entries()) {
      if (nodeType.startsWith(workerType) || nodeType.includes(workerType)) {
        return worker;
      }
    }

    // Default to Lightricks worker if it's a video generation node
    if (nodeType.includes('lightricks') || nodeType.includes('ltx') || nodeType.includes('video_generate') || 
        nodeType.includes('video-generation')) {
      return this.workers.get('lightricks') || this.workers.get('ltx2') || null;
    }

    // Default to Ollama worker if it's an Ollama-related or AI node
    if (nodeType.includes('ollama') || nodeType.includes('embed') || nodeType.includes('generate') || 
        nodeType.includes('ai_agent') || nodeType.includes('ai-agent') || nodeType === 'ai_agent') {
      return this.workers.get('ollama') || this.workers.get('ai_agent') || null;
    }

    // Default to PassThroughWorker for simple trigger/output nodes
    if (nodeType.includes('trigger') || nodeType.includes('output') || nodeType.includes('log')) {
      return this.workers.get('manual_trigger') || this.workers.get('log_output') || null;
    }

    return null;
  }
}

/**
 * Start worker service (CLI entry point)
 */
export async function startWorkerService(nodeTypes?: string[]): Promise<void> {
  const service = new WorkerService({
    nodeTypes,
    prefetch: parseInt(process.env.WORKER_PREFETCH || '1', 10),
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[WorkerService] Received SIGINT, shutting down gracefully...');
    await service.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[WorkerService] Received SIGTERM, shutting down gracefully...');
    await service.stop();
    process.exit(0);
  });

  await service.start();
}
