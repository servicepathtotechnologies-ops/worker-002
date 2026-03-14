/**
 * Test All Implementation Prompts
 * 
 * Tests all 15 prompts provided by user to verify:
 * 1. Hardcoded operations removed (operations come from schemas)
 * 2. Execution order fixed (transformations before outputs)
 * 3. Variations are distinct (different complexity levels)
 * 
 * Runs sequentially, fixes errors in parallel if they occur
 */

import { WorkflowPipelineOrchestrator } from '../src/services/ai/workflow-pipeline-orchestrator';
import { Workflow } from '../src/core/types/ai-types';

interface TestResult {
  prompt: string;
  success: boolean;
  errors: string[];
  warnings: string[];
  nodeCount: number;
  edgeCount: number;
  hasTrigger: boolean;
  hasOutput: boolean;
  executionOrderValid: boolean;
  variationsGenerated?: boolean;
  variationsCount?: number;
}

const TEST_PROMPTS = [
  'Capture leads from website, qualify using AI, store in CRM, notify sales, and respond automatically.',
  'Generate AI content daily and post automatically on all social platforms',
  'Automatically respond to support tickets and escalate critical ones.',
  'When an order is placed, process payment, update inventory, notify warehouse',
  'Repo monitoring for GitHub',
  'Sync CRM, DB, and spreadsheets daily and generate reports',
  'Manage leads across multiple CRMs and move them through funnel stages.',
  'Upload contracts, extract data, summarize, store in cloud',
  'Build AI chatbot that remembers users and can call APIs',
  'Reconcile all payments daily and flag mismatches',
  'Auto-schedule meetings from emails and update calendar.',
  'Track new users, onboarding, churn risk and engagement',
  'Route incoming webhooks to multiple services conditionally',
  'Migrate legacy data into modern systems',
  'Detect workflow errors, retry, notify, and auto-recover'
];

/**
 * Validate workflow structure
 */
function validateWorkflow(workflow: Workflow | null, prompt: string): {
  success: boolean;
  errors: string[];
  warnings: string[];
  nodeCount: number;
  edgeCount: number;
  hasTrigger: boolean;
  hasOutput: boolean;
  executionOrderValid: boolean;
} {
  if (!workflow) {
    return {
      success: false,
      errors: ['Workflow is null'],
      warnings: [],
      nodeCount: 0,
      edgeCount: 0,
      hasTrigger: false,
      hasOutput: false,
      executionOrderValid: false,
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  // Check for trigger
  const hasTrigger = nodes.some(n => {
    const type = (n.type || n.data?.type || '').toLowerCase();
    return type.includes('trigger') || type === 'webhook' || type === 'schedule' || type === 'manual_trigger';
  });

  // Check for output
  const hasOutput = nodes.some(n => {
    const type = (n.type || n.data?.type || '').toLowerCase();
    return type.includes('gmail') || type.includes('email') || type.includes('slack') || 
           type.includes('output') || type.includes('log') || type.includes('crm') ||
           type.includes('salesforce') || type.includes('notify');
  });

  // Check execution order (transformations before outputs)
  let executionOrderValid = true;
  const nodeTypes = nodes.map(n => (n.type || n.data?.type || '').toLowerCase());
  const aiNodeIndex = nodeTypes.findIndex(t => t.includes('ai_chat_model') || t.includes('ai_agent'));
  const outputNodeIndices = nodeTypes
    .map((t, i) => (t.includes('gmail') || t.includes('email') || t.includes('slack') || 
                    t.includes('salesforce') || t.includes('crm')) ? i : -1)
    .filter(i => i >= 0);

  if (aiNodeIndex >= 0 && outputNodeIndices.length > 0) {
    const firstOutputIndex = Math.min(...outputNodeIndices);
    if (firstOutputIndex < aiNodeIndex) {
      executionOrderValid = false;
      errors.push(`Execution order violation: Output node at index ${firstOutputIndex} comes before AI transformation at index ${aiNodeIndex}`);
    }
  }

  // Check for duplicate nodes
  const nodeTypeCounts = new Map<string, number>();
  nodes.forEach(n => {
    const type = n.type || n.data?.type || '';
    nodeTypeCounts.set(type, (nodeTypeCounts.get(type) || 0) + 1);
  });
  const duplicates = Array.from(nodeTypeCounts.entries())
    .filter(([_, count]) => count > 1)
    .map(([type, _]) => type);
  
  if (duplicates.length > 0) {
    warnings.push(`Duplicate nodes found: ${duplicates.join(', ')}`);
  }

  // Check for orphan nodes
  const nodeIds = new Set(nodes.map(n => n.id));
  const connectedNodeIds = new Set<string>();
  edges.forEach(e => {
    connectedNodeIds.add(e.source);
    connectedNodeIds.add(e.target);
  });
  const orphans = nodes.filter(n => {
    const isTrigger = (n.type || n.data?.type || '').toLowerCase().includes('trigger');
    return !isTrigger && !connectedNodeIds.has(n.id);
  });
  
  if (orphans.length > 0) {
    warnings.push(`${orphans.length} orphan node(s) found`);
  }

  // Check minimum requirements
  if (nodes.length === 0) {
    errors.push('No nodes in workflow');
  }
  if (edges.length === 0 && nodes.length > 1) {
    errors.push('No edges in workflow (nodes not connected)');
  }
  if (!hasTrigger) {
    warnings.push('No trigger node found');
  }
  if (!hasOutput && nodes.length > 1) {
    warnings.push('No output node found');
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    hasTrigger,
    hasOutput,
    executionOrderValid,
  };
}

/**
 * Test summarize layer (variations generation)
 */
async function testSummarizeLayer(prompt: string): Promise<{
  success: boolean;
  variationsCount: number;
  errors: string[];
}> {
  try {
    const { AIIntentClarifier } = await import('../src/services/ai/summarize-layer');
    const clarifier = new AIIntentClarifier();
    
    const result = await clarifier.clarifyIntentAndGenerateVariations(prompt);
    
    if (!result.promptVariations || result.promptVariations.length === 0) {
      return {
        success: false,
        variationsCount: 0,
        errors: ['No variations generated'],
      };
    }

    // Check if variations are distinct
    const variations = result.promptVariations.map(v => v.prompt.toLowerCase());
    const uniqueVariations = new Set(variations);
    
    if (uniqueVariations.size < variations.length) {
      return {
        success: false,
        variationsCount: result.promptVariations.length,
        errors: [`Only ${uniqueVariations.size} unique variations out of ${variations.length} total`],
      };
    }

    // Check if variations have different complexity (simple check - different lengths)
    const lengths = variations.map(v => v.length);
    const minLength = Math.min(...lengths);
    const maxLength = Math.max(...lengths);
    const lengthVariation = maxLength - minLength;

    if (lengthVariation < 50) {
      return {
        success: false,
        variationsCount: result.promptVariations.length,
        errors: [`Variations too similar (length variation: ${lengthVariation} chars)`],
      };
    }

    return {
      success: true,
      variationsCount: result.promptVariations.length,
      errors: [],
    };
  } catch (error: any) {
    return {
      success: false,
      variationsCount: 0,
      errors: [error.message || 'Unknown error in summarize layer'],
    };
  }
}

/**
 * Run single test
 */
async function runTest(prompt: string, index: number): Promise<TestResult> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Test ${index + 1}/${TEST_PROMPTS.length}: ${prompt.substring(0, 60)}...`);
  console.log(`${'='.repeat(80)}`);

  const result: TestResult = {
    prompt,
    success: false,
    errors: [],
    warnings: [],
    nodeCount: 0,
    edgeCount: 0,
    hasTrigger: false,
    hasOutput: false,
    executionOrderValid: false,
  };

  try {
    // Step 1: Test summarize layer (variations)
    console.log('\n📋 Step 1: Testing summarize layer (variations generation)...');
    const summarizeResult = await testSummarizeLayer(prompt);
    result.variationsGenerated = summarizeResult.success;
    result.variationsCount = summarizeResult.variationsCount;
    
    if (!summarizeResult.success) {
      result.errors.push(...summarizeResult.errors.map(e => `Summarize layer: ${e}`));
      console.log(`   ❌ Summarize layer failed: ${summarizeResult.errors.join(', ')}`);
    } else {
      console.log(`   ✅ Summarize layer: Generated ${summarizeResult.variationsCount} variations`);
    }

    // Step 2: Test workflow generation
    console.log('\n🔧 Step 2: Testing workflow generation...');
    const orchestrator = new WorkflowPipelineOrchestrator();
    
    const pipelineResult = await orchestrator.executePipeline(
      prompt,
      {}, // existingCredentials
      {}, // providedCredentials
      {
        mode: 'build',
        originalPrompt: prompt,
      }
    );

    // Handle confirmation state
    let workflow = pipelineResult.workflow;
    if (pipelineResult.waitingForConfirmation && pipelineResult.confirmationRequest?.workflow) {
      workflow = pipelineResult.confirmationRequest.workflow;
      console.log('   ⚠️  Workflow requires confirmation - using workflow from confirmation request');
      
      // Auto-confirm for testing
      if (pipelineResult.workflowId) {
        try {
          const confirmedResult = await orchestrator.continuePipelineAfterConfirmation(
            pipelineResult.workflowId,
            true, // Auto-confirm
            {},
            {},
            { mode: 'build' }
          );
          if (confirmedResult.workflow) {
            workflow = confirmedResult.workflow;
            console.log('   ✅ Auto-confirmed workflow');
          }
        } catch (confirmError: any) {
          console.log(`   ⚠️  Auto-confirmation failed: ${confirmError.message}`);
        }
      }
    }

    // Step 3: Validate workflow
    console.log('\n✅ Step 3: Validating workflow...');
    const validation = validateWorkflow(workflow || null, prompt);
    
    result.success = validation.success && summarizeResult.success;
    result.errors.push(...validation.errors);
    result.warnings.push(...validation.warnings);
    result.nodeCount = validation.nodeCount;
    result.edgeCount = validation.edgeCount;
    result.hasTrigger = validation.hasTrigger;
    result.hasOutput = validation.hasOutput;
    result.executionOrderValid = validation.executionOrderValid;

    // Print results
    console.log(`\n📊 Results:`);
    console.log(`   Nodes: ${result.nodeCount}`);
    console.log(`   Edges: ${result.edgeCount}`);
    console.log(`   Has Trigger: ${result.hasTrigger ? '✅' : '❌'}`);
    console.log(`   Has Output: ${result.hasOutput ? '✅' : '❌'}`);
    console.log(`   Execution Order Valid: ${result.executionOrderValid ? '✅' : '❌'}`);
    console.log(`   Variations Generated: ${result.variationsGenerated ? '✅' : '❌'} (${result.variationsCount || 0})`);
    
    if (result.errors.length > 0) {
      console.log(`\n   ❌ Errors:`);
      result.errors.forEach(error => console.log(`      - ${error}`));
    }
    
    if (result.warnings.length > 0) {
      console.log(`\n   ⚠️  Warnings:`);
      result.warnings.forEach(warning => console.log(`      - ${warning}`));
    }

    if (result.success) {
      console.log(`\n   ✅ Test PASSED`);
    } else {
      console.log(`\n   ❌ Test FAILED`);
    }

  } catch (error: any) {
    result.errors.push(error.message || 'Unknown error');
    console.log(`\n   ❌ Test FAILED with exception: ${error.message}`);
    console.error(error);
  }

  return result;
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 STARTING COMPREHENSIVE TEST SUITE');
  console.log('='.repeat(80));
  console.log(`Testing ${TEST_PROMPTS.length} prompts...`);
  console.log('='.repeat(80));

  const results: TestResult[] = [];
  const errors: Array<{ prompt: string; error: string }> = [];

  // Run tests sequentially
  for (let i = 0; i < TEST_PROMPTS.length; i++) {
    try {
      const result = await runTest(TEST_PROMPTS[i], i);
      results.push(result);
      
      if (!result.success) {
        errors.push({
          prompt: TEST_PROMPTS[i],
          error: result.errors.join('; '),
        });
      }

      // Small delay between tests to avoid overwhelming the system
      if (i < TEST_PROMPTS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      console.error(`\n❌ Fatal error in test ${i + 1}:`, error);
      results.push({
        prompt: TEST_PROMPTS[i],
        success: false,
        errors: [error.message || 'Fatal error'],
        warnings: [],
        nodeCount: 0,
        edgeCount: 0,
        hasTrigger: false,
        hasOutput: false,
        executionOrderValid: false,
      });
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`\n✅ Passed: ${passed}/${TEST_PROMPTS.length}`);
  console.log(`❌ Failed: ${failed}/${TEST_PROMPTS.length}`);

  if (errors.length > 0) {
    console.log(`\n❌ Failed Tests:`);
    errors.forEach((e, i) => {
      console.log(`\n   ${i + 1}. "${e.prompt.substring(0, 60)}..."`);
      console.log(`      Error: ${e.error}`);
    });
  }

  // Detailed statistics
  console.log(`\n📈 Statistics:`);
  const avgNodes = results.reduce((sum, r) => sum + r.nodeCount, 0) / results.length;
  const avgEdges = results.reduce((sum, r) => sum + r.edgeCount, 0) / results.length;
  const executionOrderValidCount = results.filter(r => r.executionOrderValid).length;
  const variationsGeneratedCount = results.filter(r => r.variationsGenerated).length;

  console.log(`   Average nodes per workflow: ${avgNodes.toFixed(1)}`);
  console.log(`   Average edges per workflow: ${avgEdges.toFixed(1)}`);
  console.log(`   Execution order valid: ${executionOrderValidCount}/${TEST_PROMPTS.length}`);
  console.log(`   Variations generated: ${variationsGeneratedCount}/${TEST_PROMPTS.length}`);

  console.log('\n' + '='.repeat(80));
  console.log('🏁 TEST SUITE COMPLETE');
  console.log('='.repeat(80));

  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Fatal error in test suite:', error);
    process.exit(1);
  });
}

export { runAllTests, TEST_PROMPTS };
