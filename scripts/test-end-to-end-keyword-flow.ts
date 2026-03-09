/**
 * End-to-End Keyword Flow Test
 * 
 * Tests the complete flow:
 * 1. Stage 1: Keyword extraction from user prompt
 * 2. Stage 2: Prompt understanding & keyword flow
 * 3. Stage 3: Intent extraction (uses keywords from variation)
 * 4. Stage 4: Planner uses mandatory nodes
 * 5. Final workflow contains all mandatory nodes
 */

import { AIIntentClarifier, AliasKeywordCollector } from '../src/services/ai/summarize-layer';
import { WorkflowLifecycleManager } from '../src/services/workflow-lifecycle-manager';

interface TestCase {
  id: string;
  userPrompt: string;
  expectedKeywords: string[]; // Expected keywords to be extracted
  expectedNodeTypes: string[]; // Expected node types in final workflow
  description: string;
}

const testCases: TestCase[] = [
  {
    id: 'e2e-1',
    userPrompt: 'Schedule daily posts on LinkedIn with AI-generated content',
    expectedKeywords: ['schedule', 'linkedin', 'ai'],
    expectedNodeTypes: ['schedule', 'linkedin', 'ai_chat_model'],
    description: 'Social media automation with AI content generation'
  },
  {
    id: 'e2e-2',
    userPrompt: 'Read data from Google Sheets and send email via Gmail',
    expectedKeywords: ['google_sheets', 'gmail', 'email'],
    expectedNodeTypes: ['google_sheets', 'google_gmail'],
    description: 'Data reading and email sending'
  },
  {
    id: 'e2e-3',
    userPrompt: 'When form is submitted, save to database and notify on Slack',
    expectedKeywords: ['form', 'database', 'slack'],
    expectedNodeTypes: ['form', 'database_read', 'slack_message'],
    description: 'Form submission workflow with notifications'
  },
  {
    id: 'e2e-4',
    userPrompt: 'Summarize Twitter posts and post summary on LinkedIn',
    expectedKeywords: ['twitter', 'linkedin', 'summarize'],
    expectedNodeTypes: ['twitter_tweet', 'linkedin', 'ai_chat_model'],
    description: 'Social media cross-posting with summarization'
  },
  {
    id: 'e2e-5',
    userPrompt: 'Daily: Read from PostgreSQL, analyze with AI, send report via email',
    expectedKeywords: ['schedule', 'postgresql', 'ai', 'email'],
    expectedNodeTypes: ['schedule', 'postgresql', 'ai_chat_model', 'email'],
    description: 'Scheduled data analysis and reporting'
  }
];

async function testEndToEndFlow(testCase: TestCase): Promise<{
  success: boolean;
  stage1Keywords: string[];
  stage1NodeTypes: string[];
  selectedVariation: string;
  finalWorkflowNodeTypes: string[];
  missingNodes: string[];
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
  const finalWorkflowNodeTypes: string[] = [];
  const missingNodes: string[] = [];

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

    // Extract keywords from result
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
    // STAGE 2-4: Workflow Generation with Keywords
    // ============================================
    console.log('\n📊 STAGE 2-4: Workflow Generation');
    console.log('-'.repeat(80));

    const workflowLifecycleManager = new WorkflowLifecycleManager();
    
    // Generate workflow with mandatory nodes from Stage 1
    const workflowResult = await workflowLifecycleManager.generateWorkflowGraph(
      testCase.userPrompt,
      {
        selectedStructuredPrompt: selectedVariation,
        originalPrompt: testCase.userPrompt,
        mandatoryNodeTypes: stage1NodeTypes, // ✅ Pass mandatory nodes from Stage 1
      }
    );

    // Extract node types from final workflow
    if (workflowResult.workflow && workflowResult.workflow.nodes) {
      workflowResult.workflow.nodes.forEach((node: any) => {
        if (node.type && !finalWorkflowNodeTypes.includes(node.type)) {
          finalWorkflowNodeTypes.push(node.type);
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
    console.log('\n📊 VALIDATION: Mandatory Node Presence');
    console.log('-'.repeat(80));

    const keywordCollector = new AliasKeywordCollector();
    
    // Check if expected node types are in final workflow
    for (const expectedNodeType of testCase.expectedNodeTypes) {
      const isPresent = finalWorkflowNodeTypes.some(nodeType => {
        // Simple matching (can be enhanced with semantic matching)
        return nodeType.toLowerCase().includes(expectedNodeType.toLowerCase()) ||
               expectedNodeType.toLowerCase().includes(nodeType.toLowerCase());
      });

      if (!isPresent) {
        missingNodes.push(expectedNodeType);
        console.log(`❌ Missing expected node: ${expectedNodeType}`);
      } else {
        console.log(`✅ Found expected node: ${expectedNodeType}`);
      }
    }

    // Check if Stage 1 mandatory nodes are in final workflow
    for (const mandatoryNode of stage1NodeTypes) {
      const isPresent = finalWorkflowNodeTypes.some(nodeType => 
        nodeType.toLowerCase() === mandatoryNode.toLowerCase() ||
        nodeType.toLowerCase().includes(mandatoryNode.toLowerCase())
      );

      if (!isPresent) {
        missingNodes.push(mandatoryNode);
        console.log(`❌ Missing mandatory node from Stage 1: ${mandatoryNode}`);
      } else {
        console.log(`✅ Found mandatory node from Stage 1: ${mandatoryNode}`);
      }
    }

    const success = errors.length === 0 && missingNodes.length === 0;

    return {
      success,
      stage1Keywords,
      stage1NodeTypes,
      selectedVariation,
      finalWorkflowNodeTypes,
      missingNodes,
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
      finalWorkflowNodeTypes,
      missingNodes,
      errors,
    };
  }
}

async function runAllTests() {
  console.log('\n🚀 Starting End-to-End Keyword Flow Tests');
  console.log('='.repeat(80));

  const results: Array<{
    testCase: TestCase;
    result: Awaited<ReturnType<typeof testEndToEndFlow>>;
  }> = [];

  for (const testCase of testCases) {
    const result = await testEndToEndFlow(testCase);
    results.push({ testCase, result });

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
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
    console.log(`   Stage 1 Keywords: ${result.stage1Keywords.length}`);
    console.log(`   Stage 1 Node Types: ${result.stage1NodeTypes.join(', ')}`);
    console.log(`   Final Workflow Nodes: ${result.finalWorkflowNodeTypes.join(', ')}`);
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
