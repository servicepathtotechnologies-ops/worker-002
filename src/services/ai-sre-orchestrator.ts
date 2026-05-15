import { config } from '../core/config';
import { circuitBreakerManager } from './workflow-executor/distributed/reliability/circuit-breaker';
import { getDeadLetterQueue } from './workflow-executor/distributed/reliability/dead-letter-queue';
import { createQueueClient } from './workflow-executor/distributed/queue-client';
import { getDbClient } from '../core/database/aws-db-client';
import { logExecutionEvent } from './execution/execution-event-logger';

type AutonomousOpsStatus = {
  running: boolean;
  lastRunAt?: string;
  lastRunError?: string;
  remediationsApplied: number;
};

class AISREOrchestrator {
  private intervalId: NodeJS.Timeout | null = null;
  private runningCycle = false;
  private status: AutonomousOpsStatus = {
    running: false,
    remediationsApplied: 0,
  };

  private readonly intervalMs = config.reliability.autonomousOpsIntervalMs;
  private readonly breakerCooldownMs = config.reliability.autonomousOpsBreakerResetCooldownMs;

  start(): void {
    if (!config.reliability?.autonomousOpsEnabled) {
      console.log('[AISRE] Autonomous ops disabled');
      return;
    }
    if (this.intervalId) {
      console.log('[AISRE] Already running');
      return;
    }

    this.status.running = true;
    void this.runCycle();
    this.intervalId = setInterval(() => {
      void this.runCycle();
    }, this.intervalMs);
    console.log(`[AISRE] ✅ Started autonomous SRE loop (interval=${this.intervalMs}ms)`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.status.running = false;
  }

  getStatus(): AutonomousOpsStatus {
    return { ...this.status };
  }

  private async runCycle(): Promise<void> {
    if (this.runningCycle) return;
    this.runningCycle = true;
    this.status.lastRunAt = new Date().toISOString();
    this.status.lastRunError = undefined;

    try {
      await this.remediateOpenCircuits();
      await this.replayEligibleDlqJobs();
    } catch (error: any) {
      this.status.lastRunError = error?.message || String(error);
      console.error('[AISRE] Cycle failed:', error);
    } finally {
      this.runningCycle = false;
    }
  }

  private async remediateOpenCircuits(): Promise<void> {
    const stats = circuitBreakerManager.getAllStats();
    const openBreakers = stats.filter((entry) => entry.state === 'open');
    if (openBreakers.length === 0) return;

    const now = Date.now();
    for (const breaker of openBreakers) {
      const lastFailureTime = breaker.lastFailureTime || 0;
      if (now - lastFailureTime < this.breakerCooldownMs) {
        continue;
      }

      circuitBreakerManager.reset(breaker.provider);
      this.status.remediationsApplied += 1;
      console.log(`[AISRE] 🔧 Reset circuit breaker for ${breaker.provider}`);
    }
  }

  private async replayEligibleDlqJobs(): Promise<void> {
    const replayBudget = Math.max(1, config.reliability?.autonomousOpsMaxRemediationAttempts || 3);
    const dlq = getDeadLetterQueue();
    if (!dlq.isAvailable()) {
      await dlq.initialize(config.redisUrl);
    }

    const jobs = await dlq.getAllJobs(replayBudget * 2);
    const eligible = jobs.filter((job) =>
      job.reason === 'timeout' || job.reason === 'rate_limit' || job.reason === 'unknown'
    );
    if (eligible.length === 0) return;

    const queue = createQueueClient();
    await queue.connect();
    const db = getDbClient();

    try {
      for (const job of eligible.slice(0, replayBudget)) {
        await queue.publishJob({
          execution_id: job.originalJob.executionId,
          node_id: job.originalJob.nodeId,
          node_type: job.originalJob.nodeType,
          retry_attempt: 0,
          priority: job.originalJob.priority,
          job_id: `${job.originalJob.id}-autonomous-replay-${Date.now()}`,
        });

        await dlq.removeJob(job.id);
        this.status.remediationsApplied += 1;

        await logExecutionEvent(
          db,
          job.originalJob.executionId,
          job.originalJob.workflowId,
          'AUTONOMOUS_REMEDIATION',
          {
            action: 'dlq_replay',
            reason: job.reason,
            dlqJobId: job.id,
            nodeId: job.originalJob.nodeId,
            nodeType: job.originalJob.nodeType,
          },
          job.originalJob.nodeId,
          job.originalJob.nodeType
        );
      }
    } finally {
      await queue.close();
    }
  }
}

export const aiSreOrchestrator = new AISREOrchestrator();
