#!/usr/bin/env ts-node

/**
 * Start Worker Service
 * 
 * CLI script to start the distributed workflow worker service.
 * This consumes jobs from the queue and processes them.
 */

// IMPORTANT: Load environment variables FIRST before any other imports
import '../src/core/env-loader';

import { startWorkerService } from '../src/services/workflow-executor/distributed/worker-service';

// Parse command line arguments
const args = process.argv.slice(2);
const nodeTypes: string[] = [];

let i = 0;
while (i < args.length) {
  if (args[i] === '--node-types' && i + 1 < args.length) {
    nodeTypes.push(...args[i + 1].split(','));
    i += 2;
  } else {
    i++;
  }
}

console.log('🚀 Starting Distributed Workflow Worker Service...');
console.log(`📋 Node types: ${nodeTypes.length > 0 ? nodeTypes.join(', ') : 'all'}`);

startWorkerService(nodeTypes.length > 0 ? nodeTypes : undefined).catch((error) => {
  console.error('❌ Failed to start worker service:', error);
  process.exit(1);
});
