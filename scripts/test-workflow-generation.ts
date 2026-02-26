/**
 * Automated Workflow Generation Testing Script
 * 
 * Tests the workflow builder with comprehensive prompts to validate
 * all node types are generated correctly.
 */

import { AgenticWorkflowBuilder } from '../src/services/ai/workflow-builder';
import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';

interface TestCase {
  id: string;
  name: string;
  prompt: string;
  expectedNodes: string[];
  expectedMinNodes?: number;
  category: string;
  priority: 'high' | 'medium' | 'low';
}

interface TestResult {
  testId: string;
  testName: string;
  prompt: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  generatedNodes: string[];
  missingNodes: string[];
  unexpectedNodes: string[];
  nodeCount: number;
  edgeCount: number;
  hasTrigger: boolean;
  allNodesConnected: boolean;
  executionTime: number;
}

// Test cases covering all node types
const TEST_CASES: TestCase[] = [
  // TRIGGER NODES
  {
    id: 'trigger-001',
    name: 'Webhook Trigger with HubSpot',
    prompt: 'When I receive a POST request to my webhook endpoint, extract the customer email and name from the request body, then create a new contact in HubSpot.',
    expectedNodes: ['webhook', 'set_variable', 'hubspot'],
    category: 'triggers',
    priority: 'high',
  },
  {
    id: 'trigger-002',
    name: 'Chat Trigger with AI and Slack',
    prompt: 'When a user sends a chat message asking about product pricing, use AI to generate a response and send it back via Slack.',
    expectedNodes: ['chat_trigger', 'ai_chat_model', 'slack_message'],
    category: 'triggers',
    priority: 'high',
  },
  {
    id: 'trigger-003',
    name: 'Form Trigger with Airtable and Gmail',
    prompt: 'When someone submits my contact form with their name, email, and message, save the data to Airtable and send a confirmation email via Gmail.',
    expectedNodes: ['form', 'airtable', 'google_gmail'],
    category: 'triggers',
    priority: 'high',
  },
  {
    id: 'trigger-004',
    name: 'Schedule Trigger with Pipedrive and Slack',
    prompt: 'Every Monday at 9 AM, fetch new leads from Pipedrive, filter for high-value opportunities, and send a summary report to my Slack channel.',
    expectedNodes: ['schedule', 'pipedrive', 'filter', 'slack_message'],
    category: 'triggers',
    priority: 'medium',
  },
  {
    id: 'trigger-005',
    name: 'HTTP Request with Notion',
    prompt: 'Make an HTTP GET request to fetch user data from an API, then process the response and update a Notion database.',
    expectedNodes: ['manual_trigger', 'http_request', 'notion'],
    category: 'triggers',
    priority: 'medium',
  },

  // LOGIC NODES
  {
    id: 'logic-001',
    name: 'If/Else with HubSpot',
    prompt: 'When a new lead comes in via webhook, check if their company size is over 100 employees. If yes, create a deal in HubSpot. If no, just add them as a contact.',
    expectedNodes: ['webhook', 'if_else', 'hubspot'],
    expectedMinNodes: 4, // webhook, if_else, hubspot (deal), hubspot (contact)
    category: 'logic',
    priority: 'high',
  },
  {
    id: 'logic-002',
    name: 'Switch Node with Multiple Routes',
    prompt: 'When a form is submitted, check the inquiry type. If it\'s "sales", route to HubSpot. If it\'s "support", route to Zoho. If it\'s "partnership", route to Pipedrive. Otherwise, send to Slack.',
    expectedNodes: ['form', 'switch', 'hubspot', 'zoho_crm', 'pipedrive', 'slack_message'],
    category: 'logic',
    priority: 'high',
  },
  {
    id: 'logic-003',
    name: 'Set Variable with Name Splitting',
    prompt: 'Extract the customer\'s full name from a webhook, split it into first and last name, then create a contact in HubSpot with those fields.',
    expectedNodes: ['webhook', 'set_variable', 'hubspot'],
    category: 'logic',
    priority: 'medium',
  },
  {
    id: 'logic-004',
    name: 'Merge Node with Multiple Sources',
    prompt: 'Fetch customer data from HubSpot and their order history from an HTTP API, merge both datasets, then send a complete report to Slack.',
    expectedNodes: ['manual_trigger', 'hubspot', 'http_request', 'merge', 'slack_message'],
    category: 'logic',
    priority: 'medium',
  },
  {
    id: 'logic-005',
    name: 'Wait Node with Status Check',
    prompt: 'When a new deal is created in HubSpot, wait 24 hours, then check if the deal status changed. If not, send a reminder to Slack.',
    expectedNodes: ['webhook', 'hubspot', 'wait', 'if_else', 'slack_message'],
    category: 'logic',
    priority: 'low',
  },
  {
    id: 'logic-006',
    name: 'Limit Node with Processing',
    prompt: 'Fetch the latest 10 contacts from HubSpot, process each one, and send summaries to Slack.',
    expectedNodes: ['schedule', 'hubspot', 'limit', 'slack_message'],
    category: 'logic',
    priority: 'medium',
  },
  {
    id: 'logic-007',
    name: 'Aggregate Node with Grouping',
    prompt: 'Fetch all deals from Pipedrive, group them by stage, calculate total value per stage, and send a summary report to Gmail.',
    expectedNodes: ['schedule', 'pipedrive', 'aggregate', 'google_gmail'],
    category: 'logic',
    priority: 'medium',
  },
  {
    id: 'logic-008',
    name: 'Sort Node with Limit',
    prompt: 'Get all contacts from Zoho, sort them by last contact date (newest first), take the top 5, and add them to a ClickUp task list.',
    expectedNodes: ['schedule', 'zoho_crm', 'sort', 'limit', 'clickup'],
    category: 'logic',
    priority: 'medium',
  },
  {
    id: 'logic-009',
    name: 'JavaScript/Code Node',
    prompt: 'When a webhook receives order data, use JavaScript to calculate the total price including tax (8.5%), format it as currency, then save to Airtable.',
    expectedNodes: ['webhook', 'javascript', 'airtable'],
    category: 'logic',
    priority: 'high',
  },
  {
    id: 'logic-010',
    name: 'NoOp Node',
    prompt: 'When a webhook is received, log the data, pass it through unchanged, then send to HubSpot.',
    expectedNodes: ['webhook', 'log_output', 'noop', 'hubspot'],
    category: 'logic',
    priority: 'low',
  },

  // AI & HTTP NODES
  {
    id: 'ai-001',
    name: 'AI Chat Model with Telegram',
    prompt: 'When a customer sends a message via webhook, use AI to analyze the sentiment, generate a personalized response, and send it back via Telegram.',
    expectedNodes: ['webhook', 'ai_chat_model', 'telegram'],
    category: 'ai',
    priority: 'high',
  },
  {
    id: 'http-001',
    name: 'HTTP Request with Error Handling',
    prompt: 'Every hour, make an HTTP GET request to check API status, if it returns an error, send an alert to Slack and create a task in ClickUp.',
    expectedNodes: ['schedule', 'http_request', 'if_else', 'slack_message', 'clickup'],
    category: 'http',
    priority: 'high',
  },

  // CRM INTEGRATIONS
  {
    id: 'crm-001',
    name: 'HubSpot with Conditional Deal Creation',
    prompt: 'When a new contact form is submitted, create a contact in HubSpot, then if the contact\'s company has more than 50 employees, create a deal with value $5000.',
    expectedNodes: ['form', 'hubspot', 'if_else'],
    expectedMinNodes: 3,
    category: 'crm',
    priority: 'high',
  },
  {
    id: 'crm-002',
    name: 'Zoho CRM with Outlook',
    prompt: 'Every morning at 8 AM, fetch all leads from Zoho that were created yesterday, filter for qualified leads, and send a summary email via Outlook.',
    expectedNodes: ['schedule', 'zoho_crm', 'filter', 'outlook'],
    category: 'crm',
    priority: 'medium',
  },
  {
    id: 'crm-003',
    name: 'Pipedrive with Notion Sync',
    prompt: 'When a deal stage changes in Pipedrive via webhook, update the deal notes, calculate the expected close date (30 days from now), and sync to Notion.',
    expectedNodes: ['webhook', 'pipedrive', 'set_variable', 'notion'],
    category: 'crm',
    priority: 'medium',
  },
  {
    id: 'crm-004',
    name: 'Notion with ClickUp and Slack',
    prompt: 'When a new row is added to my Notion database, extract the task name and due date, create a corresponding task in ClickUp, and send a confirmation to Slack.',
    expectedNodes: ['webhook', 'notion', 'set_variable', 'clickup', 'slack_message'],
    category: 'crm',
    priority: 'medium',
  },
  {
    id: 'crm-005',
    name: 'Airtable with Wait and Gmail',
    prompt: 'When a customer signs up via form, add them to Airtable, wait 1 hour, then if they haven\'t verified their email, send a reminder via Gmail.',
    expectedNodes: ['form', 'airtable', 'wait', 'if_else', 'google_gmail'],
    category: 'crm',
    priority: 'low',
  },
  {
    id: 'crm-006',
    name: 'ClickUp with Aggregation',
    prompt: 'Every Friday at 5 PM, fetch all incomplete tasks from ClickUp, sort them by priority, aggregate by assignee, and send a weekly report to each team member via Slack.',
    expectedNodes: ['schedule', 'clickup', 'filter', 'sort', 'aggregate', 'slack_message'],
    category: 'crm',
    priority: 'low',
  },

  // COMMUNICATION NODES
  {
    id: 'comm-001',
    name: 'Gmail with Slack and ClickUp',
    prompt: 'When I receive an email in Gmail with subject containing "URGENT", forward it to my Slack channel and create a task in ClickUp.',
    expectedNodes: ['schedule', 'google_gmail', 'filter', 'slack_message', 'clickup'],
    category: 'communication',
    priority: 'high',
  },
  {
    id: 'comm-002',
    name: 'Slack with Google Calendar',
    prompt: 'When a high-value deal is created in HubSpot (over $10,000), send a formatted message to the #sales Slack channel with deal details and create a calendar event in Google Calendar.',
    expectedNodes: ['webhook', 'hubspot', 'filter', 'slack_message', 'google_calendar'],
    category: 'communication',
    priority: 'high',
  },
  {
    id: 'comm-003',
    name: 'Telegram with AI Routing',
    prompt: 'When a form is submitted with a support request, use AI to categorize it, then send a notification to the appropriate Telegram channel based on category.',
    expectedNodes: ['form', 'ai_chat_model', 'switch', 'telegram'],
    category: 'communication',
    priority: 'medium',
  },
  {
    id: 'comm-004',
    name: 'Outlook with LinkedIn',
    prompt: 'Every Monday morning, fetch this week\'s meetings from Google Calendar, send a summary email via Outlook to the team, and post the same summary to LinkedIn.',
    expectedNodes: ['schedule', 'google_calendar', 'filter', 'outlook', 'linkedin'],
    category: 'communication',
    priority: 'medium',
  },
  {
    id: 'comm-005',
    name: 'Google Calendar with Gmail',
    prompt: 'When a new contact is added to HubSpot, schedule a follow-up meeting in Google Calendar for 3 days later, and send a calendar invite via Gmail.',
    expectedNodes: ['webhook', 'hubspot', 'set_variable', 'google_calendar', 'google_gmail'],
    category: 'communication',
    priority: 'medium',
  },

  // COMPLEX WORKFLOWS
  {
    id: 'complex-001',
    name: 'Complete Sales Pipeline',
    prompt: 'When a new lead comes in via webhook, create a contact in HubSpot. If the lead score is over 50, create a deal, add a task in ClickUp, send a Slack notification, and schedule a follow-up in Google Calendar. If the score is under 50, just add them to Airtable and send a welcome email via Gmail.',
    expectedNodes: ['webhook', 'hubspot', 'if_else', 'clickup', 'slack_message', 'google_calendar', 'airtable', 'google_gmail'],
    expectedMinNodes: 8,
    category: 'complex',
    priority: 'high',
  },
  {
    id: 'complex-002',
    name: 'Multi-Integration Sync',
    prompt: 'Every day at 6 PM, fetch all new deals from Pipedrive, sync them to HubSpot, update the corresponding Notion database, send a summary to Slack, and if any deal is over $50,000, also post to LinkedIn and create a task in ClickUp.',
    expectedNodes: ['schedule', 'pipedrive', 'hubspot', 'notion', 'merge', 'slack_message', 'filter', 'linkedin', 'clickup'],
    category: 'complex',
    priority: 'high',
  },
  {
    id: 'complex-003',
    name: 'AI-Powered Workflow',
    prompt: 'When a customer sends a message via chat trigger, use AI to analyze the intent, if it\'s a sales inquiry route to HubSpot and notify Slack, if it\'s support route to Zoho and create a ClickUp task, otherwise use AI to generate a response and send via Telegram.',
    expectedNodes: ['chat_trigger', 'ai_chat_model', 'switch', 'hubspot', 'slack_message', 'zoho_crm', 'clickup', 'telegram'],
    category: 'complex',
    priority: 'high',
  },
];

class WorkflowTestRunner {
  private workflowBuilder: AgenticWorkflowBuilder;
  private results: TestResult[] = [];

  constructor() {
    // Use AgenticWorkflowBuilder directly - it doesn't require Supabase
    // WorkflowLifecycleManager requires Supabase for credential discovery,
    // but for testing workflow generation, we only need the builder
    this.workflowBuilder = new AgenticWorkflowBuilder();
  }

  /**
   * Run a single test case
   */
  async runTest(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    const result: TestResult = {
      testId: testCase.id,
      testName: testCase.name,
      prompt: testCase.prompt,
      passed: false,
      errors: [],
      warnings: [],
      generatedNodes: [],
      missingNodes: [],
      unexpectedNodes: [],
      nodeCount: 0,
      edgeCount: 0,
      hasTrigger: false,
      allNodesConnected: false,
      executionTime: 0,
    };

    try {
      console.log(`\n🧪 Running test: ${testCase.name} (${testCase.id})`);
      console.log(`   Prompt: ${testCase.prompt.substring(0, 80)}...`);

      // Generate workflow
      const generationResult = await this.workflowBuilder.generateFromPrompt(
        testCase.prompt,
        undefined,
        (progress) => {
          // Optional: log progress
        }
      );

      const workflow = generationResult.workflow;
      result.nodeCount = workflow.nodes.length;
      result.edgeCount = workflow.edges.length;

      // Extract node types
      result.generatedNodes = workflow.nodes.map((n) => n.type);

      // Check for trigger
      const triggerTypes = ['webhook', 'chat_trigger', 'form', 'schedule', 'manual_trigger', 'interval', 'workflow_trigger', 'error_trigger'];
      result.hasTrigger = workflow.nodes.some((n) => triggerTypes.includes(n.type));

      // Check for expected nodes
      for (const expectedNode of testCase.expectedNodes) {
        if (!result.generatedNodes.includes(expectedNode)) {
          result.missingNodes.push(expectedNode);
          result.errors.push(`Missing expected node: ${expectedNode}`);
        }
      }

      // Check minimum node count
      if (testCase.expectedMinNodes && workflow.nodes.length < testCase.expectedMinNodes) {
        result.warnings.push(
          `Expected at least ${testCase.expectedMinNodes} nodes, but got ${workflow.nodes.length}`
        );
      }

      // Check for unexpected nodes (like "custom")
      const unexpectedNodes = result.generatedNodes.filter(
        (type) => type === 'custom' || (!testCase.expectedNodes.includes(type) && type.startsWith('custom_'))
      );
      if (unexpectedNodes.length > 0) {
        result.unexpectedNodes = unexpectedNodes;
        result.errors.push(`Found unexpected node types: ${unexpectedNodes.join(', ')}`);
      }

      // Check if all nodes are connected
      const nodeIds = new Set(workflow.nodes.map((n) => n.id));
      const connectedNodeIds = new Set<string>();
      
      // Add trigger node
      const triggerNode = workflow.nodes.find((n) => triggerTypes.includes(n.type));
      if (triggerNode) {
        connectedNodeIds.add(triggerNode.id);
      }

      // Traverse edges to find all connected nodes
      const edgesBySource = new Map<string, string[]>();
      workflow.edges.forEach((edge) => {
        if (!edgesBySource.has(edge.source)) {
          edgesBySource.set(edge.source, []);
        }
        edgesBySource.get(edge.source)!.push(edge.target);
        connectedNodeIds.add(edge.target);
      });

      // Check for orphan nodes
      const orphanNodes = Array.from(nodeIds).filter((id) => !connectedNodeIds.has(id));
      if (orphanNodes.length > 0) {
        result.errors.push(`Found orphan nodes (not connected): ${orphanNodes.length}`);
        result.allNodesConnected = false;
      } else {
        result.allNodesConnected = true;
      }

      // Check for required fields (basic check)
      for (const node of workflow.nodes) {
        if (!node.data || !node.data.config) {
          result.warnings.push(`Node ${node.id} (${node.type}) has no configuration`);
        }
      }

      // Determine if test passed
      result.passed = result.errors.length === 0 && result.hasTrigger && result.allNodesConnected;

      result.executionTime = Date.now() - startTime;

      if (result.passed) {
        console.log(`   ✅ PASSED (${result.executionTime}ms)`);
      } else {
        console.log(`   ❌ FAILED (${result.executionTime}ms)`);
        console.log(`   Errors: ${result.errors.length}, Warnings: ${result.warnings.length}`);
      }

      return result;
    } catch (error: any) {
      result.executionTime = Date.now() - startTime;
      result.errors.push(`Generation failed: ${error.message}`);
      console.log(`   ❌ ERROR: ${error.message}`);
      return result;
    }
  }

  /**
   * Run all tests or filter by priority/category
   */
  async runAllTests(filter?: { priority?: string; category?: string }): Promise<TestResult[]> {
    let testsToRun = TEST_CASES;

    if (filter?.priority) {
      testsToRun = testsToRun.filter((t) => t.priority === filter.priority);
    }

    if (filter?.category) {
      testsToRun = testsToRun.filter((t) => t.category === filter.category);
    }

    console.log(`\n🚀 Running ${testsToRun.length} test(s)...\n`);

    for (const testCase of testsToRun) {
      const result = await this.runTest(testCase);
      this.results.push(result);
      
      // Small delay to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return this.results;
  }

  /**
   * Generate test report
   */
  generateReport(): string {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = total - passed;
    const totalTime = this.results.reduce((sum, r) => sum + r.executionTime, 0);

    let report = `\n${'='.repeat(80)}\n`;
    report += `WORKFLOW GENERATION TEST REPORT\n`;
    report += `${'='.repeat(80)}\n\n`;
    report += `Total Tests: ${total}\n`;
    report += `Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)\n`;
    report += `Failed: ${failed} (${((failed / total) * 100).toFixed(1)}%)\n`;
    report += `Total Execution Time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)\n`;
    report += `Average Time per Test: ${(totalTime / total).toFixed(0)}ms\n\n`;

    // Group by category
    const byCategory = new Map<string, TestResult[]>();
    this.results.forEach((r) => {
      const testCase = TEST_CASES.find((t) => t.id === r.testId);
      const category = testCase?.category || 'unknown';
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(r);
    });

    report += `Results by Category:\n`;
    report += `${'-'.repeat(80)}\n`;
    for (const [category, results] of byCategory.entries()) {
      const categoryPassed = results.filter((r) => r.passed).length;
      report += `${category.padEnd(20)}: ${categoryPassed}/${results.length} passed\n`;
    }

    // Failed tests details
    const failedTests = this.results.filter((r) => !r.passed);
    if (failedTests.length > 0) {
      report += `\n${'='.repeat(80)}\n`;
      report += `FAILED TESTS DETAILS\n`;
      report += `${'='.repeat(80)}\n\n`;

      for (const result of failedTests) {
        report += `\n❌ ${result.testName} (${result.testId})\n`;
        report += `   Prompt: ${result.prompt}\n`;
        report += `   Nodes Generated: ${result.nodeCount} (Expected: ${TEST_CASES.find((t) => t.id === result.testId)?.expectedNodes.length || '?'})\n`;
        report += `   Generated: [${result.generatedNodes.join(', ')}]\n`;
        
        if (result.missingNodes.length > 0) {
          report += `   Missing: [${result.missingNodes.join(', ')}]\n`;
        }
        
        if (result.unexpectedNodes.length > 0) {
          report += `   Unexpected: [${result.unexpectedNodes.join(', ')}]\n`;
        }

        if (result.errors.length > 0) {
          report += `   Errors:\n`;
          result.errors.forEach((e) => {
            report += `     - ${e}\n`;
          });
        }

        if (result.warnings.length > 0) {
          report += `   Warnings:\n`;
          result.warnings.forEach((w) => {
            report += `     - ${w}\n`;
          });
        }
      }
    }

    // Node coverage
    const allGeneratedNodes = new Set<string>();
    this.results.forEach((r) => {
      r.generatedNodes.forEach((n) => allGeneratedNodes.add(n));
    });

    report += `\n${'='.repeat(80)}\n`;
    report += `NODE COVERAGE\n`;
    report += `${'='.repeat(80)}\n`;
    report += `Unique nodes generated: ${allGeneratedNodes.size}\n`;
    report += `Nodes: [${Array.from(allGeneratedNodes).sort().join(', ')}]\n`;

    return report;
  }

  /**
   * Save report to file
   */
  async saveReport(filePath: string): Promise<void> {
    const report = this.generateReport();
    await fsPromises.writeFile(filePath, report, 'utf-8');
    console.log(`\n📄 Report saved to: ${filePath}`);
  }
}

// Main execution
async function main() {
  const runner = new WorkflowTestRunner();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const priority = args.find((a) => a.startsWith('--priority='))?.split('=')[1];
  const category = args.find((a) => a.startsWith('--category='))?.split('=')[1];
  const outputFile = args.find((a) => a.startsWith('--output='))?.split('=')[1] || 'test-results.txt';

  const filter: any = {};
  if (priority) filter.priority = priority;
  if (category) filter.category = category;

  try {
    await runner.runAllTests(filter);
    const report = runner.generateReport();
    console.log(report);

    // Save to file
    const reportPath = path.resolve(process.cwd(), outputFile);
    await runner.saveReport(reportPath);
  } catch (error: any) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
// eslint-disable-next-line @typescript-eslint/no-var-requires
if (typeof require !== 'undefined' && require.main === module) {
  main().catch(console.error);
}

export { WorkflowTestRunner, TEST_CASES };
