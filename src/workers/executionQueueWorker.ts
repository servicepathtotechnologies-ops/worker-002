/**
 * Execution Queue Worker Process
 *
 * Standalone process that polls the execution queue and processes jobs.
 * Run via: npm run start:execution-worker
 *
 * The API servers enqueue jobs (returning 202 immediately).
 * This worker dequeues and executes them, allowing multi-replica setups
 * where any replica can execute any job.
 */

import { getExecutionQueue } from '../services/execution-queue';

const WORKER_CONCURRENCY = parseInt(process.env.WORKFLOW_WORKER_CONCURRENCY || '5', 10);
const POLL_INTERVAL_MS = 1000;

async function main(): Promise<void> {
  console.log('[ExecutionWorker] Starting up...');
  console.log(`[ExecutionWorker] Concurrency: ${WORKER_CONCURRENCY}`);

  const queue = await getExecutionQueue({
    maxConcurrent: WORKER_CONCURRENCY,
    pollInterval: POLL_INTERVAL_MS,
  });

  queue.on('job:queued', (job) => {
    console.log(`[ExecutionWorker] Job queued: ${job.id} (workflow: ${job.workflowId})`);
  });

  queue.on('job:started', (job) => {
    console.log(`[ExecutionWorker] Job started: ${job.id}`);
  });

  queue.on('job:completed', (job) => {
    const durationMs = job.completedAt && job.startedAt ? job.completedAt - job.startedAt : 0;
    console.log(`[ExecutionWorker] Job completed: ${job.id} (${durationMs}ms)`);
  });

  queue.on('job:failed', (job) => {
    console.error(`[ExecutionWorker] Job failed: ${job.id} — ${job.error}`);
  });

  queue.on('job:retrying', (job) => {
    console.warn(`[ExecutionWorker] Job retrying: ${job.id} (attempt ${job.retryCount})`);
  });

  // Start the polling loop (picks up jobs from Redis queue)
  queue.startWorker();

  console.log('[ExecutionWorker] ✅ Ready — polling for jobs');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[ExecutionWorker] ${signal} received — shutting down...`);
    await queue.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Log stats every 60 seconds
  setInterval(async () => {
    try {
      const stats = await queue.getStats();
      console.log('[ExecutionWorker] Stats:', JSON.stringify(stats));
    } catch {
      // Non-fatal
    }
  }, 60_000);
}

main().catch((err) => {
  console.error('[ExecutionWorker] Fatal startup error:', err);
  process.exit(1);
});
