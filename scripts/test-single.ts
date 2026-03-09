#!/usr/bin/env ts-node
/**
 * Run a Single Test Case - Stage 1
 * 
 * Usage:
 *   ts-node worker/scripts/test-single.ts workflow-2
 *   ts-node worker/scripts/test-single.ts workflow-1
 */

import { AIIntentClarifier } from '../src/services/ai/summarize-layer';

const testCases = [
  {
    id: 'workflow-1',
    name: 'AI Omni-Channel Lead Capture & CRM Qualification System',
    userPrompt: 'Capture leads from website, qualify using AI, store in CRM, notify sales, and respond automatically.',
    expectedKeywords: ['webhook', 'ai_chat_model', 'salesforce', 'slack_message', 'google_gmail'],
    expectedMinKeywords: 5,
  },
  {
    id: 'workflow-2',
    name: 'Multi-Channel Social Media AI Content Engine',
    userPrompt: 'Generate AI content daily and post automatically on all social platforms.',
    expectedKeywords: ['schedule', 'ai_chat_model', 'linkedin', 'twitter', 'facebook'],
    expectedMinKeywords: 4,
  },
  {
    id: 'workflow-3',
    name: 'AI Customer Support Ticket Automation System',
    userPrompt: 'Automatically respond to support tickets and escalate critical ones.',
    expectedKeywords: ['webhook', 'freshdesk', 'ai_chat_model', 'switch', 'slack_message'],
    expectedMinKeywords: 4,
  },
  {
    id: 'workflow-4',
    name: 'E-commerce Order → Accounting → Fulfillment Pipeline',
    userPrompt: 'When an order is placed, process payment, update inventory, notify warehouse.',
    expectedKeywords: ['webhook', 'stripe', 'mysql', 'slack_message'],
    expectedMinKeywords: 4,
  },
  {
    id: 'workflow-5',
    name: 'DevOps CI/CD Monitoring & Incident Bot',
    userPrompt: 'Monitor repos and notify team on failures.',
    expectedKeywords: ['github', 'if_else', 'slack_message'],
    expectedMinKeywords: 3,
  },
  {
    id: 'workflow-6',
    name: 'Enterprise Data Sync & Reporting Engine',
    userPrompt: 'Sync CRM, DB, and spreadsheets daily and generate reports.',
    expectedKeywords: ['interval', 'database_read', 'google_sheets', 'airtable'],
    expectedMinKeywords: 4,
  },
  {
    id: 'workflow-7',
    name: 'Advanced Sales Funnel Automation (Multi-CRM)',
    userPrompt: 'Manage leads across multiple CRMs and move them through funnel stages.',
    expectedKeywords: ['zoho_crm', 'pipedrive', 'if_else'],
    expectedMinKeywords: 3,
  },
  {
    id: 'workflow-8',
    name: 'AI Contract & Document Processing Automation',
    userPrompt: 'Upload contracts, extract data, summarize, store in cloud.',
    expectedKeywords: ['read_binary_file', 'ai_chat_model', 'dropbox'],
    expectedMinKeywords: 3,
  },
  {
    id: 'workflow-9',
    name: 'Real-Time Chatbot with Memory + Tools',
    userPrompt: 'Build AI chatbot that remembers users and can call APIs.',
    expectedKeywords: ['chat_trigger', 'ai_agent', 'memory', 'http_request'],
    expectedMinKeywords: 4,
  },
  {
    id: 'workflow-10',
    name: 'Finance & Payment Reconciliation System',
    userPrompt: 'Reconcile all payments daily and flag mismatches.',
    expectedKeywords: ['interval', 'stripe', 'paypal', 'if_else'],
    expectedMinKeywords: 4,
  },
  {
    id: 'workflow-11',
    name: 'Smart Email & Calendar Automation',
    userPrompt: 'Auto-schedule meetings from emails and update calendar.',
    expectedKeywords: ['google_gmail', 'google_calendar'],
    expectedMinKeywords: 2,
  },
  {
    id: 'workflow-12',
    name: 'SaaS User Lifecycle Automation',
    userPrompt: 'Track new users, onboarding, churn risk and engagement.',
    expectedKeywords: ['form', 'database_write', 'ai_chat_model'],
    expectedMinKeywords: 3,
  },
  {
    id: 'workflow-13',
    name: 'Real-Time Webhook Orchestrator Engine',
    userPrompt: 'Route incoming webhooks to multiple services conditionally.',
    expectedKeywords: ['webhook', 'switch', 'http_post'],
    expectedMinKeywords: 3,
  },
  {
    id: 'workflow-14',
    name: 'Bulk Data Migration & Transformation Pipeline',
    userPrompt: 'Migrate legacy data into modern systems.',
    expectedKeywords: ['split_in_batches', 'postgresql', 'mongodb'],
    expectedMinKeywords: 3,
  },
  {
    id: 'workflow-15',
    name: 'Enterprise Incident & Error Recovery System',
    userPrompt: 'Detect workflow errors, retry, notify, and auto-recover.',
    expectedKeywords: ['error_trigger', 'error_handler', 'slack_message'],
    expectedMinKeywords: 3,
  }
];

async function runSingleTest(testId: string) {
  const testCase = testCases.find(tc => tc.id === testId);
  
  if (!testCase) {
    console.error(`❌ Test case "${testId}" not found.`);
    console.log('\nAvailable test cases:');
    testCases.forEach(tc => {
      console.log(`  - ${tc.id}: ${tc.name}`);
    });
    process.exit(1);
  }
  
  console.log('🧪 Running Single Test - Stage 1\n');
  console.log('='.repeat(80));
  console.log(`📋 Test ID: ${testCase.id}`);
  console.log(`📋 Name: ${testCase.name}`);
  console.log(`📋 Prompt: "${testCase.userPrompt}"`);
  console.log(`📋 Expected Keywords: ${testCase.expectedKeywords.join(', ')}`);
  console.log(`📋 Expected Min Keywords: ${testCase.expectedMinKeywords}`);
  console.log('');
  
  const clarifier = new AIIntentClarifier();
  
  try {
    console.log('⏳ Processing...\n');
    const result = await clarifier.clarifyIntentAndGenerateVariations(testCase.userPrompt);
    
    // Extract results
    const extractedKeywords = result.mandatoryNodeTypes || [];
    const variations = result.promptVariations || [];
    const variationsWithKeywords = variations.filter(v => 
      v.keywords && v.keywords.length > 0
    );
    
    // Display results
    console.log('✅ RESULTS\n');
    console.log('='.repeat(80));
    
    // Keywords
    console.log('📌 EXTRACTED KEYWORDS:');
    if (extractedKeywords.length > 0) {
      extractedKeywords.forEach((keyword, idx) => {
        console.log(`   ${idx + 1}. ${keyword}`);
      });
    } else {
      console.log('   ⚠️  No keywords extracted');
    }
    console.log('');
    
    // Variations
    console.log(`📝 PROMPT VARIATIONS (${variations.length}):\n`);
    variations.forEach((variation, idx) => {
      console.log(`   Variation ${idx + 1} (ID: ${variation.id}):`);
      console.log(`   ──────────────────────────────────────────────────────────────`);
      console.log(`   Prompt: "${variation.prompt}"`);
      console.log(`   Keywords: ${variation.keywords && variation.keywords.length > 0 ? variation.keywords.join(', ') : 'None'}`);
      console.log(`   Confidence: ${variation.confidence}`);
      console.log(`   Reasoning: ${variation.reasoning || 'N/A'}`);
      console.log('');
    });
    
    // Validation
    console.log('🔍 VALIDATION:\n');
    
    // Check 1: Keywords extracted
    if (extractedKeywords.length === 0) {
      console.log('   ❌ No keywords extracted from prompt');
    } else if (extractedKeywords.length < testCase.expectedMinKeywords) {
      console.log(`   ⚠️  Only ${extractedKeywords.length} keywords extracted (expected at least ${testCase.expectedMinKeywords})`);
    } else {
      console.log(`   ✅ ${extractedKeywords.length} keywords extracted (expected at least ${testCase.expectedMinKeywords})`);
    }
    
    // Check 2: Variations generated
    if (variations.length === 0) {
      console.log('   ❌ No variations generated');
    } else if (variations.length < 4) {
      console.log(`   ⚠️  Only ${variations.length} variations generated (expected 4)`);
    } else {
      console.log(`   ✅ ${variations.length} variations generated`);
    }
    
    // Check 3: Keywords in variations
    if (variationsWithKeywords.length === 0) {
      console.log('   ❌ No variations have keywords field populated');
    } else if (variationsWithKeywords.length < variations.length) {
      console.log(`   ⚠️  Only ${variationsWithKeywords.length}/${variations.length} variations have keywords`);
    } else {
      console.log(`   ✅ All ${variations.length} variations have keywords`);
    }
    
    // Check 4: Expected keywords present
    const foundExpectedKeywords = testCase.expectedKeywords.filter(expected =>
      extractedKeywords.some(extracted => 
        extracted.toLowerCase().includes(expected.toLowerCase()) ||
        expected.toLowerCase().includes(extracted.toLowerCase())
      )
    );
    
    if (foundExpectedKeywords.length === 0) {
      console.log(`   ⚠️  None of the expected keywords found (expected: ${testCase.expectedKeywords.join(', ')})`);
    } else {
      console.log(`   ✅ ${foundExpectedKeywords.length}/${testCase.expectedKeywords.length} expected keywords found: ${foundExpectedKeywords.join(', ')}`);
    }
    
    // Check 5: Keywords naturally integrated
    const variationsWithNaturalKeywords = variations.filter(v => {
      if (!v.keywords || v.keywords.length === 0) return false;
      const promptLower = v.prompt.toLowerCase();
      return v.keywords.some(keyword => 
        promptLower.includes(keyword.toLowerCase()) ||
        promptLower.includes(keyword.replace(/_/g, ' ').toLowerCase())
      );
    });
    
    if (variationsWithNaturalKeywords.length < variations.length) {
      console.log(`   ⚠️  Only ${variationsWithNaturalKeywords.length}/${variations.length} variations have keywords naturally integrated in text`);
    } else {
      console.log(`   ✅ All variations have keywords naturally integrated in text`);
    }
    
    // Check 6: No hardcoded examples
    const hasHardcoded = variations.some(v => {
      const promptLower = v.prompt.toLowerCase();
      return (promptLower.includes('google_sheets') && !extractedKeywords.some(k => k.includes('sheets'))) ||
             (promptLower.includes('google_gmail') && !extractedKeywords.some(k => k.includes('gmail'))) ||
             (promptLower.includes('linkedin') && !extractedKeywords.some(k => k.includes('linkedin')));
    });
    
    if (!hasHardcoded) {
      console.log(`   ✅ No hardcoded node examples detected (using extracted keywords)`);
    } else {
      console.log(`   ⚠️  Possible hardcoded examples detected`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Test Complete\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Get test ID from command line
const testId = process.argv[2];

if (!testId) {
  console.error('❌ Please provide a test ID');
  console.log('\nUsage: ts-node worker/scripts/test-single.ts <test-id>');
  console.log('\nAvailable test cases:');
  testCases.forEach(tc => {
    console.log(`  - ${tc.id}: ${tc.name}`);
  });
  process.exit(1);
}

runSingleTest(testId)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
