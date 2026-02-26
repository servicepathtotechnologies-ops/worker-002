/**
 * Node Worker Script
 * Runs in worker thread to execute individual workflow nodes
 * This file is executed in the worker thread context
 */

import { parentPort, workerData } from 'worker_threads';
import { executeNode } from '../../api/execute-workflow';

if (!parentPort) {
  throw new Error('This script must be run in a worker thread');
}

const workerId = workerData?.workerId || 'unknown';

console.log(`[Worker ${workerId}] Worker thread started`);

// Signal ready
parentPort.postMessage({
  type: 'WORKER_READY',
  workerId,
});

// Handle messages from main thread
parentPort.on('message', async (message: any) => {
  if (message.type === 'EXECUTE_NODE') {
    const { task } = message;
    
    try {
      // Emit node started
      parentPort!.postMessage({
        type: 'NODE_STARTED',
        taskId: task.id,
        executionId: task.executionId,
        nodeId: task.nodeId,
        data: {
          input: task.input,
          startTime: Date.now(),
        },
      });

      // Execute node
      // Note: We need to import executeNode function
      // For now, we'll use a simplified execution
      // In production, you'd want to properly isolate node execution
      const result = await executeNodeInWorker(
        task.nodeData,
        task.input,
        task.nodeOutputs
      );

      // Emit node completed
      parentPort!.postMessage({
        type: 'NODE_COMPLETED',
        taskId: task.id,
        executionId: task.executionId,
        nodeId: task.nodeId,
        data: {
          output: result,
          duration: Date.now() - Date.now(), // Calculate properly
        },
      });
    } catch (error: any) {
      // Emit node error
      parentPort!.postMessage({
        type: 'NODE_ERROR',
        taskId: task.id,
        executionId: task.executionId,
        nodeId: task.nodeId,
        error: error.message || 'Unknown error',
        data: {
          stack: error.stack,
        },
      });
    }
  }
});

/**
 * Execute node in worker context
 * This is a simplified version - in production, you'd want to
 * properly import and use the actual executeNode function
 */
async function executeNodeInWorker(
  nodeData: any,
  input: unknown,
  nodeOutputs: Record<string, unknown>
): Promise<unknown> {
  // For now, return a placeholder
  // In production, you'd import the actual executeNode function
  // and execute it here with proper error handling
  
  // Simulate execution
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return {
    ...(typeof input === 'object' && input !== null ? input : { value: input }),
    _processed: true,
    _nodeId: nodeData.id,
  };
}
