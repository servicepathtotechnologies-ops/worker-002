/**
 * End-to-end Pinecone node test — runs through the exact same execution engine
 * the platform uses: executeNode → executeNodeDynamically → executeNodeLegacy → case 'pinecone'
 *
 * Run: npx ts-node --project tsconfig.json scripts/test-pinecone-e2e.ts
 */

import { executeNode } from '../src/api/execute-workflow';
import { LRUNodeOutputsCache } from '../src/core/cache/lru-node-outputs-cache';

// ── Config ────────────────────────────────────────────────────────────────────
const PINECONE_API_KEY = 'pcsk_4PMMWt_RvGsykgDkPwT3Z5zJD8dnxgizRGiXeqWuZcaQbXBK7QG7CQhhFyHCWZmh7pPaYB';
// Serverless index host — must be the full URL, not just the index name
const PINECONE_INDEX   = 'https://ctrlchecks-test-nvflqh8.svc.aped-4627-b74a.pinecone.io';

// Minimal db stub — Pinecone node doesn't touch the DB, but executeNode requires the arg
const mockDb = {} as any;

// The workflow cache — mirrors exactly what the workflow engine creates per execution
const nodeOutputs = new LRUNodeOutputsCache(100, false);

// A dummy workflowId matching the format the platform uses
const workflowId = 'test-workflow-pinecone-e2e';

function makeNode(operation: string, extra: Record<string, unknown> = {}) {
  return {
    id: `pinecone-node-${operation}`,
    type: 'pinecone',
    data: {
      label: `Pinecone ${operation}`,
      type: 'pinecone',
      category: 'database',
      config: {
        operation,
        index: PINECONE_INDEX,
        apiKey: PINECONE_API_KEY,
        ...extra,
      },
    },
  };
}

function pass(op: string, result: unknown) {
  console.log(`\n✅ ${op.toUpperCase()} — PASSED`);
  console.log(JSON.stringify(result, null, 2));
}

function fail(op: string, result: unknown) {
  console.error(`\n❌ ${op.toUpperCase()} — FAILED`);
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

async function run() {
  console.log('='.repeat(60));
  console.log('Pinecone Node — End-to-End Test (via platform execution engine)');
  console.log('='.repeat(60));

  // ── 1. UPSERT ──────────────────────────────────────────────────────────────
  console.log('\n[1/3] Running UPSERT through executeNode...');
  const upsertResult = await executeNode(
    makeNode('upsert', {
      id: 'vec-e2e-001',
      vector: [0.1, 0.2, 0.3],
      metadata: { label: 'e2e-test', source: 'ctrlchecks-platform' },
    }) as any,
    {},           // input from previous node (manual trigger gives empty object)
    nodeOutputs,
    mockDb,
    workflowId
  );

  const upsert = upsertResult as any;
  if (upsert?.success && upsert?.upsertedCount >= 1) {
    pass('upsert', upsertResult);
  } else {
    fail('upsert', upsertResult);
  }

  // ── 2. QUERY ───────────────────────────────────────────────────────────────
  console.log('\n[2/3] Running QUERY through executeNode...');
  const queryResult = await executeNode(
    makeNode('query', {
      vector: [0.1, 0.2, 0.3],
      topK: 1,
    }) as any,
    upsertResult,   // feed upsert output as input (mirrors a connected workflow)
    nodeOutputs,
    mockDb,
    workflowId
  );

  const query = queryResult as any;
  if (query?.success && Array.isArray(query?.matches)) {
    pass('query', queryResult);
  } else {
    fail('query', queryResult);
  }

  // ── 3. DELETE ──────────────────────────────────────────────────────────────
  console.log('\n[3/3] Running DELETE through executeNode...');
  const deleteResult = await executeNode(
    makeNode('delete', { id: 'vec-e2e-001' }) as any,
    queryResult,   // feed query output as input
    nodeOutputs,
    mockDb,
    workflowId
  );

  const del = deleteResult as any;
  if (del?.success) {
    pass('delete', deleteResult);
  } else {
    fail('delete', deleteResult);
  }

  console.log('\n' + '='.repeat(60));
  console.log('ALL 3 OPERATIONS PASSED — Pinecone node is working end-to-end');
  console.log('='.repeat(60));
}

run().catch((err) => {
  console.error('\n❌ Unexpected test error:', err);
  process.exit(1);
});
