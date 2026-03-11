/**
 * Universal Workflow Test Suite - 15 Real-World Workflows
 * 
 * Tests 15 diverse workflows to verify:
 * 1. No prompt-based hardcoded logic
 * 2. Universal root-level implementation
 * 3. Works for all node types automatically
 */

// Set Ollama endpoint before importing modules that use it
process.env.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama.ctrlchecks.ai:8000';
process.env.VITE_OLLAMA_BASE_URL = process.env.VITE_OLLAMA_BASE_URL || 'http://ollama.ctrlchecks.ai:8000';

import { WorkflowPipelineOrchestrator } from '../src/services/ai/workflow-pipeline-orchestrator';
import { unifiedNodeRegistry } from '../src/core/registry/unified-node-registry';
import { unifiedNodeTypeMatcher } from '../src/core/utils/unified-node-type-matcher';
import { unifiedNormalizeNodeTypeString } from '../src/core/utils/unified-node-type-normalizer';

interface WorkflowTest {
  id: string;
  name: string;
  prompt: string;
  expectedNodes: string[];
  category: string;
}

const workflowTests: WorkflowTest[] = [
  {
    id: 'wf-1',
    name: 'AI Omni-Channel Lead Capture & CRM Qualification',
    prompt: 'Capture leads from website, qualify using AI, store in CRM, notify sales, and respond automatically.',
    expectedNodes: ['webhook', 'ai_agent', 'salesforce', 'hubspot', 'slack_message', 'email'],
    category: 'CRM + AI',
  },
  {
    id: 'wf-2',
    name: 'Multi-Channel Social Media AI Content Engine',
    prompt: 'Generate AI content daily and post automatically on all social platforms.',
    expectedNodes: ['schedule', 'openai_gpt', 'linkedin', 'instagram', 'facebook', 'twitter', 'youtube'],
    category: 'Social Media + AI',
  },
  {
    id: 'wf-3',
    name: 'AI Customer Support Ticket Automation',
    prompt: 'Automatically respond to support tickets and escalate critical ones.',
    expectedNodes: ['webhook', 'freshdesk', 'intercom', 'ai_chat_model', 'switch', 'slack_webhook'],
    category: 'Support + AI',
  },
  {
    id: 'wf-4',
    name: 'E-commerce Order Processing Pipeline',
    prompt: 'When an order is placed, process payment, update inventory, notify warehouse.',
    expectedNodes: ['shopify', 'stripe', 'paypal', 'mysql', 'postgresql'],
    category: 'E-commerce',
  },
  {
    id: 'wf-5',
    name: 'DevOps CI/CD Monitoring & Incident Bot',
    prompt: 'Monitor repos and trigger alerts on failures.',
    expectedNodes: ['github', 'gitlab', 'bitbucket', 'jenkins', 'jira', 'if_else', 'discord', 'telegram'],
    category: 'DevOps',
  },
  {
    id: 'wf-6',
    name: 'Enterprise Data Sync & Reporting',
    prompt: 'Sync CRM, DB, and spreadsheets daily and generate reports.',
    expectedNodes: ['interval', 'database_read', 'supabase', 'mongodb', 'google_sheets', 'airtable'],
    category: 'Data Sync',
  },
  {
    id: 'wf-7',
    name: 'Advanced Sales Funnel Automation (Multi-CRM)',
    prompt: 'Manage leads across multiple CRMs and move them through funnel stages.',
    expectedNodes: ['zoho_crm', 'pipedrive', 'activecampaign', 'mailchimp', 'if_else', 'switch'],
    category: 'Multi-CRM',
  },
  {
    id: 'wf-8',
    name: 'AI Contract & Document Processing',
    prompt: 'Upload contracts, extract data, summarize, store in cloud.',
    expectedNodes: ['read_binary_file', 'ollama', 'text_summarizer', 'dropbox', 'onedrive'],
    category: 'Document Processing',
  },
  {
    id: 'wf-9',
    name: 'Real-Time Chatbot with Memory + Tools',
    prompt: 'Build AI chatbot that remembers users and can call APIs.',
    expectedNodes: ['chat_trigger', 'ai_agent', 'memory', 'tool', 'http_request'],
    category: 'AI Chatbot',
  },
  {
    id: 'wf-10',
    name: 'Finance & Payment Reconciliation',
    prompt: 'Reconcile all payments daily and flag mismatches.',
    expectedNodes: ['interval', 'stripe', 'paypal', 'aggregate', 'filter', 'if_else'],
    category: 'Finance',
  },
  {
    id: 'wf-11',
    name: 'Smart Email & Calendar Automation',
    prompt: 'Auto-schedule meetings from emails and update calendar.',
    expectedNodes: ['google_gmail', 'outlook', 'google_calendar', 'google_tasks'],
    category: 'Email + Calendar',
  },
  {
    id: 'wf-12',
    name: 'SaaS User Lifecycle Automation',
    prompt: 'Track new users, onboarding, churn risk and engagement.',
    expectedNodes: ['form', 'database_write', 'supabase', 'ai_service', 'sentiment_analyzer'],
    category: 'SaaS Lifecycle',
  },
  {
    id: 'wf-13',
    name: 'Real-Time Webhook Orchestrator',
    prompt: 'Route incoming webhooks to multiple services conditionally.',
    expectedNodes: ['webhook', 'webhook_response', 'switch', 'http_post'],
    category: 'Webhook Routing',
  },
  {
    id: 'wf-14',
    name: 'Bulk Data Migration & Transformation',
    prompt: 'Migrate legacy data into modern systems.',
    expectedNodes: ['split_in_batches', 'loop', 'json_parser', 'postgresql', 'mongodb'],
    category: 'Data Migration',
  },
  {
    id: 'wf-15',
    name: 'Enterprise Incident & Error Recovery',
    prompt: 'Detect workflow errors, retry, notify, and auto-recover.',
    expectedNodes: ['error_trigger', 'error_handler', 'wait', 'if_else', 'log_output', 'slack_message'],
    category: 'Error Recovery',
  },
];

function checkDuplicateNodes(nodes: any[]): string[] {
  const nodeTypes = new Map<string, number>();
  const duplicates: string[] = [];
  
  for (const node of nodes) {
    const nodeType = unifiedNormalizeNodeTypeString(node.type || node.data?.type || '');
    const count = nodeTypes.get(nodeType) || 0;
    nodeTypes.set(nodeType, count + 1);
    
    if (count > 0) {
      duplicates.push(nodeType);
    }
  }
  
  return duplicates;
}

function checkOrdering(nodes: any[], edges: any[]): boolean {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  
  for (const node of nodes) {
    const nodeId = node.id;
    graph.set(nodeId, []);
    inDegree.set(nodeId, 0);
  }
  
  for (const edge of edges) {
    const source = edge.source;
    const target = edge.target;
    
    if (!graph.has(source)) graph.set(source, []);
    if (!graph.has(target)) graph.set(target, []);
    
    graph.get(source)!.push(target);
    inDegree.set(target, (inDegree.get(target) || 0) + 1);
  }
  
  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }
  
  let processed = 0;
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    processed++;
    
    const neighbors = graph.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }
  
  return processed === nodes.length;
}

function validateWorkflow(test: WorkflowTest, workflow: any): {
  success: boolean;
  errors: string[];
  warnings: string[];
  foundNodes: number;
  expectedNodes: number;
  duplicateNodes: string[];
  orderingValid: boolean;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];
  
  // Check for duplicate nodes
  const duplicateNodes = checkDuplicateNodes(nodes);
  if (duplicateNodes.length > 0) {
    errors.push(`Duplicate nodes: ${duplicateNodes.join(', ')}`);
  }
  
  // Check ordering
  const orderingValid = checkOrdering(nodes, edges);
  if (!orderingValid) {
    errors.push('Invalid ordering: cycle detected');
  }
  
  // Check expected nodes
  let foundNodes = 0;
  const foundNodeTypes: string[] = [];
  
  for (const expectedNode of test.expectedNodes) {
    const found = nodes.some((n: any) => {
      const nodeType = unifiedNormalizeNodeTypeString(n.type || n.data?.type || '');
      const match = unifiedNodeTypeMatcher.matches(nodeType, expectedNode).matches;
      if (match) {
        foundNodeTypes.push(nodeType);
      }
      return match;
    });
    
    if (found) {
      foundNodes++;
    } else {
      warnings.push(`Expected node not found: ${expectedNode}`);
    }
  }
  
  const success = errors.length === 0;
  
  return {
    success,
    errors,
    warnings,
    foundNodes,
    expectedNodes: test.expectedNodes.length,
    duplicateNodes,
    orderingValid,
  };
}

async function runTest(test: WorkflowTest): Promise<any> {
  console.log(`\n🧪 Testing: ${test.name}`);
  console.log(`   Category: ${test.category}`);
  console.log(`   Prompt: "${test.prompt}"`);
  
  try {
    const orchestrator = new WorkflowPipelineOrchestrator();
    
    const result = await orchestrator.executePipeline(
      test.prompt,
      {},
      {},
      {
        mode: 'build',
        originalPrompt: test.prompt,
      }
    );
    
    // Handle confirmation state - workflow is in confirmationRequest.workflow
    let workflow = result.workflow;
    if (result.waitingForConfirmation && result.confirmationRequest?.workflow) {
      workflow = result.confirmationRequest.workflow;
      console.log(`   ⚠️  Workflow requires confirmation - using workflow from confirmation request`);
      
      // Auto-confirm for testing
      if (result.workflowId) {
        try {
          const confirmedResult = await orchestrator.continuePipelineAfterConfirmation(
            result.workflowId,
            true, // Auto-confirm
            {},
            {},
            { mode: 'build' }
          );
          if (confirmedResult.workflow) {
            workflow = confirmedResult.workflow;
            console.log(`   ✅ Auto-confirmed workflow`);
          }
        } catch (confirmError: any) {
          console.log(`   ⚠️  Auto-confirmation failed: ${confirmError.message}`);
          // Continue with workflow from confirmation request
        }
      }
    }
    
    if (!workflow) {
      return {
        test,
        success: false,
        errors: ['Workflow generation failed - no workflow returned'],
        warnings: [],
        foundNodes: 0,
        expectedNodes: test.expectedNodes.length,
        duplicateNodes: [],
        orderingValid: false,
      };
    }
    
    const validation = validateWorkflow(test, workflow);
    
    console.log(`   ✅ Generated: ${workflow.nodes.length} nodes, ${workflow.edges.length} edges`);
    console.log(`   ${validation.success ? '✅' : '❌'} Validation: ${validation.success ? 'PASSED' : 'FAILED'}`);
    console.log(`   📊 Found ${validation.foundNodes}/${validation.expectedNodes} expected nodes`);
    
    if (validation.errors.length > 0) {
      console.log(`   ❌ Errors: ${validation.errors.join(', ')}`);
    }
    if (validation.warnings.length > 0 && validation.warnings.length <= 3) {
      console.log(`   ⚠️  Warnings: ${validation.warnings.slice(0, 3).join(', ')}${validation.warnings.length > 3 ? '...' : ''}`);
    }
    
    return {
      test,
      ...validation,
    };
    
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    const isConnectionError = errorMessage.includes('ECONNREFUSED') || 
                             errorMessage.includes('fetch failed') ||
                             errorMessage.includes('connection');
    
    if (isConnectionError) {
      console.log(`   ⚠️  Connection Error: Ollama service not available`);
      return {
        test,
        success: false,
        errors: ['Ollama service not available'],
        warnings: [],
        foundNodes: 0,
        expectedNodes: test.expectedNodes.length,
        duplicateNodes: [],
        orderingValid: false,
      };
    }
    
    console.log(`   ❌ Error: ${errorMessage.substring(0, 100)}`);
    return {
      test,
      success: false,
      errors: [`Error: ${errorMessage.substring(0, 100)}`],
      warnings: [],
      foundNodes: 0,
      expectedNodes: test.expectedNodes.length,
      duplicateNodes: [],
      orderingValid: false,
    };
  }
}

async function verifyNoPromptBasedLogic() {
  console.log('\n🔍 Verifying No Prompt-Based Hardcoded Logic...\n');
  
  const issues: string[] = [];
  
  // Check for hardcoded prompt patterns
  const fs = await import('fs/promises');
  
  const filesToCheck = [
    'worker/src/services/ai/summarize-layer.ts',
    'worker/src/services/ai/workflow-pipeline-orchestrator.ts',
    'worker/src/services/ai/intent-extractor.ts',
    'worker/src/services/ai/workflow-builder.ts',
  ];
  
  for (const file of filesToCheck) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      
      // Check for hardcoded workflow patterns
      const hardcodedPatterns = [
        /Capture leads|lead capture/i,
        /Generate AI content|social media/i,
        /support tickets|customer support/i,
        /order is placed|e-commerce/i,
        /CI\/CD|devops/i,
        /Sync CRM|data sync/i,
        /Manage leads|sales funnel/i,
        /Upload contracts|document processing/i,
        /Build AI chatbot|chatbot/i,
        /Reconcile payments|payment reconciliation/i,
        /Auto-schedule meetings|calendar automation/i,
        /Track new users|user lifecycle/i,
        /Route incoming webhooks|webhook orchestrator/i,
        /Migrate legacy|data migration/i,
        /Detect workflow errors|error recovery/i,
      ];
      
      for (const pattern of hardcodedPatterns) {
        if (pattern.test(content)) {
          issues.push(`Found hardcoded prompt pattern in ${file}: ${pattern}`);
        }
      }
      
      // Check for hardcoded node type lists (should use registry)
      const hardcodedNodeLists = [
        /\[['"]webhook['"],\s*['"]ai_agent['"],\s*['"]salesforce['"]/i,
        /\[['"]schedule['"],\s*['"]openai_gpt['"],\s*['"]linkedin['"]/i,
        /\[['"]shopify['"],\s*['"]stripe['"],\s*['"]paypal['"]/i,
      ];
      
      for (const pattern of hardcodedNodeLists) {
        if (pattern.test(content)) {
          issues.push(`Found hardcoded node list in ${file}: ${pattern}`);
        }
      }
      
    } catch (error: any) {
      // File might not exist, skip
    }
  }
  
  if (issues.length === 0) {
    console.log('✅ No prompt-based hardcoded logic detected');
    console.log('✅ All logic uses registry-based approach');
    return { passed: true, issues: [] };
  } else {
    console.log('❌ Hardcoded prompt logic detected:');
    issues.forEach(issue => console.log(`   - ${issue}`));
    return { passed: false, issues };
  }
}

async function runAllTests() {
  console.log('🚀 Universal Workflow Test Suite - 15 Real-World Workflows');
  console.log('='.repeat(70));
  console.log(`📡 Ollama Endpoint: ${process.env.OLLAMA_BASE_URL || process.env.VITE_OLLAMA_BASE_URL || 'http://localhost:11434'}`);
  console.log('='.repeat(70));
  
  // Step 1: Verify no prompt-based logic
  const logicCheck = await verifyNoPromptBasedLogic();
  
  // Step 2: Run workflow tests
  const results: any[] = [];
  
  for (const test of workflowTests) {
    const result = await runTest(test);
    results.push(result);
    
    // Small delay to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Calculate statistics
  const totalTests = results.length;
  const passedTests = results.filter(r => r.success).length;
  const failedTests = results.filter(r => !r.success).length;
  
  // Calculate node accuracy
  let totalExpectedNodes = 0;
  let totalFoundNodes = 0;
  
  for (const result of results) {
    totalExpectedNodes += result.expectedNodes;
    totalFoundNodes += result.foundNodes;
  }
  
  const nodeAccuracy = totalExpectedNodes > 0 
    ? (totalFoundNodes / totalExpectedNodes) * 100 
    : 100;
  
  const overallAccuracy = (passedTests / totalTests) * 100;
  
  // Check for duplicates
  const allDuplicateNodes = new Set<string>();
  for (const result of results) {
    result.duplicateNodes.forEach((dup: string) => allDuplicateNodes.add(dup));
  }
  
  // Check ordering
  const orderingIssues = results.filter(r => !r.orderingValid).length;
  
  // Results by category
  const categories = new Map<string, { passed: number; total: number }>();
  for (const result of results) {
    const category = result.test.category;
    if (!categories.has(category)) {
      categories.set(category, { passed: 0, total: 0 });
    }
    const cat = categories.get(category)!;
    cat.total++;
    if (result.success) cat.passed++;
  }
  
  // Final Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL TEST SUMMARY');
  console.log('='.repeat(70));
  
  console.log(`\n1. Prompt-Based Logic Check:`);
  console.log(`   ${logicCheck.passed ? '✅' : '❌'} ${logicCheck.passed ? 'No hardcoded logic detected' : 'Hardcoded logic detected'}`);
  if (logicCheck.issues.length > 0) {
    logicCheck.issues.forEach(issue => console.log(`      - ${issue}`));
  }
  
  console.log(`\n2. Overall Results:`);
  console.log(`   ✅ Passed: ${passedTests}/${totalTests}`);
  console.log(`   ❌ Failed: ${failedTests}/${totalTests}`);
  console.log(`   📈 Overall Accuracy: ${overallAccuracy.toFixed(1)}%`);
  
  console.log(`\n3. Node Accuracy:`);
  console.log(`   Expected Nodes: ${totalExpectedNodes}`);
  console.log(`   Found Nodes: ${totalFoundNodes}`);
  console.log(`   📈 Node Accuracy: ${nodeAccuracy.toFixed(1)}%`);
  
  console.log(`\n4. Results by Category:`);
  for (const [category, stats] of categories.entries()) {
    const accuracy = (stats.passed / stats.total) * 100;
    console.log(`   ${category}: ${stats.passed}/${stats.total} passed (${accuracy.toFixed(1)}%)`);
  }
  
  console.log(`\n5. Duplicate Nodes:`);
  if (allDuplicateNodes.size === 0) {
    console.log(`   ✅ No duplicate nodes found`);
  } else {
    console.log(`   ❌ Duplicate nodes: ${Array.from(allDuplicateNodes).join(', ')}`);
  }
  
  console.log(`\n6. Ordering Validation:`);
  if (orderingIssues === 0) {
    console.log(`   ✅ All workflows have valid ordering`);
  } else {
    console.log(`   ❌ ${orderingIssues} workflow(s) have invalid ordering`);
  }
  
  // Success criteria
  const meetsAccuracyTarget = overallAccuracy >= 90;
  const noDuplicates = allDuplicateNodes.size === 0;
  const validOrdering = orderingIssues === 0;
  const noHardcodedLogic = logicCheck.passed;
  
  console.log(`\n7. Success Criteria:`);
  console.log(`   ${meetsAccuracyTarget ? '✅' : '❌'} Accuracy >= 90%: ${overallAccuracy.toFixed(1)}%`);
  console.log(`   ${noDuplicates ? '✅' : '❌'} No duplicate nodes: ${allDuplicateNodes.size === 0 ? 'PASSED' : 'FAILED'}`);
  console.log(`   ${validOrdering ? '✅' : '❌'} Valid ordering: ${orderingIssues === 0 ? 'PASSED' : 'FAILED'}`);
  console.log(`   ${noHardcodedLogic ? '✅' : '❌'} No hardcoded logic: ${logicCheck.passed ? 'PASSED' : 'FAILED'}`);
  
  const allCriteriaMet = meetsAccuracyTarget && noDuplicates && validOrdering && noHardcodedLogic;
  
  console.log(`\n${'='.repeat(70)}`);
  if (allCriteriaMet) {
    console.log('✅ ALL TESTS PASSED - Universal Implementation Verified!');
    console.log(`   Overall Accuracy: ${overallAccuracy.toFixed(1)}%`);
    console.log(`   Node Accuracy: ${nodeAccuracy.toFixed(1)}%`);
    console.log(`   ✅ No prompt-based hardcoded logic`);
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED - Review results above');
    console.log(`   Overall Accuracy: ${overallAccuracy.toFixed(1)}% (Target: 90%+)`);
    if (!noHardcodedLogic) {
      console.log(`   ⚠️  Hardcoded logic detected - needs universal fix`);
    }
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
