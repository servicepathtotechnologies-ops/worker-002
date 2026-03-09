#!/usr/bin/env ts-node
/**
 * Stage 1 Test Runner
 * 
 * Run this script to test Stage 1 (Summarize Layer) with 15 real-world workflows
 * 
 * Usage:
 *   npm run test:stage1
 *   or
 *   ts-node worker/scripts/test-stage1.ts
 */

import { testStage1SummarizeLayer } from '../src/services/ai/__tests__/summarize-layer-stage1-test';

// Run tests
testStage1SummarizeLayer()
  .then(() => {
    console.log('\n✅ Stage 1 tests completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Stage 1 tests failed:', error);
    process.exit(1);
  });
