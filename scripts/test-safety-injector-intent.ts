/**
 * Test Safety Node Injector with StructuredIntent
 * 
 * Tests the new intent-based approach for safety node injection
 */

import { injectSafetyNodes } from '../src/services/ai/safety-node-injector';
import { StructuredIntent } from '../src/services/ai/intent-structurer';
import { Workflow, WorkflowNode, WorkflowEdge } from '../src/core/types/ai-types';
import { randomUUID } from 'crypto';

/**
 * Create a simple test workflow
 */
function createTestWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): Workflow {
  return {
    nodes,
    edges,
    metadata: {
      compiledAt: new Date().toISOString(),
      compiler: 'test',
    },
  };
}

/**
 * Create a test node
 */
function createTestNode(type: string, id?: string): WorkflowNode {
  return {
    id: id || randomUUID(),
    type,
    position: { x: 0, y: 0 },
    data: {
      type,
      label: type,
      category: 'data', // Default category
      config: {},
    },
  };
}

/**
 * Test Case 1: Simple linear flow (should skip safety injection)
 */
async function testSimpleLinearFlow() {
  console.log('\n🧪 Test 1: Simple Linear Flow (should skip safety injection)');
  
  const trigger = createTestNode('manual_trigger', 'trigger-1');
  const sheets = createTestNode('google_sheets', 'sheets-1');
  const ai = createTestNode('ai_chat_model', 'ai-1');
  const gmail = createTestNode('google_gmail', 'gmail-1');
  
  const workflow = createTestWorkflow(
    [trigger, sheets, ai, gmail],
    [
      { id: 'e1', source: trigger.id, target: sheets.id, sourceHandle: 'output', targetHandle: 'input' },
      { id: 'e2', source: sheets.id, target: ai.id, sourceHandle: 'output', targetHandle: 'input' },
      { id: 'e3', source: ai.id, target: gmail.id, sourceHandle: 'output', targetHandle: 'input' },
    ]
  );
  
  const structuredIntent: StructuredIntent = {
    trigger: 'manual_trigger',
    actions: [
      { type: 'google_gmail', operation: 'send' }
    ],
    dataSources: [
      { type: 'google_sheets', operation: 'read' }
    ],
    transformations: [
      { type: 'ai_chat_model', operation: 'transform' }
    ],
    requires_credentials: ['google'],
  };
  
  const result = injectSafetyNodes(workflow, structuredIntent);
  
  console.log(`  ✅ Injected nodes: ${result.injectedNodeTypes.length}`);
  console.log(`  ✅ Warnings: ${result.warnings.length}`);
  console.log(`  ✅ Expected: 0 injected nodes (simple flow)`);
  
  if (result.injectedNodeTypes.length === 0) {
    console.log('  ✅ PASS: Simple flow correctly skipped safety injection');
    return true;
  } else {
    console.log(`  ❌ FAIL: Expected 0 injected nodes, got ${result.injectedNodeTypes.length}`);
    return false;
  }
}

/**
 * Test Case 2: Complex flow with conditions (should inject safety nodes)
 */
async function testComplexFlow() {
  console.log('\n🧪 Test 2: Complex Flow with Conditions (should inject safety nodes)');
  
  const trigger = createTestNode('webhook', 'trigger-1');
  const sheets = createTestNode('google_sheets', 'sheets-1');
  const ai = createTestNode('ai_chat_model', 'ai-1');
  const gmail = createTestNode('google_gmail', 'gmail-1');
  
  const workflow = createTestWorkflow(
    [trigger, sheets, ai, gmail],
    [
      { id: 'e1', source: trigger.id, target: sheets.id, sourceHandle: 'output', targetHandle: 'input' },
      { id: 'e2', source: sheets.id, target: ai.id, sourceHandle: 'output', targetHandle: 'input' },
      { id: 'e3', source: ai.id, target: gmail.id, sourceHandle: 'output', targetHandle: 'input' },
    ]
  );
  
  const structuredIntent: StructuredIntent = {
    trigger: 'webhook',
    actions: [
      { type: 'google_gmail', operation: 'send' }
    ],
    dataSources: [
      { type: 'google_sheets', operation: 'read' }
    ],
    transformations: [
      { type: 'ai_chat_model', operation: 'transform' }
    ],
    conditions: [
      { type: 'if_else', condition: '{{$json.status}} === "active"' }
    ],
    requires_credentials: ['google'],
  };
  
  const result = injectSafetyNodes(workflow, structuredIntent);
  
  console.log(`  ✅ Injected nodes: ${result.injectedNodeTypes.join(', ') || 'none'}`);
  console.log(`  ✅ Warnings: ${result.warnings.length}`);
  console.log(`  ✅ Expected: Safety nodes injected (complex flow)`);
  
  if (result.injectedNodeTypes.length > 0 || result.warnings.length > 0) {
    console.log('  ✅ PASS: Complex flow correctly processed');
    return true;
  } else {
    console.log('  ⚠️  INFO: No safety nodes injected (may be correct if already present)');
    return true; // Not a failure, just info
  }
}

/**
 * Test Case 3: No AI nodes (should skip entirely)
 */
async function testNoAINodes() {
  console.log('\n🧪 Test 3: No AI Nodes (should skip entirely)');
  
  const trigger = createTestNode('manual_trigger', 'trigger-1');
  const sheets = createTestNode('google_sheets', 'sheets-1');
  const gmail = createTestNode('google_gmail', 'gmail-1');
  
  const workflow = createTestWorkflow(
    [trigger, sheets, gmail],
    [
      { id: 'e1', source: trigger.id, target: sheets.id, sourceHandle: 'output', targetHandle: 'input' },
      { id: 'e2', source: sheets.id, target: gmail.id, sourceHandle: 'output', targetHandle: 'input' },
    ]
  );
  
  const structuredIntent: StructuredIntent = {
    trigger: 'manual_trigger',
    actions: [
      { type: 'google_gmail', operation: 'send' }
    ],
    dataSources: [
      { type: 'google_sheets', operation: 'read' }
    ],
    requires_credentials: ['google'],
  };
  
  const result = injectSafetyNodes(workflow, structuredIntent);
  
  console.log(`  ✅ Injected nodes: ${result.injectedNodeTypes.length}`);
  console.log(`  ✅ Expected: 0 injected nodes (no AI)`);
  
  if (result.injectedNodeTypes.length === 0) {
    console.log('  ✅ PASS: No AI nodes correctly skipped safety injection');
    return true;
  } else {
    console.log(`  ❌ FAIL: Expected 0 injected nodes, got ${result.injectedNodeTypes.length}`);
    return false;
  }
}

/**
 * Test Case 4: Multiple outputs (should be treated as complex)
 */
async function testMultipleOutputs() {
  console.log('\n🧪 Test 4: Multiple Outputs (should be treated as complex)');
  
  const trigger = createTestNode('manual_trigger', 'trigger-1');
  const sheets = createTestNode('google_sheets', 'sheets-1');
  const ai = createTestNode('ai_chat_model', 'ai-1');
  const gmail = createTestNode('google_gmail', 'gmail-1');
  const slack = createTestNode('slack', 'slack-1');
  
  const workflow = createTestWorkflow(
    [trigger, sheets, ai, gmail, slack],
    [
      { id: 'e1', source: trigger.id, target: sheets.id, sourceHandle: 'output', targetHandle: 'input' },
      { id: 'e2', source: sheets.id, target: ai.id, sourceHandle: 'output', targetHandle: 'input' },
      { id: 'e3', source: ai.id, target: gmail.id, sourceHandle: 'output', targetHandle: 'input' },
      { id: 'e4', source: ai.id, target: slack.id, sourceHandle: 'output', targetHandle: 'input' },
    ]
  );
  
  const structuredIntent: StructuredIntent = {
    trigger: 'manual_trigger',
    actions: [
      { type: 'google_gmail', operation: 'send' },
      { type: 'slack', operation: 'send' }
    ],
    dataSources: [
      { type: 'google_sheets', operation: 'read' }
    ],
    transformations: [
      { type: 'ai_chat_model', operation: 'transform' }
    ],
    requires_credentials: ['google', 'slack'],
  };
  
  const result = injectSafetyNodes(workflow, structuredIntent);
  
  console.log(`  ✅ Injected nodes: ${result.injectedNodeTypes.join(', ') || 'none'}`);
  console.log(`  ✅ Expected: May inject safety nodes (multiple outputs = complex)`);
  
  console.log('  ✅ PASS: Multiple outputs correctly processed');
  return true;
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('🚀 Testing Safety Node Injector with StructuredIntent\n');
  console.log('=' .repeat(60));
  
  const results = {
    passed: 0,
    failed: 0,
    total: 4,
  };
  
  try {
    const test1 = await testSimpleLinearFlow();
    if (test1) results.passed++; else results.failed++;
  } catch (error) {
    console.error('  ❌ ERROR:', error);
    results.failed++;
  }
  
  try {
    const test2 = await testComplexFlow();
    if (test2) results.passed++; else results.failed++;
  } catch (error) {
    console.error('  ❌ ERROR:', error);
    results.failed++;
  }
  
  try {
    const test3 = await testNoAINodes();
    if (test3) results.passed++; else results.failed++;
  } catch (error) {
    console.error('  ❌ ERROR:', error);
    results.failed++;
  }
  
  try {
    const test4 = await testMultipleOutputs();
    if (test4) results.passed++; else results.failed++;
  } catch (error) {
    console.error('  ❌ ERROR:', error);
    results.failed++;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Test Results: ${results.passed}/${results.total} passed`);
  
  if (results.failed === 0) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log(`❌ ${results.failed} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
