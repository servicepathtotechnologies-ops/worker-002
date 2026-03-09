/**
 * End-to-End Mandatory Nodes Test
 * 
 * Tests that mandatory nodes from Stage 1 appear in the final workflow
 * after going through all stages (sanitization, pruning, etc.)
 */

import { AIIntentClarifier } from '../src/services/ai/summarize-layer';
import { WorkflowLifecycleManager } from '../src/services/workflow-lifecycle-manager';

interface TestCase {
  id: string;
  userPrompt: string;
  expectedMandatoryNodes: string[]; // Expected mandatory nodes from Stage 1
  description: string;
}

const testCases: TestCase[] = [
  {
    id: 'mandatory-1',
    userPrompt: 'Schedule daily posts on LinkedIn with AI-generated content',
    expectedMandatoryNodes: ['schedule', 'linkedin', 'ai_chat_model'],
    description: 'Social media automation with AI - verify schedule, linkedin, and AI nodes preserved'
  },
  {
    id: 'mandatory-2',
    userPrompt: 'Read data from Google Sheets and send email via Gmail',
    expectedMandatoryNodes: ['google_sheets', 'google_gmail'],
    description: 'Data reading and email - verify sheets and gmail nodes preserved'
  },
  {
    id: 'mandatory-3',
    userPrompt: 'When form is submitted, save to database and notify on Slack',
    expectedMandatoryNodes: ['form', 'database_write', 'slack_message'],
    description: 'Form workflow - verify form, database, and slack nodes preserved'
  }
];

async function testMandatoryNodesEndToEnd(testCase: TestCase): Promise<{
  success: boolean;
  stage1MandatoryNodes: string[];
  finalWorkflowNodeTypes: string[];
  missingNodes: string[];
  errors: string[];
}> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing: ${testCase.id} - ${testCase.description}`);
  console.log(`📝 User Prompt: "${testCase.userPrompt}"`);
  console.log(`${'='.repeat(80)}\n`);

  const errors: string[] = [];
  const stage1MandatoryNodes: string[] = [];
  const finalWorkflowNodeTypes: string[] = [];
  const missingNodes: string[] = [];

  try {
    // ============================================
    // STAGE 1: Keyword Extraction
    // ============================================
    console.log('📊 STAGE 1: Keyword Extraction');
    console.log('-'.repeat(80));

    const aiIntentClarifier = new AIIntentClarifier();
    const summarizeResult = await aiIntentClarifier.clarifyIntentAndGenerateVariations(
      testCase.userPrompt
    );

    if (summarizeResult.mandatoryNodeTypes && summarizeResult.mandatoryNodeTypes.length > 0) {
      stage1MandatoryNodes.push(...summarizeResult.mandatoryNodeTypes);
      console.log(`✅ Extracted ${stage1MandatoryNodes.length} mandatory node(s): ${stage1MandatoryNodes.join(', ')}`);
    } else {
      errors.push('Stage 1: No mandatory node types extracted');
      console.log('❌ No mandatory node types extracted');
    }

    // ============================================
    // END-TO-END: Workflow Generation
    // ============================================
    console.log('\n📊 END-TO-END: Workflow Generation');
    console.log('-'.repeat(80));

    const workflowLifecycleManager = new WorkflowLifecycleManager();
    
    // Select first variation
    const selectedVariation = summarizeResult.promptVariations && summarizeResult.promptVariations.length > 0
      ? summarizeResult.promptVariations[0].prompt
      : testCase.userPrompt;
    
    // Generate workflow with mandatory nodes
    const workflowResult = await workflowLifecycleManager.generateWorkflowGraph(
      testCase.userPrompt,
      {
        selectedStructuredPrompt: selectedVariation,
        originalPrompt: testCase.userPrompt,
        mandatoryNodeTypes: stage1MandatoryNodes, // ✅ Pass mandatory nodes
      }
    );

    // Extract node types from final workflow
    if (workflowResult.workflow && workflowResult.workflow.nodes) {
      workflowResult.workflow.nodes.forEach((node: any) => {
        const nodeType = node.type || node.nodeType || '';
        if (nodeType && !finalWorkflowNodeTypes.includes(nodeType)) {
          finalWorkflowNodeTypes.push(nodeType);
        }
      });
      console.log(`✅ Final workflow contains ${finalWorkflowNodeTypes.length} node(s): ${finalWorkflowNodeTypes.join(', ')}`);
    } else {
      errors.push('Workflow generation: No nodes in final workflow');
      console.log('❌ No nodes in final workflow');
    }

    // ============================================
    // VALIDATION: Check if mandatory nodes are present
    // ============================================
    console.log('\n📊 VALIDATION: Mandatory Node Presence in Final Workflow');
    console.log('-'.repeat(80));

    // Check if Stage 1 mandatory nodes are in final workflow
    for (const mandatoryNode of stage1MandatoryNodes) {
      const isPresent = finalWorkflowNodeTypes.some(nodeType => {
        const nodeTypeLower = nodeType.toLowerCase();
        const mandatoryLower = mandatoryNode.toLowerCase();
        return nodeTypeLower === mandatoryLower ||
               nodeTypeLower.includes(mandatoryLower) ||
               mandatoryLower.includes(nodeTypeLower);
      });

      if (!isPresent) {
        missingNodes.push(mandatoryNode);
        console.log(`❌ Missing mandatory node: ${mandatoryNode}`);
      } else {
        console.log(`✅ Found mandatory node: ${mandatoryNode}`);
      }
    }

    // Check expected mandatory nodes
    for (const expectedNode of testCase.expectedMandatoryNodes) {
      const isPresent = finalWorkflowNodeTypes.some(nodeType => {
        const nodeTypeLower = nodeType.toLowerCase();
        const expectedLower = expectedNode.toLowerCase();
        return nodeTypeLower === expectedLower ||
               nodeTypeLower.includes(expectedLower) ||
               expectedLower.includes(nodeTypeLower);
      });

      if (!isPresent && !stage1MandatoryNodes.some(m => m.toLowerCase() === expectedNode.toLowerCase())) {
        console.log(`⚠️  Expected node not found (may not have been extracted): ${expectedNode}`);
      }
    }

    const success = errors.length === 0 && missingNodes.length === 0;

    return {
      success,
      stage1MandatoryNodes,
      finalWorkflowNodeTypes,
      missingNodes,
      errors,
    };

  } catch (error) {
    console.error(`❌ Error in test:`, error);
    errors.push(`Test execution error: ${error instanceof Error ? error.message : String(error)}`);
    
    return {
      success: false,
      stage1MandatoryNodes,
      finalWorkflowNodeTypes,
      missingNodes,
      errors,
    };
  }
}

async function runAllTests() {
  console.log('\n🚀 Starting End-to-End Mandatory Nodes Tests');
  console.log('='.repeat(80));

  const results: Array<{
    testCase: TestCase;
    result: Awaited<ReturnType<typeof testMandatoryNodesEndToEnd>>;
  }> = [];

  for (const testCase of testCases) {
    const result = await testMandatoryNodesEndToEnd(testCase);
    results.push({ testCase, result });

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.result.success).length;
  const failed = results.filter(r => !r.result.success).length;

  console.log(`\n✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);

  results.forEach(({ testCase, result }) => {
    console.log(`\n${result.success ? '✅' : '❌'} ${testCase.id}: ${testCase.description}`);
    if (!result.success) {
      if (result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.join(', ')}`);
      }
      if (result.missingNodes.length > 0) {
        console.log(`   Missing Nodes: ${result.missingNodes.join(', ')}`);
      }
    }
    console.log(`   Stage 1 Mandatory Nodes: ${result.stage1MandatoryNodes.join(', ')}`);
    console.log(`   Final Workflow Nodes: ${result.finalWorkflowNodeTypes.join(', ')}`);
    console.log(`   All Mandatory Nodes Present: ${result.missingNodes.length === 0 ? '✅' : '❌'}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log(`Overall Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(80) + '\n');

  // Exit with appropriate code
  process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
