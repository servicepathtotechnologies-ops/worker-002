/**
 * End-to-end Cohere node test — runs through the exact same execution engine
 * the platform uses: executeNode → executeNodeDynamically → executeNodeLegacy → case 'cohere'
 *
 * Run: npx ts-node --project tsconfig.json scripts/test-cohere-e2e.ts
 */

import { executeNode } from '../src/api/execute-workflow';
import { LRUNodeOutputsCache } from '../src/core/cache/lru-node-outputs-cache';

// ── Config ────────────────────────────────────────────────────────────────────
const COHERE_API_KEY = process.env.COHERE_API_KEY || '';

const mockDb      = {} as any;
const nodeOutputs = new LRUNodeOutputsCache(100, false);
const workflowId  = 'test-workflow-cohere-e2e';

function makeNode(extra: Record<string, unknown> = {}) {
  return {
    id: 'cohere-node-generate',
    type: 'cohere',
    data: {
      label: 'Cohere Generate',
      type: 'cohere',
      category: 'ai',
      config: {
        model: 'command-r-08-2024',
        apiKey: COHERE_API_KEY,
        temperature: 0.3,
        maxTokens: 64,
        ...extra,
      },
    },
  };
}

function pass(label: string, result: unknown) {
  console.log(`\n✅ ${label.toUpperCase()} — PASSED`);
  console.log(JSON.stringify(result, null, 2));
}

function fail(label: string, result: unknown) {
  console.error(`\n❌ ${label.toUpperCase()} — FAILED`);
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

async function run() {
  if (!COHERE_API_KEY) {
    console.error('❌  COHERE_API_KEY env var is not set. Pass it via: COHERE_API_KEY=<key> npx ts-node ...');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Cohere Node — End-to-End Test (via platform execution engine)');
  console.log('='.repeat(60));

  // ── 1. BASIC GENERATION ───────────────────────────────────────────────────
  console.log('\n[1/2] Running BASIC GENERATION through executeNode...');
  const generateResult = await executeNode(
    makeNode({ prompt: 'Say exactly: "ctrlchecks cohere test ok"' }) as any,
    {},
    nodeOutputs,
    mockDb,
    workflowId
  );

  const gen = generateResult as any;
  if (gen?.success && typeof gen?.response === 'string' && gen.response.length > 0) {
    pass('basic generation', generateResult);
  } else {
    fail('basic generation', generateResult);
  }

  // ── 2. GENERATION WITH PREAMBLE ───────────────────────────────────────────
  console.log('\n[2/2] Running GENERATION WITH PREAMBLE through executeNode...');
  const preambleResult = await executeNode(
    makeNode({
      prompt: 'What is 2 + 2?',
      preamble: 'You are a concise math assistant. Answer in one short sentence.',
    }) as any,
    generateResult,
    nodeOutputs,
    mockDb,
    workflowId
  );

  const preambleGen = preambleResult as any;
  if (preambleGen?.success && typeof preambleGen?.response === 'string' && preambleGen.response.length > 0) {
    pass('generation with preamble', preambleResult);
  } else {
    fail('generation with preamble', preambleResult);
  }

  console.log('\n' + '='.repeat(60));
  console.log('ALL 2 OPERATIONS PASSED — Cohere node is working end-to-end');
  console.log('='.repeat(60));
}

run().catch((err) => {
  console.error('\n❌ Unexpected test error:', err);
  process.exit(1);
});
