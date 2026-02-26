/**
 * Enhanced Workflow Worker Pool
 * Manages Node.js worker threads for parallel workflow execution
 */

import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import path from 'path';

export interface WorkerTask {
  id: string;
  executionId: string;
  nodeId: string;
  nodeData: any;
  input: unknown;
  nodeOutputs: Record<string, unknown>;
  priority?: number;
}

export interface WorkerMessage {
  type: 'NODE_STARTED' | 'NODE_PROGRESS' | 'NODE_COMPLETED' | 'NODE_ERROR' | 'WORKER_READY';
  taskId?: string;
  executionId?: string;
  nodeId?: string;
  data?: any;
  error?: string;
}

export interface WorkerMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageExecutionTime: number;
  activeWorkers: number;
  queueLength: number;
}

/**
 * Priority queue for task scheduling
 */
class PriorityQueue {
  private items: Array<{ task: WorkerTask; priority: number }> = [];

  enqueue(task: WorkerTask, priority: number = 0): void {
    this.items.push({ task, priority });
    this.items.sort((a, b) => b.priority - a.priority);
  }

  dequeue(): WorkerTask | null {
    return this.items.shift()?.task || null;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}

/**
 * Enhanced Worker Pool Manager
 */
export class WorkflowWorkerPool extends EventEmitter {
  private workers: Map<number, Worker> = new Map();
  private availableWorkers: Set<number> = new Set();
  private taskQueue: PriorityQueue = new PriorityQueue();
  private activeTasks: Map<string, { workerId: number; startTime: number }> = new Map();
  private metrics: WorkerMetrics = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageExecutionTime: 0,
    activeWorkers: 0,
    queueLength: 0,
  };
  private executionTimes: number[] = [];
  private maxWorkers: number;
  private workerScript: string;

  constructor(maxWorkers: number = 5) {
    super();
    this.maxWorkers = maxWorkers;
    // Worker script path - will be created at runtime
    // For now, we'll use a placeholder since worker threads require compiled JS
    this.workerScript = path.join(__dirname, 'node-worker.js');
    
    // Note: Worker pool initialization is optional
    // Currently, execution happens in main thread for simplicity
    // Uncomment to enable worker threads:
    // this.initializeWorkers();
  }

  /**
   * Initialize worker pool
   */
  private initializeWorkers(): void {
    for (let i = 0; i < this.maxWorkers; i++) {
      this.createWorker(i);
    }
  }

  /**
   * Create a new worker thread
   */
  private createWorker(workerId: number): void {
    try {
      const worker = new Worker(this.workerScript, {
        workerData: { workerId },
      });

      worker.on('message', (message: WorkerMessage) => {
        this.handleWorkerMessage(workerId, message);
      });

      worker.on('error', (error) => {
        console.error(`[WorkerPool] Worker ${workerId} error:`, error);
        this.emit('worker_error', { workerId, error });
        this.removeWorker(workerId);
        // Attempt to recreate worker
        setTimeout(() => this.createWorker(workerId), 1000);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.warn(`[WorkerPool] Worker ${workerId} exited with code ${code}`);
          this.removeWorker(workerId);
          // Recreate worker if pool is not shutting down
          if (this.workers.size < this.maxWorkers) {
            setTimeout(() => this.createWorker(workerId), 1000);
          }
        }
      });

      this.workers.set(workerId, worker);
      this.availableWorkers.add(workerId);
      this.metrics.activeWorkers = this.workers.size;

      // Signal worker is ready
      this.emit('worker_ready', { workerId });
    } catch (error) {
      console.error(`[WorkerPool] Failed to create worker ${workerId}:`, error);
    }
  }

  /**
   * Handle messages from workers
   */
  private handleWorkerMessage(workerId: number, message: WorkerMessage): void {
    switch (message.type) {
      case 'WORKER_READY':
        this.availableWorkers.add(workerId);
        this.processQueue();
        break;

      case 'NODE_STARTED':
        this.emit('node_started', {
          executionId: message.executionId,
          nodeId: message.nodeId,
          data: message.data,
        });
        break;

      case 'NODE_PROGRESS':
        this.emit('node_progress', {
          executionId: message.executionId,
          nodeId: message.nodeId,
          progress: message.data,
        });
        break;

      case 'NODE_COMPLETED':
        this.handleTaskCompletion(workerId, message);
        this.emit('node_completed', {
          executionId: message.executionId,
          nodeId: message.nodeId,
          output: message.data,
        });
        break;

      case 'NODE_ERROR':
        this.handleTaskCompletion(workerId, message);
        this.emit('node_error', {
          executionId: message.executionId,
          nodeId: message.nodeId,
          error: message.error || 'Unknown error',
          data: message.data,
        });
        break;
    }
  }

  /**
   * Handle task completion
   */
  private handleTaskCompletion(workerId: number, message: WorkerMessage): void {
    if (message.taskId) {
      const taskInfo = this.activeTasks.get(message.taskId);
      if (taskInfo) {
        const executionTime = Date.now() - taskInfo.startTime;
        this.executionTimes.push(executionTime);
        
        // Keep only last 100 execution times for average calculation
        if (this.executionTimes.length > 100) {
          this.executionTimes.shift();
        }

        this.metrics.averageExecutionTime = 
          this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length;

        this.activeTasks.delete(message.taskId);
        this.availableWorkers.add(workerId);
        this.metrics.completedTasks++;
        
        if (message.type === 'NODE_ERROR') {
          this.metrics.failedTasks++;
        }

        // Process next task in queue
        this.processQueue();
      }
    }
  }

  /**
   * Submit a task to the worker pool
   */
  async submitTask(task: WorkerTask): Promise<void> {
    this.metrics.totalTasks++;
    this.metrics.queueLength = this.taskQueue.size() + 1;
    
    const priority = task.priority || 0;
    this.taskQueue.enqueue(task, priority);
    
    // Try to process immediately
    this.processQueue();
  }

  /**
   * Process tasks from the queue
   */
  private processQueue(): void {
    while (!this.taskQueue.isEmpty() && this.availableWorkers.size > 0) {
      const task = this.taskQueue.dequeue();
      if (!task) break;

      const workerId = Array.from(this.availableWorkers)[0];
      this.availableWorkers.delete(workerId);
      
      const worker = this.workers.get(workerId);
      if (!worker) {
        // Worker was removed, re-queue task
        this.taskQueue.enqueue(task, task.priority || 0);
        continue;
      }

      this.activeTasks.set(task.id, {
        workerId,
        startTime: Date.now(),
      });

      this.metrics.queueLength = this.taskQueue.size();

      // Send task to worker
      worker.postMessage({
        type: 'EXECUTE_NODE',
        task,
      });
    }
  }

  /**
   * Remove a worker from the pool
   */
  private removeWorker(workerId: number): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.terminate().catch(() => {
        // Ignore termination errors
      });
      this.workers.delete(workerId);
      this.availableWorkers.delete(workerId);
      this.metrics.activeWorkers = this.workers.size;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): WorkerMetrics {
    return {
      ...this.metrics,
      queueLength: this.taskQueue.size(),
      activeWorkers: this.workers.size,
    };
  }

  /**
   * Shutdown worker pool gracefully
   */
  async shutdown(): Promise<void> {
    // Wait for active tasks to complete (with timeout)
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeTasks.size > 0 && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Terminate all workers
    const terminationPromises = Array.from(this.workers.values()).map(worker =>
      worker.terminate().catch(() => {
        // Ignore termination errors
      })
    );

    await Promise.all(terminationPromises);
    this.workers.clear();
    this.availableWorkers.clear();
    this.taskQueue.clear();
    this.activeTasks.clear();
  }
}

// Export singleton instance
let workerPoolInstance: WorkflowWorkerPool | null = null;

export function getWorkerPool(maxWorkers?: number): WorkflowWorkerPool {
  if (!workerPoolInstance) {
    const workers = maxWorkers || parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
    workerPoolInstance = new WorkflowWorkerPool(workers);
  }
  return workerPoolInstance;
}
