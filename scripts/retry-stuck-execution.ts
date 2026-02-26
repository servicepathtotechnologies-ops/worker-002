#!/usr/bin/env ts-node

/**
 * Retry Stuck Execution
 * 
 * Manually retries a stuck execution by re-queuing pending steps.
 */

import '../src/core/env-loader';
import { getSupabaseClient } from '../src/core/database/supabase-compat';
import { createQueueClient } from '../src/services/workflow-executor/distributed/queue-client';

const executionId = process.argv[2];

if (!executionId) {
  console.error('Usage: ts-node scripts/retry-stuck-execution.ts <execution_id>');
  process.exit(1);
}

async function retryStuckExecution() {
  const supabase = getSupabaseClient();
  const queue = createQueueClient();
  
  await queue.connect();

  try {
    // Find pending steps
    const { data: steps, error } = await supabase
      .from('execution_steps')
      .select('*')
      .eq('execution_id', executionId)
      .eq('status', 'pending');

    if (error) {
      throw error;
    }

    if (!steps || steps.length === 0) {
      console.log('No pending steps found for this execution.');
      return;
    }

    console.log(`Found ${steps.length} pending step(s). Re-queuing...`);

    for (const step of steps) {
      // Reset step status
      await supabase
        .from('execution_steps')
        .update({
          status: 'pending',
          started_at: null,
          completed_at: null,
          error: null,
        })
        .eq('id', step.id);

      // Re-queue the job
      await queue.publishJob({
        execution_id: executionId,
        node_id: step.node_id,
        node_type: step.node_type,
        step_id: step.id,
        priority: 5,
      });

      console.log(`✅ Re-queued step: ${step.node_id} (${step.node_type})`);
    }

    console.log('✅ All pending steps have been re-queued!');
    console.log('Make sure your worker service is running to process them.');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await queue.close();
  }
}

retryStuckExecution();
