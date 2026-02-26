/**
 * Scheduler Service
 * 
 * Periodic service that scans for stuck executions and steps.
 * Runs recovery operations to ensure no executions are left hanging.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { QueueClient } from './queue-client';
import { DistributedOrchestrator } from './distributed-orchestrator';
import { RecoveryManager } from './recovery-manager';

export interface SchedulerConfig {
  scanIntervalMs?: number; // How often to scan (default: 60 seconds)
  recoveryConfig?: {
    stuckExecutionThresholdMs?: number;
    stuckStepThresholdMs?: number;
    maxRetries?: number;
  };
}

/**
 * Scheduler Service
 * 
 * Runs periodic recovery scans for stuck executions and steps.
 */
export class SchedulerService {
  private supabase: SupabaseClient;
  private queue: QueueClient;
  private orchestrator: DistributedOrchestrator;
  private recoveryManager: RecoveryManager;
  private config: SchedulerConfig;
  private isRunning: boolean = false;

  constructor(
    supabase: SupabaseClient,
    queue: QueueClient,
    orchestrator: DistributedOrchestrator,
    config?: SchedulerConfig
  ) {
    this.supabase = supabase;
    this.queue = queue;
    this.orchestrator = orchestrator;
    this.config = config || {};
    
    this.recoveryManager = new RecoveryManager(
      supabase,
      queue,
      orchestrator,
      config?.recoveryConfig
    );
  }

  /**
   * Start scheduler service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[SchedulerService] Already running');
      return;
    }

    console.log('[SchedulerService] 🚀 Starting scheduler service...');
    
    const scanInterval = this.config.scanIntervalMs || 60000; // Default: 60 seconds
    await this.recoveryManager.start(scanInterval);

    this.isRunning = true;
    console.log(`[SchedulerService] ✅ Scheduler service started (scanning every ${scanInterval}ms)`);
  }

  /**
   * Stop scheduler service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    await this.recoveryManager.stop();
    this.isRunning = false;
    console.log('[SchedulerService] ✅ Scheduler service stopped');
  }

  /**
   * Manually trigger a recovery scan
   */
  async triggerRecoveryScan(): Promise<void> {
    await this.recoveryManager.scanAndRecover();
  }
}
