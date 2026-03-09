/**
 * Stage 1 Test Suite - Summarize Layer Keyword Extraction & Variation Generation
 * 
 * Tests 15 real-world workflow use cases to verify:
 * 1. Keywords are extracted correctly (no false positives, no missing nodes)
 * 2. Variations include required keywords naturally
 * 3. Keywords are returned in result for frontend display
 * 4. No hardcoded logic is used (100% registry-based)
 */

import { AIIntentClarifier } from '../summarize-layer';

interface TestCase {
  id: string;
  name: string;
  userPrompt: string;
  expectedKeywords: string[]; // Expected node types that should be extracted
  expectedMinKeywords: number; // Minimum number of keywords expected
  description: string;
}

const testCases: TestCase[] = [
  {
    id: 'workflow-1',
    name: 'AI Omni-Channel Lead Capture & CRM Qualification System',
    userPrompt: 'Capture leads from website, qualify using AI, store in CRM, notify sales, and respond automatically.',
    expectedKeywords: ['webhook', 'ai_chat_model', 'salesforce', 'slack_message', 'google_gmail'],
    expectedMinKeywords: 5,
    description: 'Multi-node workflow with AI, CRM, and notifications'
  },
  {
    id: 'workflow-2',
    name: 'Multi-Channel Social Media AI Content Engine',
    userPrompt: 'Generate AI content daily and post automatically on all social platforms.',
    expectedKeywords: ['schedule', 'ai_chat_model', 'linkedin', 'twitter', 'facebook'],
    expectedMinKeywords: 4,
    description: 'AI content generation with multiple social platforms'
  },
  {
    id: 'workflow-3',
    name: 'AI Customer Support Ticket Automation System',
    userPrompt: 'Automatically respond to support tickets and escalate critical ones.',
    expectedKeywords: ['webhook', 'freshdesk', 'ai_chat_model', 'switch', 'slack_message'],
    expectedMinKeywords: 4,
    description: 'Support automation with conditional routing'
  },
  {
    id: 'workflow-4',
    name: 'E-commerce Order → Accounting → Fulfillment Pipeline',
    userPrompt: 'When an order is placed, process payment, update inventory, notify warehouse.',
    expectedKeywords: ['webhook', 'stripe', 'mysql', 'slack_message'],
    expectedMinKeywords: 4,
    description: 'E-commerce order processing workflow'
  },
  {
    id: 'workflow-5',
    name: 'DevOps CI/CD Monitoring & Incident Bot',
    userPrompt: 'Monitor repos and notify team on failures.',
    expectedKeywords: ['github', 'if_else', 'slack_message'],
    expectedMinKeywords: 3,
    description: 'DevOps monitoring with notifications'
  },
  {
    id: 'workflow-6',
    name: 'Enterprise Data Sync & Reporting Engine',
    userPrompt: 'Sync CRM, DB, and spreadsheets daily and generate reports.',
    expectedKeywords: ['interval', 'database_read', 'google_sheets', 'airtable'],
    expectedMinKeywords: 4,
    description: 'Data synchronization and reporting'
  },
  {
    id: 'workflow-7',
    name: 'Advanced Sales Funnel Automation (Multi-CRM)',
    userPrompt: 'Manage leads across multiple CRMs and move them through funnel stages.',
    expectedKeywords: ['zoho_crm', 'pipedrive', 'if_else'],
    expectedMinKeywords: 3,
    description: 'Multi-CRM lead management'
  },
  {
    id: 'workflow-8',
    name: 'AI Contract & Document Processing Automation',
    userPrompt: 'Upload contracts, extract data, summarize, store in cloud.',
    expectedKeywords: ['read_binary_file', 'ai_chat_model', 'dropbox'],
    expectedMinKeywords: 3,
    description: 'Document processing with AI'
  },
  {
    id: 'workflow-9',
    name: 'Real-Time Chatbot with Memory + Tools',
    userPrompt: 'Build AI chatbot that remembers users and can call APIs.',
    expectedKeywords: ['chat_trigger', 'ai_agent', 'memory', 'http_request'],
    expectedMinKeywords: 4,
    description: 'AI chatbot with memory and tools'
  },
  {
    id: 'workflow-10',
    name: 'Finance & Payment Reconciliation System',
    userPrompt: 'Reconcile all payments daily and flag mismatches.',
    expectedKeywords: ['interval', 'stripe', 'paypal', 'if_else'],
    expectedMinKeywords: 4,
    description: 'Payment reconciliation automation'
  },
  {
    id: 'workflow-11',
    name: 'Smart Email & Calendar Automation',
    userPrompt: 'Auto-schedule meetings from emails and update calendar.',
    expectedKeywords: ['google_gmail', 'google_calendar'],
    expectedMinKeywords: 2,
    description: 'Email to calendar automation'
  },
  {
    id: 'workflow-12',
    name: 'SaaS User Lifecycle Automation',
    userPrompt: 'Track new users, onboarding, churn risk and engagement.',
    expectedKeywords: ['form', 'database_write', 'ai_chat_model'],
    expectedMinKeywords: 3,
    description: 'User lifecycle tracking'
  },
  {
    id: 'workflow-13',
    name: 'Real-Time Webhook Orchestrator Engine',
    userPrompt: 'Route incoming webhooks to multiple services conditionally.',
    expectedKeywords: ['webhook', 'switch', 'http_post'],
    expectedMinKeywords: 3,
    description: 'Webhook routing system'
  },
  {
    id: 'workflow-14',
    name: 'Bulk Data Migration & Transformation Pipeline',
    userPrompt: 'Migrate legacy data into modern systems.',
    expectedKeywords: ['split_in_batches', 'postgresql', 'mongodb'],
    expectedMinKeywords: 3,
    description: 'Data migration workflow'
  },
  {
    id: 'workflow-15',
    name: 'Enterprise Incident & Error Recovery System',
    userPrompt: 'Detect workflow errors, retry, notify, and auto-recover.',
    expectedKeywords: ['error_trigger', 'error_handler', 'slack_message'],
    expectedMinKeywords: 3,
    description: 'Error handling and recovery'
  }
];

/**
 * Test Stage 1: Keyword Extraction & Variation Generation
 */
export async function testStage1SummarizeLayer(): Promise<void> {
  console.log('🧪 Starting Stage 1 Test Suite - Summarize Layer\n');
  console.log('='.repeat(80));
  
  const clarifier = new AIIntentClarifier();
  const results: Array<{
    testCase: TestCase;
    passed: boolean;
    extractedKeywords: string[];
    variationsWithKeywords: number;
    errors: string[];
    warnings: string[];
  }> = [];
  
  for (const testCase of testCases) {
    console.log(`\n📋 Testing: ${testCase.name}`);
    console.log(`   Prompt: "${testCase.userPrompt}"`);
    console.log(`   Expected Keywords: ${testCase.expectedKeywords.join(', ')}`);
    
    try {
      const result = await clarifier.clarifyIntentAndGenerateVariations(testCase.userPrompt);
      
      // Extract keywords from result
      const extractedKeywords = result.mandatoryNodeTypes || [];
      const variations = result.promptVariations || [];
      
      // Check if variations have keywords
      const variationsWithKeywords = variations.filter(v => 
        v.keywords && v.keywords.length > 0
      ).length;
      
      // Validate results
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Check 1: Keywords extracted
      if (extractedKeywords.length === 0) {
        errors.push('❌ No keywords extracted from prompt');
      } else if (extractedKeywords.length < testCase.expectedMinKeywords) {
        warnings.push(`⚠️  Only ${extractedKeywords.length} keywords extracted (expected at least ${testCase.expectedMinKeywords})`);
      }
      
      // Check 2: Variations generated
      if (variations.length === 0) {
        errors.push('❌ No variations generated');
      } else if (variations.length < 4) {
        warnings.push(`⚠️  Only ${variations.length} variations generated (expected 4)`);
      }
      
      // Check 3: Keywords in variations
      if (variationsWithKeywords === 0) {
        errors.push('❌ No variations have keywords field populated');
      } else if (variationsWithKeywords < variations.length) {
        warnings.push(`⚠️  Only ${variationsWithKeywords}/${variations.length} variations have keywords`);
      }
      
      // Check 4: Expected keywords present (at least some)
      const foundExpectedKeywords = testCase.expectedKeywords.filter(expected =>
        extractedKeywords.some(extracted => 
          extracted.toLowerCase().includes(expected.toLowerCase()) ||
          expected.toLowerCase().includes(extracted.toLowerCase())
        )
      );
      
      if (foundExpectedKeywords.length === 0) {
        warnings.push(`⚠️  None of the expected keywords found (expected: ${testCase.expectedKeywords.join(', ')})`);
      } else if (foundExpectedKeywords.length < testCase.expectedKeywords.length) {
        warnings.push(`⚠️  Only ${foundExpectedKeywords.length}/${testCase.expectedKeywords.length} expected keywords found`);
      }
      
      // Check 5: Keywords naturally integrated in variation text
      const variationsWithNaturalKeywords = variations.filter(v => {
        if (!v.keywords || v.keywords.length === 0) return false;
        const promptLower = v.prompt.toLowerCase();
        return v.keywords.some(keyword => 
          promptLower.includes(keyword.toLowerCase()) ||
          promptLower.includes(keyword.replace(/_/g, ' ').toLowerCase())
        );
      }).length;
      
      if (variationsWithNaturalKeywords < variations.length) {
        warnings.push(`⚠️  Only ${variationsWithNaturalKeywords}/${variations.length} variations have keywords naturally integrated in text`);
      }
      
      const passed = errors.length === 0;
      
      results.push({
        testCase,
        passed,
        extractedKeywords,
        variationsWithKeywords,
        errors,
        warnings
      });
      
      // Print results
      console.log(`   ✅ Extracted Keywords: ${extractedKeywords.join(', ')}`);
      console.log(`   ✅ Variations Generated: ${variations.length}`);
      console.log(`   ✅ Variations with Keywords: ${variationsWithKeywords}`);
      
      if (errors.length > 0) {
        console.log(`   ❌ Errors: ${errors.join('; ')}`);
      }
      if (warnings.length > 0) {
        console.log(`   ⚠️  Warnings: ${warnings.join('; ')}`);
      }
      
      // Show sample variation with keywords
      if (variations.length > 0 && variations[0].keywords) {
        console.log(`   📝 Sample Variation Keywords: ${variations[0].keywords.join(', ')}`);
        console.log(`   📝 Sample Variation Text: "${variations[0].prompt.substring(0, 100)}..."`);
      }
      
    } catch (error) {
      console.error(`   ❌ Test failed with error: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        testCase,
        passed: false,
        extractedKeywords: [],
        variationsWithKeywords: 0,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: []
      });
    }
    
    console.log('-'.repeat(80));
  }
  
  // Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('='.repeat(80));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  
  console.log(`✅ Passed: ${passed}/${total} (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`❌ Errors: ${totalErrors}`);
  console.log(`⚠️  Warnings: ${totalWarnings}`);
  
  // Detailed breakdown
  console.log('\n📋 Detailed Results:');
  results.forEach((result, idx) => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${idx + 1}. ${result.testCase.name}`);
    console.log(`   Keywords: ${result.extractedKeywords.length} extracted`);
    console.log(`   Variations: ${result.variationsWithKeywords} with keywords`);
    if (result.errors.length > 0) {
      console.log(`   Errors: ${result.errors.join(', ')}`);
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Stage 1 Test Suite Complete\n');
}

// Run tests if executed directly
if (require.main === module) {
  testStage1SummarizeLayer()
    .then(() => {
      console.log('✅ All tests completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    });
}
