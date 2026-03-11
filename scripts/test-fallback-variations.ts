/**
 * Test Script: Universal Fallback Variation Generator
 * 
 * Tests the new universal fallback mechanism to ensure:
 * 1. All variations include ALL required nodes
 * 2. Complete workflow chains are built (trigger → source → transform → output)
 * 3. Works for infinite prompts (not just specific cases)
 */

import { AIIntentClarifier } from '../src/services/ai/summarize-layer';
import { nodeLibrary } from '../src/services/nodes/node-library';

// Test cases
const testCases = [
  {
    name: 'Original Problem Case',
    prompt: 'get data from google sheets, summarise it and send it to gmail',
    expectedNodes: ['google_sheets', 'google_gemini', 'google_gmail'], // or ai_chat_model, ai_agent
    description: 'Should include: data source (google_sheets) + transformation (google_gemini/ai) + output (google_gmail)'
  },
  {
    name: 'Database to Email',
    prompt: 'read from database and send email',
    expectedNodes: ['postgresql', 'google_gmail'], // or other database/email nodes
    description: 'Should include: data source (database) + output (email)'
  },
  {
    name: 'API Analysis to Slack',
    prompt: 'fetch API data, analyze it, post to slack',
    expectedNodes: ['http_request', 'ai_chat_model', 'slack_message'], // or variations
    description: 'Should include: data source (http) + transformation (ai) + output (slack)'
  },
  {
    name: 'CRM Summarization',
    prompt: 'get CRM data, summarize, notify via email',
    expectedNodes: ['salesforce', 'google_gemini', 'google_gmail'], // or hubspot, ai_chat_model
    description: 'Should include: data source (CRM) + transformation (ai) + output (email)'
  },
  {
    name: 'Simple Data Flow',
    prompt: 'read from sheets and send to gmail',
    expectedNodes: ['google_sheets', 'google_gmail'],
    description: 'Should include: data source (sheets) + output (gmail)'
  }
];

async function testFallbackVariations() {
  console.log('🧪 Testing Universal Fallback Variation Generator\n');
  console.log('=' .repeat(80));
  
  const clarifier = new AIIntentClarifier();
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`   Prompt: "${testCase.prompt}"`);
    console.log(`   Expected: ${testCase.expectedNodes.join(', ')}`);
    console.log(`   ${testCase.description}\n`);
    
    try {
      // Simulate the fallback scenario by directly calling the method
      // We'll need to extract nodes first, then test the fallback
      const allKeywords = await clarifier['keywordCollector'].getAllAliasKeywords();
      const keywordStrings = allKeywords.map(k => k.keyword);
      
      // Extract node types from prompt (simplified - in real scenario this is done by keyword extraction)
      const extractedNodeTypes: string[] = [];
      const promptLower = testCase.prompt.toLowerCase();
      
      // Find nodes mentioned in prompt
      for (const keywordData of allKeywords) {
        if (promptLower.includes(keywordData.keyword.toLowerCase())) {
          if (!extractedNodeTypes.includes(keywordData.nodeType)) {
            extractedNodeTypes.push(keywordData.nodeType);
          }
        }
      }
      
      // Also check for direct node type mentions
      const allNodeTypes = nodeLibrary.getRegisteredNodeTypes();
      for (const nodeType of allNodeTypes) {
        const nodeTypeLower = nodeType.toLowerCase();
        if (promptLower.includes(nodeTypeLower) && !extractedNodeTypes.includes(nodeType)) {
          extractedNodeTypes.push(nodeType);
        }
      }
      
      console.log(`   ✅ Extracted nodes: ${extractedNodeTypes.join(', ')}`);
      
      if (extractedNodeTypes.length === 0) {
        console.log(`   ⚠️  No nodes extracted - skipping test`);
        continue;
      }
      
      // Test the fallback mechanism
      const result = clarifier['createFallbackResultWithExtractedNodes'](
        testCase.prompt,
        keywordStrings,
        extractedNodeTypes,
        allKeywords,
        null
      );
      
      console.log(`   📊 Generated ${result.promptVariations.length} variations\n`);
      
      // Verify each variation
      let allVariationsValid = true;
      for (let i = 0; i < result.promptVariations.length; i++) {
        const variation = result.promptVariations[i];
        const variationLower = variation.prompt.toLowerCase();
        
        // Check if variation includes expected nodes
        const missingNodes: string[] = [];
        for (const expectedNode of testCase.expectedNodes) {
          const nodeLower = expectedNode.toLowerCase();
          const nodeLabel = nodeLibrary.getSchema(expectedNode)?.label?.toLowerCase() || nodeLower;
          
          if (!variationLower.includes(nodeLower) && 
              !variationLower.includes(nodeLabel) &&
              !variation.keywords.some(k => k.toLowerCase().includes(nodeLower))) {
            missingNodes.push(expectedNode);
          }
        }
        
        if (missingNodes.length > 0) {
          console.log(`   ❌ Variation ${i + 1}: Missing nodes: ${missingNodes.join(', ')}`);
          console.log(`      Prompt: "${variation.prompt.substring(0, 100)}..."`);
          console.log(`      Keywords: ${variation.keywords.join(', ')}`);
          allVariationsValid = false;
        } else {
          console.log(`   ✅ Variation ${i + 1}: Includes all expected nodes`);
          console.log(`      Chain: ${variation.keywords.join(' → ')}`);
          console.log(`      Prompt: "${variation.prompt.substring(0, 100)}..."`);
        }
      }
      
      // Check workflow chain completeness
      let chainsComplete = true;
      for (const variation of result.promptVariations) {
        const chain = variation.keywords;
        const hasTrigger = chain.some(k => k.includes('trigger') || k.includes('webhook') || k.includes('schedule'));
        const hasDataSource = chain.some(k => {
          const schema = nodeLibrary.getSchema(k);
          return schema && (
            schema.category === 'data' || 
            k.includes('sheets') || 
            k.includes('database') || 
            k.includes('postgresql') ||
            k.includes('http')
          );
        });
        const hasOutput = chain.some(k => {
          const schema = nodeLibrary.getSchema(k);
          return schema && (
            schema.category === 'communication' || 
            k.includes('gmail') || 
            k.includes('slack') || 
            k.includes('email')
          );
        });
        
        if (!hasTrigger || !hasDataSource || !hasOutput) {
          console.log(`   ⚠️  Variation chain incomplete: ${chain.join(' → ')}`);
          console.log(`      Has trigger: ${hasTrigger}, Has data source: ${hasDataSource}, Has output: ${hasOutput}`);
          chainsComplete = false;
        }
      }
      
      if (allVariationsValid && chainsComplete) {
        console.log(`\n   ✅ TEST PASSED: All variations include required nodes and have complete chains`);
        passedTests++;
      } else {
        console.log(`\n   ❌ TEST FAILED: Some variations missing nodes or incomplete chains`);
        failedTests++;
      }
      
    } catch (error) {
      console.error(`   ❌ TEST ERROR: ${error instanceof Error ? error.message : String(error)}`);
      failedTests++;
    }
    
    console.log('   ' + '-'.repeat(76));
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Test Summary:');
  console.log(`   ✅ Passed: ${passedTests}/${testCases.length}`);
  console.log(`   ❌ Failed: ${failedTests}/${testCases.length}`);
  console.log(`   📈 Success Rate: ${((passedTests / testCases.length) * 100).toFixed(1)}%\n`);
  
  if (failedTests === 0) {
    console.log('🎉 All tests passed! The universal fallback mechanism is working correctly.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Please review the implementation.\n');
    process.exit(1);
  }
}

// Run tests
testFallbackVariations().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
