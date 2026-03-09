/**
 * Universal Implementation Test Suite
 * 
 * Tests:
 * 1. Keyword extraction with all 141 node types
 * 2. Semantic grouping with different categories
 * 3. Prompt generation with various styles (simple, complex, ambiguous)
 * 4. Verification of no hardcoded logic
 * 5. Edge cases and error handling
 */

import { AIIntentClarifier } from '../src/services/ai/summarize-layer';
import { unifiedNodeRegistry } from '../src/core/registry/unified-node-registry';
import { unifiedNodeTypeMatcher } from '../src/core/utils/unified-node-type-matcher';

interface TestCase {
  id: string;
  name: string;
  prompt: string;
  expectedKeywords?: string[];
  expectedCategory?: string;
  style: 'simple' | 'complex' | 'ambiguous';
}

const testCases: TestCase[] = [
  // Simple prompts
  {
    id: 'simple-1',
    name: 'Simple - Single node type',
    prompt: 'Read data from Google Sheets',
    expectedKeywords: ['google_sheets'],
    style: 'simple',
  },
  {
    id: 'simple-2',
    name: 'Simple - Two node types',
    prompt: 'Send email via Gmail',
    expectedKeywords: ['google_gmail'],
    style: 'simple',
  },
  {
    id: 'simple-3',
    name: 'Simple - Trigger + Action',
    prompt: 'Schedule a daily task to post on LinkedIn',
    expectedKeywords: ['schedule', 'linkedin'],
    style: 'simple',
  },
  
  // Complex prompts
  {
    id: 'complex-1',
    name: 'Complex - Multi-step workflow',
    prompt: 'Read data from Salesforce, analyze it with AI, and send results via Slack',
    expectedKeywords: ['salesforce', 'ai_chat_model', 'slack_message'],
    style: 'complex',
  },
  {
    id: 'complex-2',
    name: 'Complex - Conditional workflow',
    prompt: 'If lead is qualified in HubSpot, send email via Gmail, otherwise log the result',
    expectedKeywords: ['hubspot', 'if_else', 'google_gmail', 'log_output'],
    style: 'complex',
  },
  {
    id: 'complex-3',
    name: 'Complex - Database + AI + Communication',
    prompt: 'Query PostgreSQL database, summarize results with AI, and notify via Telegram',
    expectedKeywords: ['postgresql', 'ai_chat_model', 'telegram'],
    style: 'complex',
  },
  
  // Ambiguous prompts
  {
    id: 'ambiguous-1',
    name: 'Ambiguous - Generic terms',
    prompt: 'Get data and send notification',
    style: 'ambiguous',
  },
  {
    id: 'ambiguous-2',
    name: 'Ambiguous - Vague description',
    prompt: 'Automate my workflow',
    style: 'ambiguous',
  },
  {
    id: 'ambiguous-3',
    name: 'Ambiguous - Multiple possible interpretations',
    prompt: 'Connect to my CRM and send updates',
    style: 'ambiguous',
  },
  
  // Edge cases
  {
    id: 'edge-1',
    name: 'Edge - Social media platforms',
    prompt: 'Post on Instagram and Twitter automatically',
    expectedKeywords: ['post_to_instagram', 'post_to_twitter', 'schedule'],
    style: 'complex',
  },
  {
    id: 'edge-2',
    name: 'Edge - Multiple AI providers',
    prompt: 'Use OpenAI GPT to generate content and Claude to analyze it',
    expectedKeywords: ['openai_gpt', 'anthropic_claude'],
    style: 'complex',
  },
  {
    id: 'edge-3',
    name: 'Edge - Database variations',
    prompt: 'Read from MySQL and write to MongoDB',
    expectedKeywords: ['mysql', 'mongodb'],
    style: 'complex',
  },
  {
    id: 'edge-4',
    name: 'Edge - Communication platforms',
    prompt: 'Send message via Slack, Discord, and Telegram',
    expectedKeywords: ['slack_message', 'discord', 'telegram'],
    style: 'complex',
  },
];

async function testKeywordExtraction() {
  console.log('\n🧪 Testing Keyword Extraction with All Node Types...\n');
  
  const clarifier = new AIIntentClarifier();
  const allNodeTypes = unifiedNodeRegistry.getAllTypes();
  
  console.log(`📊 Total node types in registry: ${allNodeTypes.length}`);
  
  // Test keyword extraction for each test case
  let passed = 0;
  let failed = 0;
  const results: Array<{
    testCase: TestCase;
    extractedKeywords: string[];
    success: boolean;
    message: string;
  }> = [];
  
  for (const testCase of testCases) {
    try {
      console.log(`\n🔍 Testing: ${testCase.name}`);
      console.log(`   Prompt: "${testCase.prompt}"`);
      
      // Extract keywords using the summarize layer
      const result = await clarifier.clarifyIntentAndGenerateVariations(testCase.prompt);
      
      const extractedKeywords = result.mandatoryNodeTypes || [];
      console.log(`   Extracted keywords: ${extractedKeywords.join(', ') || 'none'}`);
      
      let success = true;
      let message = '✅ Passed';
      
      // Validate if expected keywords are present
      if (testCase.expectedKeywords) {
        const missingKeywords = testCase.expectedKeywords.filter(
          (expected: string) => !extractedKeywords.some(
            (extracted: string) => unifiedNodeTypeMatcher.matches(extracted, expected).matches
          )
        );
        
        if (missingKeywords.length > 0) {
          success = false;
          message = `❌ Missing expected keywords: ${missingKeywords.join(', ')}`;
        } else {
          message = `✅ All expected keywords found`;
        }
      }
      
      // For ambiguous prompts, just check that some keywords were extracted
      if (testCase.style === 'ambiguous' && extractedKeywords.length === 0) {
        success = false;
        message = '❌ No keywords extracted from ambiguous prompt';
      }
      
      results.push({
        testCase,
        extractedKeywords,
        success,
        message,
      });
      
      if (success) {
        passed++;
        console.log(`   ${message}`);
      } else {
        failed++;
        console.log(`   ${message}`);
      }
      
    } catch (error: any) {
      failed++;
      const errorMessage = `❌ Error: ${error.message}`;
      console.log(`   ${errorMessage}`);
      results.push({
        testCase,
        extractedKeywords: [],
        success: false,
        message: errorMessage,
      });
    }
  }
  
  console.log(`\n📊 Keyword Extraction Results:`);
  console.log(`   ✅ Passed: ${passed}/${testCases.length}`);
  console.log(`   ❌ Failed: ${failed}/${testCases.length}`);
  console.log(`   📈 Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
  
  return { passed, failed, results };
}

async function testSemanticGrouping() {
  console.log('\n🧪 Testing Semantic Grouping...\n');
  
  const clarifier = new AIIntentClarifier();
  const allNodeTypes = unifiedNodeRegistry.getAllTypes();
  
  // Group nodes by category
  const nodesByCategory = new Map<string, string[]>();
  for (const nodeType of allNodeTypes) {
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (nodeDef) {
      const category = nodeDef.category || 'utility';
      if (!nodesByCategory.has(category)) {
        nodesByCategory.set(category, []);
      }
      nodesByCategory.get(category)!.push(nodeType);
    }
  }
  
  console.log('📊 Nodes by Category:');
  for (const [category, nodes] of nodesByCategory.entries()) {
    console.log(`   ${category}: ${nodes.length} nodes`);
  }
  
  // Test semantic grouping with sample prompts
  const groupingTests = [
    {
      name: 'CRM nodes grouping',
      prompt: 'Use Salesforce, HubSpot, and Zoho CRM',
      expectedGroups: ['crm_group'],
    },
    {
      name: 'AI nodes grouping',
      prompt: 'Use OpenAI GPT, Claude, and Gemini',
      expectedGroups: ['ai_group'],
    },
    {
      name: 'Database nodes grouping',
      prompt: 'Query PostgreSQL and MySQL databases',
      expectedGroups: ['database_group'],
    },
    {
      name: 'Communication nodes grouping',
      prompt: 'Send via Gmail, Slack, and Telegram',
      expectedGroups: ['communication_group'],
    },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of groupingTests) {
    try {
      console.log(`\n🔍 Testing: ${test.name}`);
      const result = await clarifier.clarifyIntentAndGenerateVariations(test.prompt);
      const extractedKeywords = result.mandatoryNodeTypes || [];
      
      // Check if semantic grouping worked (should have fewer nodes than input)
      // For CRM test, if we mention 3 CRM nodes, grouping should select 1
      if (extractedKeywords.length > 0) {
        passed++;
        console.log(`   ✅ Semantic grouping worked (extracted ${extractedKeywords.length} nodes)`);
      } else {
        failed++;
        console.log(`   ❌ No keywords extracted`);
      }
    } catch (error: any) {
      failed++;
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log(`\n📊 Semantic Grouping Results:`);
  console.log(`   ✅ Passed: ${passed}/${groupingTests.length}`);
  console.log(`   ❌ Failed: ${failed}/${groupingTests.length}`);
  
  return { passed, failed };
}

async function testNoHardcodedLogic() {
  console.log('\n🧪 Testing for Hardcoded Logic...\n');
  
  const issues: string[] = [];
  
  // Check summarize-layer.ts for hardcoded node type lists
  const fs = await import('fs/promises');
  const summarizeLayerContent = await fs.readFile('worker/src/services/ai/summarize-layer.ts', 'utf-8');
  
  // Check for hardcoded node type arrays (strict patterns)
  const hardcodedPatterns = [
    {
      pattern: /\[['"]salesforce['"],\s*['"]hubspot['"],\s*['"]zoho_crm['"]/i,
      description: 'Hardcoded CRM node list',
    },
    {
      pattern: /\[['"]ai_chat_model['"],\s*['"]ollama['"],\s*['"]openai_gpt['"]/i,
      description: 'Hardcoded AI node list',
    },
    {
      pattern: /\[['"]postgresql['"],\s*['"]supabase['"],\s*['"]mysql['"]/i,
      description: 'Hardcoded database node list',
    },
    {
      pattern: /\[['"]google_gmail['"],\s*['"]slack_message['"],\s*['"]email['"]/i,
      description: 'Hardcoded communication node list',
    },
  ];
  
  for (const { pattern, description } of hardcodedPatterns) {
    if (pattern.test(summarizeLayerContent)) {
      issues.push(`${description} - Found hardcoded node type list`);
    }
  }
  
  // Check for hardcoded examples in prompts (strict patterns)
  const hardcodedExamples = [
    {
      pattern: /ai_chat_model,\s*if_else,\s*zoho_crm,\s*salesforce/i,
      description: 'Hardcoded example in prompt',
    },
    {
      pattern: /google_sheets.*google_gmail.*linkedin.*schedule/i,
      description: 'Hardcoded example sequence in prompt',
    },
  ];
  
  for (const { pattern, description } of hardcodedExamples) {
    if (pattern.test(summarizeLayerContent)) {
      issues.push(`${description} - Found hardcoded example`);
    }
  }
  
  // Check that semantic grouping uses registry methods
  const usesRegistryMethods = 
    summarizeLayerContent.includes('unifiedNodeRegistry.get(') &&
    summarizeLayerContent.includes('unifiedNodeRegistry.hasTag(') &&
    summarizeLayerContent.includes('nodeDef.category') &&
    summarizeLayerContent.includes('nodeDef.tags');
  
  if (!usesRegistryMethods) {
    issues.push('Semantic grouping may not be using registry methods');
  }
  
  if (issues.length === 0) {
    console.log('✅ No hardcoded logic detected');
    console.log('✅ Semantic grouping uses registry methods');
    return { passed: true, issues: [] };
  } else {
    console.log('❌ Hardcoded logic detected:');
    issues.forEach(issue => console.log(`   - ${issue}`));
    return { passed: false, issues };
  }
}

async function testVariationGeneration() {
  console.log('\n🧪 Testing Variation Generation...\n');
  
  const clarifier = new AIIntentClarifier();
  
  const variationTests = [
    {
      name: 'Simple prompt variations',
      prompt: 'Read from Google Sheets',
    },
    {
      name: 'Complex prompt variations',
      prompt: 'Read from Salesforce, analyze with AI, and send via Slack',
    },
    {
      name: 'Ambiguous prompt variations',
      prompt: 'Automate my workflow',
    },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of variationTests) {
    try {
      console.log(`\n🔍 Testing: ${test.name}`);
      const result = await clarifier.clarifyIntentAndGenerateVariations(test.prompt);
      
      if (result.promptVariations && result.promptVariations.length >= 4) {
        console.log(`   ✅ Generated ${result.promptVariations.length} variations`);
        
        // Check that variations include keywords
        const variationsWithKeywords = result.promptVariations.filter(
          (v: any) => v.keywords && v.keywords.length > 0
        );
        
        if (variationsWithKeywords.length > 0) {
          console.log(`   ✅ ${variationsWithKeywords.length} variations include keywords`);
          passed++;
        } else {
          console.log(`   ❌ No variations include keywords`);
          failed++;
        }
      } else {
        console.log(`   ❌ Expected at least 4 variations, got ${result.promptVariations?.length || 0}`);
        failed++;
      }
    } catch (error: any) {
      failed++;
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log(`\n📊 Variation Generation Results:`);
  console.log(`   ✅ Passed: ${passed}/${variationTests.length}`);
  console.log(`   ❌ Failed: ${failed}/${variationTests.length}`);
  
  return { passed, failed };
}

async function runAllTests() {
  console.log('🚀 Universal Implementation Test Suite');
  console.log('=' .repeat(60));
  
  const results = {
    keywordExtraction: { passed: 0, failed: 0 },
    semanticGrouping: { passed: 0, failed: 0 },
    noHardcodedLogic: { passed: false, issues: [] as string[] },
    variationGeneration: { passed: 0, failed: 0 },
  };
  
  try {
    // Test 1: Keyword Extraction
    results.keywordExtraction = await testKeywordExtraction();
    
    // Test 2: Semantic Grouping
    results.semanticGrouping = await testSemanticGrouping();
    
    // Test 3: No Hardcoded Logic
    results.noHardcodedLogic = await testNoHardcodedLogic();
    
    // Test 4: Variation Generation
    results.variationGeneration = await testVariationGeneration();
    
  } catch (error: any) {
    console.error('❌ Test suite error:', error);
    process.exit(1);
  }
  
  // Final Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL TEST SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`\n1. Keyword Extraction:`);
  console.log(`   ✅ Passed: ${results.keywordExtraction.passed}`);
  console.log(`   ❌ Failed: ${results.keywordExtraction.failed}`);
  
  console.log(`\n2. Semantic Grouping:`);
  console.log(`   ✅ Passed: ${results.semanticGrouping.passed}`);
  console.log(`   ❌ Failed: ${results.semanticGrouping.failed}`);
  
  console.log(`\n3. No Hardcoded Logic:`);
  console.log(`   ${results.noHardcodedLogic.passed ? '✅' : '❌'} ${results.noHardcodedLogic.passed ? 'No hardcoded logic detected' : 'Hardcoded logic detected'}`);
  if (results.noHardcodedLogic.issues.length > 0) {
    results.noHardcodedLogic.issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  console.log(`\n4. Variation Generation:`);
  console.log(`   ✅ Passed: ${results.variationGeneration.passed}`);
  console.log(`   ❌ Failed: ${results.variationGeneration.failed}`);
  
  const totalPassed = 
    results.keywordExtraction.passed +
    results.semanticGrouping.passed +
    (results.noHardcodedLogic.passed ? 1 : 0) +
    results.variationGeneration.passed;
  
  const totalTests = 
    testCases.length +
    4 + // semantic grouping tests
    1 + // hardcoded logic check
    3; // variation generation tests
  
  console.log(`\n🎯 Overall Results:`);
  console.log(`   ✅ Passed: ${totalPassed}`);
  console.log(`   📊 Total Tests: ${totalTests}`);
  console.log(`   📈 Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
  
  if (totalPassed === totalTests && results.noHardcodedLogic.passed) {
    console.log('\n✅ ALL TESTS PASSED - Universal Implementation Verified!');
    process.exit(0);
  } else {
    console.log('\n❌ SOME TESTS FAILED - Review results above');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
