/**
 * Comprehensive Test Script for All 15 Enterprise Workflows
 * 
 * This script:
 * 1. Generates each workflow from its prompt
 * 2. Executes each workflow
 * 3. Captures and analyzes errors
 * 4. Reports root-level issues that need fixing
 * 
 * Architecture: All fixes must be at root level (unified-node-registry.ts)
 */

import { AgenticWorkflowBuilder } from '../src/services/ai/workflow-builder';
import * as fs from 'fs';
import * as path from 'path';
import { promises as fsPromises } from 'fs';

interface WorkflowTest {
  id: number;
  name: string;
  prompt: string;
  expectedNodes: string[];
  useCase: string;
}

const WORKFLOWS: WorkflowTest[] = [
  {
    id: 1,
    name: 'AI Omni-Channel Lead Capture & CRM Qualification System',
    prompt: 'Capture leads from website, qualify using AI, store in CRM, notify sales, and respond automatically.',
    expectedNodes: ['webhook', 'respond_to_webhook', 'set', 'json_parser', 'ai_agent', 'sentiment_analyzer', 'memory', 'if_else', 'salesforce', 'hubspot', 'slack_message', 'email', 'google_sheets', 'database_write', 'error_handler', 'log_output'],
    useCase: 'A business running ads wants automatic AI-based lead qualification and routing into Salesforce or HubSpot, with Slack + email alerts.'
  },
  {
    id: 2,
    name: 'Multi-Channel Social Media AI Content Engine',
    prompt: 'Generate AI content daily and post automatically on all social platforms.',
    expectedNodes: ['schedule', 'openai_gpt', 'anthropic_claude', 'google_gemini', 'text_formatter', 'linkedin', 'instagram', 'facebook', 'twitter', 'youtube', 'google_drive', 'log_output'],
    useCase: 'Marketing team automates posting to LinkedIn, Instagram, Facebook, Twitter, YouTube.'
  },
  {
    id: 3,
    name: 'AI Customer Support Ticket Automation System',
    prompt: 'Automatically respond to support tickets and escalate critical ones.',
    expectedNodes: ['webhook', 'freshdesk', 'intercom', 'ai_chat_model', 'sentiment_analyzer', 'switch', 'slack_webhook', 'microsoft_teams', 'database_read', 'update', 'error_handler'],
    useCase: 'Support automation using Freshdesk and Intercom.'
  },
  {
    id: 4,
    name: 'E-commerce Order → Accounting → Fulfillment Pipeline',
    prompt: 'When an order is placed, process payment, update inventory, notify warehouse.',
    expectedNodes: ['shopify', 'stripe', 'paypal', 'woocommerce', 'mysql', 'postgresql', 'aggregate', 'split_in_batches', 'loop', 'whatsapp_cloud', 'twilio', 'aws_s3'],
    useCase: 'Shopify order processing with Stripe & PayPal.'
  },
  {
    id: 5,
    name: 'DevOps CI/CD Monitoring & Incident Bot',
    prompt: 'Monitor Git repos and alert DevOps if build fails.',
    expectedNodes: ['github', 'gitlab', 'bitbucket', 'jenkins', 'jira', 'if_else', 'discord', 'telegram', 'log_output'],
    useCase: 'Repo monitoring for GitHub, GitLab, Bitbucket, integrated with Jenkins.'
  },
  {
    id: 6,
    name: 'Enterprise Data Sync & Reporting Engine',
    prompt: 'Sync CRM, DB, and spreadsheets daily and generate reports.',
    expectedNodes: ['interval', 'database_read', 'supabase', 'mongodb', 'redis', 'merge_data', 'sort', 'limit', 'google_sheets', 'google_doc', 'google_big_query', 'airtable', 'notion', 'csv'],
    useCase: 'Enterprise reporting with Google & Airtable.'
  },
  {
    id: 7,
    name: 'Advanced Sales Funnel Automation (Multi-CRM)',
    prompt: 'Manage leads across multiple CRMs and move them through funnel stages.',
    expectedNodes: ['zoho_crm', 'pipedrive', 'activecampaign', 'mailchimp', 'if_else', 'filter', 'switch', 'email', 'google_contacts'],
    useCase: 'Multi-CRM sync using Zoho, Pipedrive, ActiveCampaign, Mailchimp.'
  },
  {
    id: 8,
    name: 'AI Contract & Document Processing Automation',
    prompt: 'Upload contracts, extract data, summarize, store in cloud.',
    expectedNodes: ['read_binary_file', 'ollama', 'text_summarizer', 'rename_keys', 'dropbox', 'onedrive', 'ftp', 'sftp', 'write_binary_file', 'xml', 'html'],
    useCase: 'AI document automation.'
  },
  {
    id: 9,
    name: 'Real-Time Chatbot with Memory + Tools',
    prompt: 'Build AI chatbot that remembers users and can call APIs.',
    expectedNodes: ['chat_trigger', 'ai_agent', 'memory', 'tool', 'http_request', 'graphql', 'function', 'function_item', 'merge', 'noop'],
    useCase: 'AI customer assistant integrated with APIs.'
  },
  {
    id: 10,
    name: 'Finance & Payment Reconciliation System',
    prompt: 'Reconcile all payments daily and flag mismatches.',
    expectedNodes: ['interval', 'stripe', 'paypal', 'aggregate', 'filter', 'if_else', 'stop_and_error', 'error_handler', 'slack_message'],
    useCase: 'Payment reconciliation across Stripe & PayPal.'
  },
  {
    id: 11,
    name: 'Smart Email & Calendar Automation',
    prompt: 'Auto-schedule meetings from emails and update calendar.',
    expectedNodes: ['gmail', 'google_gmail', 'outlook', 'google_calendar', 'google_tasks', 'date_time', 'text_formatter'],
    useCase: 'Automation with Gmail & Outlook.'
  },
  {
    id: 12,
    name: 'SaaS User Lifecycle Automation',
    prompt: 'Track new users, onboarding, churn risk and engagement.',
    expectedNodes: ['form', 'database_write', 'supabase', 'ai_service', 'sentiment_analyzer', 'slack_webhook', 'merge'],
    useCase: 'User lifecycle automation for SaaS startup.'
  },
  {
    id: 13,
    name: 'Real-Time Webhook Orchestrator Engine',
    prompt: 'Route incoming webhooks to multiple services conditionally.',
    expectedNodes: ['webhook', 'webhook_response', 'switch', 'http_post', 'respond_to_webhook', 'limit', 'wait'],
    useCase: 'Central webhook router for enterprise apps.'
  },
  {
    id: 14,
    name: 'Bulk Data Migration & Transformation Pipeline',
    prompt: 'Migrate legacy data into modern systems.',
    expectedNodes: ['split_in_batches', 'loop', 'json_parser', 'edit_fields', 'rename_keys', 'aggregate', 'postgresql', 'mongodb', 'airtable'],
    useCase: 'Enterprise migration.'
  },
  {
    id: 15,
    name: 'Enterprise Incident & Error Recovery System',
    prompt: 'Detect workflow errors, retry, notify, and auto-recover.',
    expectedNodes: ['error_trigger', 'error_handler', 'wait', 'if_else', 'log_output', 'slack_message', 'telegram', 'discord_webhook'],
    useCase: 'Production-grade reliability layer.'
  }
];

interface TestResult {
  workflowId: number;
  workflowName: string;
  prompt: string;
  generationSuccess: boolean;
  generationErrors: string[];
  executionSuccess: boolean;
  executionErrors: string[];
  generatedNodes: string[];
  missingNodes: string[];
  nodeCount: number;
  edgeCount: number;
  hasTrigger: boolean;
  allNodesConnected: boolean;
  rootLevelIssues: string[];
  executionTime: number;
}

class ComprehensiveWorkflowTester {
  private workflowBuilder: AgenticWorkflowBuilder;
  private supabase: any;
  private results: TestResult[] = [];

  constructor() {
    this.workflowBuilder = new AgenticWorkflowBuilder();
    // For offline tests, use a lightweight mock Supabase client.
    // Dynamic executor passes this to node definitions, but tests
    // should not depend on real Supabase credentials.
    this.supabase = {} as any;
  }

  /**
   * Test a single workflow: Generate + Execute
   */
  async testWorkflow(workflow: WorkflowTest): Promise<TestResult> {
    const startTime = Date.now();
    const result: TestResult = {
      workflowId: workflow.id,
      workflowName: workflow.name,
      prompt: workflow.prompt,
      generationSuccess: false,
      generationErrors: [],
      executionSuccess: false,
      executionErrors: [],
      generatedNodes: [],
      missingNodes: [],
      nodeCount: 0,
      edgeCount: 0,
      hasTrigger: false,
      allNodesConnected: false,
      rootLevelIssues: [],
      executionTime: 0,
    };

    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 WORKFLOW ${workflow.id}: ${workflow.name}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`📝 Prompt: ${workflow.prompt}`);
    console.log(`💼 Use Case: ${workflow.useCase}`);

    // STEP 1: Generate Workflow
    console.log(`\n📦 Step 1: Generating workflow...`);
    try {
      const generationResult = await this.workflowBuilder.generateFromPrompt(
        workflow.prompt,
        undefined,
        (progress) => {
          // Optional: log progress
        }
      );

      const generatedWorkflow = generationResult.workflow;
      result.nodeCount = generatedWorkflow.nodes.length;
      result.edgeCount = generatedWorkflow.edges.length;
      result.generatedNodes = generatedWorkflow.nodes.map((n) => n.type);

      // Check for trigger
      const triggerTypes = ['webhook', 'chat_trigger', 'form', 'schedule', 'manual_trigger', 'interval', 'workflow_trigger', 'error_trigger'];
      result.hasTrigger = generatedWorkflow.nodes.some((n) => triggerTypes.includes(n.type));

      // Check for expected nodes
      for (const expectedNode of workflow.expectedNodes) {
        if (!result.generatedNodes.includes(expectedNode)) {
          result.missingNodes.push(expectedNode);
        }
      }

      // Check if all nodes are connected
      const nodeIds = new Set(generatedWorkflow.nodes.map((n) => n.id));
      const connectedNodeIds = new Set<string>();
      
      const triggerNode = generatedWorkflow.nodes.find((n) => triggerTypes.includes(n.type));
      if (triggerNode) {
        connectedNodeIds.add(triggerNode.id);
      }

      generatedWorkflow.edges.forEach((edge) => {
        connectedNodeIds.add(edge.target);
      });

      const orphanNodes = Array.from(nodeIds).filter((id) => !connectedNodeIds.has(id));
      result.allNodesConnected = orphanNodes.length === 0;

      if (!result.hasTrigger) {
        result.generationErrors.push('Missing trigger node');
      }
      if (!result.allNodesConnected) {
        result.generationErrors.push(`Found ${orphanNodes.length} orphan nodes`);
      }
      if (result.missingNodes.length > 0) {
        result.generationErrors.push(`Missing expected nodes: ${result.missingNodes.join(', ')}`);
      }

      result.generationSuccess = result.generationErrors.length === 0 && result.hasTrigger && result.allNodesConnected;

      console.log(`   ✅ Generation: ${result.generationSuccess ? 'SUCCESS' : 'FAILED'}`);
      console.log(`   📊 Nodes: ${result.nodeCount}, Edges: ${result.edgeCount}`);
      console.log(`   🔗 Connected: ${result.allNodesConnected ? 'YES' : 'NO'}`);
      console.log(`   🎯 Trigger: ${result.hasTrigger ? 'YES' : 'NO'}`);

      if (result.missingNodes.length > 0) {
        console.log(`   ⚠️  Missing nodes: ${result.missingNodes.join(', ')}`);
      }

      // STEP 2: Execute Workflow (if generation succeeded)
      if (result.generationSuccess) {
        console.log(`\n⚡ Step 2: Executing workflow...`);
        try {
          // Use dynamic executor directly (no need for database)
          const { executeNodeDynamically } = await import('../src/core/execution/dynamic-node-executor');
          const { LRUNodeOutputsCache } = await import('../src/core/cache/lru-node-outputs-cache');
          
          // Topological sort function (local implementation)
          const topologicalSort = (nodes: any[], edges: any[]): any[] => {
            const inDegree: Record<string, number> = {};
            const adjacency: Record<string, string[]> = {};
            const nodeMap: Record<string, any> = {};

            nodes.forEach(node => {
              inDegree[node.id] = 0;
              adjacency[node.id] = [];
              nodeMap[node.id] = node;
            });

            edges.forEach(edge => {
              adjacency[edge.source].push(edge.target);
              inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
            });

            const queue: string[] = [];
            Object.entries(inDegree).forEach(([nodeId, degree]) => {
              if (degree === 0) queue.push(nodeId);
            });

            const sorted: any[] = [];
            while (queue.length > 0) {
              const nodeId = queue.shift()!;
              sorted.push(nodeMap[nodeId]);

              adjacency[nodeId].forEach(neighbor => {
                inDegree[neighbor]--;
                if (inDegree[neighbor] === 0) queue.push(neighbor);
              });
            }

            return sorted;
          };

          // Topological sort to get execution order
          const sortedNodes = topologicalSort(generatedWorkflow.nodes, generatedWorkflow.edges);
          const nodeOutputs = new LRUNodeOutputsCache(100);
          
          // Set workflow intent for router
          (global as any).currentWorkflowIntent = workflow.prompt;

          // Execute each node in order
          let executionError: any = null;
          for (const node of sortedNodes) {
            // Skip trigger nodes (they don't need execution)
            if (['webhook', 'chat_trigger', 'form', 'schedule', 'manual_trigger', 'interval', 'workflow_trigger', 'error_trigger'].includes(node.type)) {
              nodeOutputs.set(node.id, { triggered: true });
              continue;
            }

            try {
              // Get input from upstream nodes
              const input = this.getNodeInput(node, generatedWorkflow.edges, nodeOutputs);

              // Execute node
              const output = await executeNodeDynamically({
                node,
                input,
                nodeOutputs,
                supabase: this.supabase,
                workflowId: `test-${workflow.id}`,
                userId: 'test-user',
              });

              // Check for errors in output
              if (output && typeof output === 'object' && '_error' in output) {
                executionError = output;
                result.executionErrors.push((output as any)._error);
                break;
              }

              nodeOutputs.set(node.id, output);
            } catch (nodeError: any) {
              executionError = nodeError;
              result.executionErrors.push(`Node ${node.id} (${node.type}): ${nodeError.message}`);
              break;
            }
          }

          if (!executionError) {
            result.executionSuccess = true;
            console.log(`   ✅ Execution: SUCCESS`);
          } else {
            result.executionSuccess = false;
            console.log(`   ❌ Execution: FAILED - ${executionError.message || executionError._error}`);
            
            // Analyze error for root-level issues
            this.analyzeErrorForRootIssues(executionError, result);
          }

        } catch (execError: any) {
          result.executionErrors.push(execError.message || 'Execution failed');
          result.executionSuccess = false;
          console.log(`   ❌ Execution: FAILED - ${execError.message}`);
          
          // Analyze error for root-level issues
          this.analyzeErrorForRootIssues(execError, result);
        }
      } else {
        console.log(`   ⏭️  Skipping execution (generation failed)`);
      }

    } catch (genError: any) {
      result.generationErrors.push(genError.message || 'Generation failed');
      result.generationSuccess = false;
      console.log(`   ❌ Generation: FAILED - ${genError.message}`);
      
      // Analyze error for root-level issues
      this.analyzeErrorForRootIssues(genError, result);
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  /**
   * Get node input from upstream nodes
   */
  private getNodeInput(node: any, edges: any[], nodeOutputs: any): unknown {
    // Find incoming edges
    const incomingEdges = edges.filter((e) => e.target === node.id);
    
    if (incomingEdges.length === 0) {
      return {};
    }

    // Get outputs from upstream nodes
    const inputs: Record<string, unknown> = {};
    for (const edge of incomingEdges) {
      const upstreamOutput = nodeOutputs.get(edge.source);
      if (upstreamOutput) {
        // If edge specifies source_output, use that field
        if (edge.sourceOutput) {
          inputs[edge.targetInput || edge.sourceOutput] = (upstreamOutput as any)[edge.sourceOutput];
        } else {
          // Use entire output
          Object.assign(inputs, upstreamOutput as Record<string, unknown>);
        }
      }
    }

    return inputs;
  }

  /**
   * Analyze errors to identify root-level issues
   */
  private analyzeErrorForRootIssues(error: any, result: TestResult): void {
    const errorMessage = error.message || String(error);
    const errorStack = error.stack || '';

    // Check for common root-level issues
    if (errorMessage.includes('node type') || errorMessage.includes('node_type')) {
      result.rootLevelIssues.push('Node type not found in unified-node-registry');
    }
    if (errorMessage.includes('schema') || errorMessage.includes('inputSchema') || errorMessage.includes('outputSchema')) {
      result.rootLevelIssues.push('Schema definition missing in unified-node-registry');
    }
    if (errorMessage.includes('credential') || errorMessage.includes('auth')) {
      result.rootLevelIssues.push('Credential schema missing in unified-node-registry');
    }
    if (errorMessage.includes('execute') || errorMessage.includes('execution')) {
      result.rootLevelIssues.push('Execute function missing in unified-node-registry');
    }
    if (errorMessage.includes('template') || errorMessage.includes('{{')) {
      result.rootLevelIssues.push('Template resolution issue in universal-template-resolver');
    }
    if (errorMessage.includes('connection') || errorMessage.includes('edge')) {
      result.rootLevelIssues.push('Connection validation issue');
    }
  }

  /**
   * Run all workflow tests
   */
  async runAllTests(): Promise<TestResult[]> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 COMPREHENSIVE WORKFLOW TEST SUITE`);
    console.log(`📋 Testing ${WORKFLOWS.length} enterprise workflows`);
    console.log(`${'='.repeat(80)}\n`);

    for (const workflow of WORKFLOWS) {
      const result = await this.testWorkflow(workflow);
      this.results.push(result);
      
      // Small delay between tests
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return this.results;
  }

  /**
   * Generate comprehensive report
   */
  generateReport(): string {
    const total = this.results.length;
    const genPassed = this.results.filter((r) => r.generationSuccess).length;
    const execPassed = this.results.filter((r) => r.executionSuccess).length;
    const totalTime = this.results.reduce((sum, r) => sum + r.executionTime, 0);

    let report = `\n${'='.repeat(80)}\n`;
    report += `COMPREHENSIVE WORKFLOW TEST REPORT\n`;
    report += `${'='.repeat(80)}\n\n`;
    report += `Total Workflows: ${total}\n`;
    report += `Generation Success: ${genPassed}/${total} (${((genPassed / total) * 100).toFixed(1)}%)\n`;
    report += `Execution Success: ${execPassed}/${total} (${((execPassed / total) * 100).toFixed(1)}%)\n`;
    report += `Total Execution Time: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)\n`;
    report += `Average Time per Workflow: ${(totalTime / total).toFixed(0)}ms\n\n`;

    // Root-level issues summary
    const allRootIssues = new Set<string>();
    this.results.forEach((r) => {
      r.rootLevelIssues.forEach((issue) => allRootIssues.add(issue));
    });

    if (allRootIssues.size > 0) {
      report += `${'='.repeat(80)}\n`;
      report += `ROOT-LEVEL ISSUES REQUIRING FIXES\n`;
      report += `${'='.repeat(80)}\n\n`;
      for (const issue of allRootIssues) {
        report += `  ❌ ${issue}\n`;
      }
      report += `\n💡 All fixes must be made in unified-node-registry.ts\n\n`;
    }

    // Failed workflows details
    const failedWorkflows = this.results.filter((r) => !r.generationSuccess || !r.executionSuccess);
    if (failedWorkflows.length > 0) {
      report += `${'='.repeat(80)}\n`;
      report += `FAILED WORKFLOWS DETAILS\n`;
      report += `${'='.repeat(80)}\n\n`;

      for (const result of failedWorkflows) {
        report += `\n❌ WORKFLOW ${result.workflowId}: ${result.workflowName}\n`;
        report += `   Prompt: ${result.prompt}\n`;
        report += `   Generation: ${result.generationSuccess ? '✅' : '❌'}\n`;
        report += `   Execution: ${result.executionSuccess ? '✅' : '❌'}\n`;
        
        if (result.generationErrors.length > 0) {
          report += `   Generation Errors:\n`;
          result.generationErrors.forEach((e) => {
            report += `     - ${e}\n`;
          });
        }
        
        if (result.executionErrors.length > 0) {
          report += `   Execution Errors:\n`;
          result.executionErrors.forEach((e) => {
            report += `     - ${e}\n`;
          });
        }

        if (result.rootLevelIssues.length > 0) {
          report += `   Root-Level Issues:\n`;
          result.rootLevelIssues.forEach((i) => {
            report += `     - ${i}\n`;
          });
        }

        if (result.missingNodes.length > 0) {
          report += `   Missing Nodes: ${result.missingNodes.join(', ')}\n`;
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
  const tester = new ComprehensiveWorkflowTester();

  try {
    await tester.runAllTests();
    const report = tester.generateReport();
    console.log(report);

    // Save to file
    const reportPath = path.resolve(process.cwd(), '15-workflows-test-results.txt');
    await tester.saveReport(reportPath);
  } catch (error: any) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  main().catch(console.error);
}

export { ComprehensiveWorkflowTester, WORKFLOWS };
