/**
 * Simple Keyword Flow Test
 * 
 * Tests the keyword flow through:
 * 1. Stage 1: Keyword extraction from user prompt
 * 2. Stage 2: Planner receives mandatory nodes
 * 
 * This test doesn't require Supabase or full workflow generation.
 */

import { AIIntentClarifier } from '../src/services/ai/summarize-layer';
import { WorkflowPlanner } from '../src/services/workflow-planner';

interface TestCase {
  id: string;
  userPrompt: string;
  expectedKeywords: string[]; // Expected keywords to be extracted
  expectedNodeTypes: string[]; // Expected node types in mandatory nodes
  description: string;
}

const testCases: TestCase[] = [
  {
    id: 'flow-1',
    userPrompt: 'Schedule daily posts on LinkedIn with AI-generated content',
    expectedKeywords: ['schedule', 'linkedin', 'ai'],
    expectedNodeTypes: ['schedule', 'linkedin', 'ai_chat_model'],
    description: 'Social media automation with AI content generation'
  },
  {
    id: 'flow-2',
    userPrompt: 'Read data from Google Sheets and send email via Gmail',
    expectedKeywords: ['google_sheets', 'gmail', 'email'],
    expectedNodeTypes: ['google_sheets', 'google_gmail'],
    description: 'Data reading and email sending'
  },
  {
    id: 'flow-3',
    userPrompt: 'When form is submitted, save to database and notify on Slack',
    expectedKeywords: ['form', 'database', 'slack'],
    expectedNodeTypes: ['form', 'database_read', 'slack_message'],
    description: 'Form submission workflow with notifications'
  }
];

async function testKeywordFlow(testCase: TestCase): Promise<{
  success: boolean;
  stage1Keywords: string[];
  stage1NodeTypes: string[];
  selectedVariation: string;
  plannerReceivedNodes: boolean;
  errors: string[];
}> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Testing: ${testCase.id} - ${testCase.description}`);
  console.log(`📝 User Prompt: "${testCase.userPrompt}"`);
  console.log(`${'='.repeat(80)}\n`);

  const errors: string[] = [];
  const stage1Keywords: string[] = [];
  const stage1NodeTypes: string[] = [];
  let selectedVariation = '';
  let plannerReceivedNodes = false;

  try {
    // ============================================
    // STAGE 1: Keyword Extraction & Variation Generation
    // ============================================
    console.log('📊 STAGE 1: Keyword Extraction & Variation Generation');
    console.log('-'.repeat(80));

    const aiIntentClarifier = new AIIntentClarifier();
    const summarizeResult = await aiIntentClarifier.clarifyIntentAndGenerateVariations(
      testCase.userPrompt
    );

    // Extract node types from result
    if (summarizeResult.mandatoryNodeTypes && summarizeResult.mandatoryNodeTypes.length > 0) {
      stage1NodeTypes.push(...summarizeResult.mandatoryNodeTypes);
      console.log(`✅ Extracted ${stage1NodeTypes.length} node type(s): ${stage1NodeTypes.join(', ')}`);
    } else {
      errors.push('Stage 1: No mandatory node types extracted');
      console.log('❌ No mandatory node types extracted');
    }

    // Extract keywords from variations
    if (summarizeResult.promptVariations && summarizeResult.promptVariations.length > 0) {
      const firstVariation = summarizeResult.promptVariations[0];
      selectedVariation = firstVariation.prompt;
      
      // Extract keywords from variation
      if (firstVariation.keywords && firstVariation.keywords.length > 0) {
        stage1Keywords.push(...firstVariation.keywords);
        console.log(`✅ Extracted ${stage1Keywords.length} keyword(s) from variation: ${stage1Keywords.join(', ')}`);
      }

      console.log(`✅ Generated ${summarizeResult.promptVariations.length} variation(s)`);
      console.log(`📄 Selected Variation: "${selectedVariation.substring(0, 100)}..."`);
    } else {
      errors.push('Stage 1: No variations generated');
      console.log('❌ No variations generated');
    }

    // Validate Stage 1
    const missingKeywords = testCase.expectedKeywords.filter(
      kw => !stage1Keywords.some(extracted => extracted.toLowerCase().includes(kw.toLowerCase()))
    );
    if (missingKeywords.length > 0) {
      console.log(`⚠️  Missing keywords: ${missingKeywords.join(', ')}`);
    }

    // ============================================
    // STAGE 2: Planner Receives Mandatory Nodes
    // ============================================
    console.log('\n📊 STAGE 2: Planner Receives Mandatory Nodes');
    console.log('-'.repeat(80));

    if (stage1NodeTypes.length > 0) {
      const workflowPlanner = new WorkflowPlanner();
      
      // Test that planner accepts mandatory nodes
      try {
        const plan = await workflowPlanner.planWorkflow(
          selectedVariation,
          {
            mandatoryNodes: stage1NodeTypes, // ✅ Pass mandatory nodes from Stage 1
          }
        );

        // Check if plan was created
        if (plan && plan.steps) {
          plannerReceivedNodes = true;
          console.log(`✅ Planner received ${stage1NodeTypes.length} mandatory node(s)`);
          console.log(`✅ Plan created with ${plan.steps.length} step(s)`);
          
          // Check if mandatory nodes are in plan
          const planNodeTypes = plan.steps.map(step => (step.node_type || step.action || '').toLowerCase());
          const foundNodes = stage1NodeTypes.filter(mandatory => 
            planNodeTypes.some(planType => 
              planType === mandatory.toLowerCase() || 
              planType.includes(mandatory.toLowerCase()) ||
              mandatory.toLowerCase().includes(planType)
            )
          );
          
          console.log(`✅ Found ${foundNodes.length}/${stage1NodeTypes.length} mandatory node(s) in plan: ${foundNodes.join(', ')}`);
          
          if (foundNodes.length < stage1NodeTypes.length) {
            const missing = stage1NodeTypes.filter(n => !foundNodes.includes(n));
            console.log(`⚠️  Missing mandatory nodes in plan: ${missing.join(', ')}`);
          }
        } else {
          errors.push('Planner: Plan created but no steps found');
          console.log('❌ Plan created but no steps found');
        }
      } catch (error) {
        errors.push(`Planner error: ${error instanceof Error ? error.message : String(error)}`);
        console.log(`❌ Planner error: ${error}`);
      }
    } else {
      errors.push('Stage 2: No mandatory nodes to pass to planner');
      console.log('❌ No mandatory nodes to pass to planner');
    }

    const success = errors.length === 0 && plannerReceivedNodes;

    return {
      success,
      stage1Keywords,
      stage1NodeTypes,
      selectedVariation,
      plannerReceivedNodes,
      errors,
    };

  } catch (error) {
    console.error(`❌ Error in test:`, error);
    errors.push(`Test execution error: ${error instanceof Error ? error.message : String(error)}`);
    
    return {
      success: false,
      stage1Keywords,
      stage1NodeTypes,
      selectedVariation,
      plannerReceivedNodes,
      errors,
    };
  }
}

async function runAllTests() {
  console.log('\n🚀 Starting Keyword Flow Tests (Simple)');
  console.log('='.repeat(80));

  const results: Array<{
    testCase: TestCase;
    result: Awaited<ReturnType<typeof testKeywordFlow>>;
  }> = [];

  for (const testCase of testCases) {
    const result = await testKeywordFlow(testCase);
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
    }
    console.log(`   Stage 1 Keywords: ${result.stage1Keywords.length} (${result.stage1Keywords.join(', ')})`);
    console.log(`   Stage 1 Node Types: ${result.stage1NodeTypes.join(', ')}`);
    console.log(`   Planner Received Nodes: ${result.plannerReceivedNodes ? '✅' : '❌'}`);
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
