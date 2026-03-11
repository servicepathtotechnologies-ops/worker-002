/**
 * Comprehensive Test Suite: Complex Real-World Prompts
 * 
 * Tests the universal fallback mechanism with complex, multi-step prompts
 * to ensure world-class quality and universal root-level fixes
 */

import { AIIntentClarifier } from '../src/services/ai/summarize-layer';
import { nodeLibrary } from '../src/services/nodes/node-library';

// Complex real-world test cases
const complexTestCases = [
  {
    name: 'Lead Capture & Qualification',
    prompt: 'Capture leads from website, qualify using AI, store in CRM, notify sales, and respond automatically',
    expectedComponents: ['webhook', 'ollama', 'salesforce', 'google_gmail'],
    description: 'Multi-step: capture → AI qualification → CRM storage → notifications'
  },
  {
    name: 'AI Content Generation & Social Posting',
    prompt: 'Generate AI content daily and post automatically on all social platforms.',
    expectedComponents: ['schedule', 'ollama', 'twitter', 'linkedin', 'facebook'],
    description: 'Scheduled AI generation → multi-platform posting'
  },
  {
    name: 'Support Ticket Automation',
    prompt: 'Automatically respond to support tickets and escalate critical ones',
    expectedComponents: ['webhook', 'ollama', 'if_else', 'email'],
    description: 'Auto-response with conditional escalation'
  },
  {
    name: 'E-commerce Order Processing',
    prompt: 'When an order is placed, process payment, update inventory, notify warehouse.',
    expectedComponents: ['webhook', 'stripe', 'database_write', 'slack_message'],
    description: 'Order → payment → inventory → notification chain'
  },
  {
    name: 'DevOps Repo Monitoring',
    prompt: 'Repo monitoring for GitHub, GitLab, Bitbucket, integrated with Jenkins',
    expectedComponents: ['github', 'gitlab', 'bitbucket', 'jenkins'],
    description: 'Multi-repo monitoring with CI/CD integration'
  },
  {
    name: 'Data Sync & Reporting',
    prompt: 'Sync CRM, DB, and spreadsheets daily and generate reports',
    expectedComponents: ['schedule', 'salesforce', 'postgresql', 'google_sheets', 'ollama'],
    description: 'Scheduled sync across multiple sources → report generation'
  },
  {
    name: 'Multi-CRM Lead Management',
    prompt: 'Manage leads across multiple CRMs and move them through funnel stages',
    expectedComponents: ['salesforce', 'hubspot', 'if_else', 'database_write'],
    description: 'Multi-CRM operations with conditional logic'
  },
  {
    name: 'Contract Processing Pipeline',
    prompt: 'Upload contracts, extract data, summarize, store in cloud',
    expectedComponents: ['webhook', 'ollama', 'aws_s3'],
    description: 'File upload → extraction → AI summarization → cloud storage'
  },
  {
    name: 'AI Chatbot with Memory & APIs',
    prompt: 'Build AI chatbot that remembers users and can call APIs.',
    expectedComponents: ['webhook', 'ollama', 'memory', 'http_request'],
    description: 'Chatbot with memory and API integration'
  },
  {
    name: 'Payment Reconciliation',
    prompt: 'Reconcile all payments daily and flag mismatches',
    expectedComponents: ['schedule', 'stripe', 'postgresql', 'if_else', 'email'],
    description: 'Scheduled reconciliation with conditional flagging'
  },
  {
    name: 'Email to Calendar Automation',
    prompt: 'Auto-schedule meetings from emails and update calendar',
    expectedComponents: ['google_gmail', 'ollama', 'google_calendar'],
    description: 'Email parsing → AI extraction → calendar update'
  },
  {
    name: 'User Analytics & Engagement',
    prompt: 'Track new users, onboarding, churn risk and engagement',
    expectedComponents: ['webhook', 'postgresql', 'ollama', 'slack_message'],
    description: 'User tracking → AI analysis → notifications'
  },
  {
    name: 'Conditional Webhook Routing',
    prompt: 'Route incoming webhooks to multiple services conditionally.',
    expectedComponents: ['webhook', 'if_else', 'http_request', 'slack_message'],
    description: 'Webhook routing with conditional logic'
  },
  {
    name: 'Data Migration Pipeline',
    prompt: 'Migrate legacy data into modern system',
    expectedComponents: ['postgresql', 'database_read', 'database_write'],
    description: 'Data extraction → transformation → migration'
  },
  {
    name: 'Error Detection & Recovery',
    prompt: 'Detect workflow errors, retry, notify, and auto-recover',
    expectedComponents: ['error_handler', 'retry', 'email', 'try_catch'],
    description: 'Error handling with retry and notification'
  }
];

async function testComplexPrompts() {
  console.log('🧪 Testing Complex Real-World Prompts\n');
  console.log('='.repeat(80));
  
  const clarifier = new AIIntentClarifier();
  let passedTests = 0;
  let failedTests = 0;
  const failures: Array<{name: string; issues: string[]}> = [];
  
  for (const testCase of complexTestCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`   Prompt: "${testCase.prompt}"`);
    console.log(`   Expected Components: ${testCase.expectedComponents.join(', ')}`);
    console.log(`   ${testCase.description}\n`);
    
    try {
      // Simulate the fallback scenario
      const allKeywords = await clarifier['keywordCollector'].getAllAliasKeywords();
      const keywordStrings = allKeywords.map(k => k.keyword);
      
      // Extract node types from prompt
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
      
      console.log(`   ✅ Extracted nodes: ${extractedNodeTypes.length} nodes`);
      
      if (extractedNodeTypes.length === 0) {
        console.log(`   ⚠️  No nodes extracted - potential issue`);
        failures.push({ name: testCase.name, issues: ['No nodes extracted from prompt'] });
        failedTests++;
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
      const issues: string[] = [];
      
      for (let i = 0; i < result.promptVariations.length; i++) {
        const variation = result.promptVariations[i];
        const variationLower = variation.prompt.toLowerCase();
        const chain = variation.keywords;
        
        // Check if variation includes expected components
        const missingComponents: string[] = [];
        for (const expected of testCase.expectedComponents) {
          const expectedLower = expected.toLowerCase();
          const found = chain.some(k => k.toLowerCase().includes(expectedLower)) ||
                       variationLower.includes(expectedLower);
          
          if (!found) {
            missingComponents.push(expected);
          }
        }
        
        if (missingComponents.length > 0) {
          console.log(`   ❌ Variation ${i + 1}: Missing components: ${missingComponents.join(', ')}`);
          console.log(`      Chain: ${chain.join(' → ')}`);
          issues.push(`Variation ${i + 1} missing: ${missingComponents.join(', ')}`);
          allVariationsValid = false;
        } else {
          console.log(`   ✅ Variation ${i + 1}: Includes all expected components`);
          console.log(`      Chain: ${chain.join(' → ')}`);
        }
      }
      
      // Check workflow chain completeness
      let chainsComplete = true;
      for (const variation of result.promptVariations) {
        const chain = variation.keywords;
        const hasTrigger = chain.some(k => 
          k.includes('trigger') || k.includes('webhook') || k.includes('schedule')
        );
        const hasAction = chain.length > 1; // At least trigger + one action
        
        if (!hasTrigger || !hasAction) {
          console.log(`   ⚠️  Variation chain incomplete: ${chain.join(' → ')}`);
          issues.push(`Incomplete chain: ${chain.join(' → ')}`);
          chainsComplete = false;
        }
      }
      
      // Check for AI tasks - should use Ollama
      const hasAITask = testCase.prompt.toLowerCase().includes('ai') || 
                       testCase.prompt.toLowerCase().includes('qualify') ||
                       testCase.prompt.toLowerCase().includes('generate') ||
                       testCase.prompt.toLowerCase().includes('summarize') ||
                       testCase.prompt.toLowerCase().includes('chatbot') ||
                       testCase.prompt.toLowerCase().includes('remember');
      
      if (hasAITask) {
        let usesOllama = false;
        for (const variation of result.promptVariations) {
          if (variation.keywords.some(k => k.toLowerCase() === 'ollama')) {
            usesOllama = true;
            break;
          }
        }
        
        if (!usesOllama) {
          console.log(`   ⚠️  AI task detected but Ollama not used`);
          issues.push('AI task should use Ollama but doesn\'t');
        } else {
          console.log(`   ✅ AI task correctly uses Ollama`);
        }
      }
      
      if (allVariationsValid && chainsComplete) {
        console.log(`\n   ✅ TEST PASSED: All variations include required components and have complete chains`);
        passedTests++;
      } else {
        console.log(`\n   ❌ TEST FAILED: Issues found`);
        failures.push({ name: testCase.name, issues });
        failedTests++;
      }
      
    } catch (error) {
      console.error(`   ❌ TEST ERROR: ${error instanceof Error ? error.message : String(error)}`);
      failures.push({ name: testCase.name, issues: [`Error: ${error instanceof Error ? error.message : String(error)}`] });
      failedTests++;
    }
    
    console.log('   ' + '-'.repeat(76));
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Test Summary:');
  console.log(`   ✅ Passed: ${passedTests}/${complexTestCases.length}`);
  console.log(`   ❌ Failed: ${failedTests}/${complexTestCases.length}`);
  console.log(`   📈 Success Rate: ${((passedTests / complexTestCases.length) * 100).toFixed(1)}%\n`);
  
  if (failures.length > 0) {
    console.log('🔍 Failure Analysis:\n');
    for (const failure of failures) {
      console.log(`   ❌ ${failure.name}:`);
      for (const issue of failure.issues) {
        console.log(`      - ${issue}`);
      }
      console.log('');
    }
  }
  
  if (failedTests === 0) {
    console.log('🎉 All tests passed! The universal fallback mechanism handles complex prompts correctly.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Analysis needed for universal fixes.\n');
    process.exit(1);
  }
}

// Run tests
testComplexPrompts().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
