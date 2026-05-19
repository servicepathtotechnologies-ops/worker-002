/**
 * End-to-end Qdrant node test — runs through the exact same execution engine
 * the platform uses: executeNode → executeNodeDynamically → executeNodeLegacy → case 'qdrant'
 *
 * Run: npx ts-node --project tsconfig.json scripts/test-qdrant-e2e.ts
 */

import { executeNode } from '../src/api/execute-workflow';
import { LRUNodeOutputsCache } from '../src/core/cache/lru-node-outputs-cache';

// ── Config ────────────────────────────────────────────────────────────────────
const QDRANT_API_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6Y2Q3YmIzYWItODM5Ny00NzJmLTk4ODctOWM1NDIzNDRjZDI3In0.bHZ33rDsFT6R1D4ZiB3nUMQG51D5fNw8C6WplFJbWFY';
const QDRANT_URL      = 'https://f6b9d162-364e-4e67-a389-d168e8a21727.sa-east-1-0.aws.cloud.qdrant.io';
const QDRANT_COLLECTION = 'ctrlchecks-e2e-test';

const mockDb      = {} as any;
const nodeOutputs = new LRUNodeOutputsCache(100, false);
const workflowId  = 'test-workflow-qdrant-e2e';

function makeNode(operation: string, extra: Record<string, unknown> = {}) {
  return {
    id: `qdrant-node-${operation}`,
    type: 'qdrant',
    data: {
      label: `Qdrant ${operation}`,
      type: 'qdrant',
      category: 'database',
      config: {
        operation,
        url: QDRANT_URL,
        collection: QDRANT_COLLECTION,
        apiKey: QDRANT_API_KEY,
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
  console.log('Qdrant Node — End-to-End Test (via platform execution engine)');
  console.log('='.repeat(60));

  // ── 1. UPSERT ──────────────────────────────────────────────────────────────
  console.log('\n[1/3] Running UPSERT through executeNode...');
  const upsertResult = await executeNode(
    makeNode('upsert', {
      id: '1',
      vector: [0.1, 0.2, 0.3],
      payload: { label: 'e2e-test', source: 'ctrlchecks-platform' },
    }) as any,
    {},           // input from Manual Trigger (empty object)
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
      limit: 1,
      withPayload: true,
    }) as any,
    upsertResult,   // feed upsert output as input (mirrors a connected workflow)
    nodeOutputs,
    mockDb,
    workflowId
  );

  const query = queryResult as any;
  if (query?.success && Array.isArray(query?.matches) && query.matches.length > 0) {
    pass('query', queryResult);
  } else {
    fail('query', queryResult);
  }

  // ── 3. DELETE ──────────────────────────────────────────────────────────────
  console.log('\n[3/3] Running DELETE through executeNode...');
  const deleteResult = await executeNode(
    makeNode('delete', { id: '1' }) as any,
    queryResult,    // feed query output as input
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
  console.log('ALL 3 OPERATIONS PASSED — Qdrant node is working end-to-end');
  console.log('='.repeat(60));
}

run().catch((err) => {
  console.error('\n❌ Unexpected test error:', err);
  process.exit(1);
});
