/**
 * Test a single workflow by ID
 * Usage: npx ts-node scripts/test-single-workflow.ts <workflow-id>
 */

import { AgenticWorkflowBuilder } from '../src/services/ai/workflow-builder';
import * as path from 'path';

const WORKFLOWS: Record<number, { name: string; prompt: string; expectedNodes: string[] }> = {
  1: {
    name: 'AI Omni-Channel Lead Capture & CRM Qualification System',
    prompt: 'Capture leads from website, qualify using AI, store in CRM, notify sales, and respond automatically.',
    expectedNodes: ['webhook', 'respond_to_webhook', 'set', 'json_parser', 'ai_agent', 'sentiment_analyzer', 'memory', 'if_else', 'salesforce', 'hubspot', 'slack_message', 'email', 'google_sheets', 'database_write', 'error_handler', 'log_output']
  },
  2: {
    name: 'Multi-Channel Social Media AI Content Engine',
    prompt: 'Generate AI content daily and post automatically on all social platforms.',
    expectedNodes: ['schedule', 'openai_gpt', 'anthropic_claude', 'google_gemini', 'text_formatter', 'linkedin', 'instagram', 'facebook', 'twitter', 'youtube', 'google_drive', 'log_output']
  },
  3: {
    name: 'AI Customer Support Ticket Automation System',
    prompt: 'Automatically respond to support tickets and escalate critical ones.',
    expectedNodes: ['webhook', 'freshdesk', 'intercom', 'ai_chat_model', 'sentiment_analyzer', 'switch', 'slack_webhook', 'microsoft_teams', 'database_read', 'update', 'error_handler']
  },
  4: {
    name: 'E-commerce Order → Accounting → Fulfillment Pipeline',
    prompt: 'When an order is placed, process payment, update inventory, notify warehouse.',
    expectedNodes: ['shopify', 'stripe', 'paypal', 'woocommerce', 'mysql', 'postgresql', 'aggregate', 'split_in_batches', 'loop', 'whatsapp_cloud', 'twilio', 'aws_s3']
  },
  5: {
    name: 'DevOps CI/CD Monitoring & Incident Bot',
    prompt: 'Monitor Git repos and alert DevOps if build fails.',
    expectedNodes: ['github', 'gitlab', 'bitbucket', 'jenkins', 'jira', 'if_else', 'discord', 'telegram', 'log_output']
  },
  6: {
    name: 'Enterprise Data Sync & Reporting Engine',
    prompt: 'Sync CRM, DB, and spreadsheets daily and generate reports.',
    expectedNodes: ['interval', 'database_read', 'supabase', 'mongodb', 'redis', 'merge_data', 'sort', 'limit', 'google_sheets', 'google_doc', 'google_big_query', 'airtable', 'notion', 'csv']
  },
  7: {
    name: 'Advanced Sales Funnel Automation (Multi-CRM)',
    prompt: 'Manage leads across multiple CRMs and move them through funnel stages.',
    expectedNodes: ['zoho_crm', 'pipedrive', 'activecampaign', 'mailchimp', 'if_else', 'filter', 'switch', 'email', 'google_contacts']
  },
  8: {
    name: 'AI Contract & Document Processing Automation',
    prompt: 'Upload contracts, extract data, summarize, store in cloud.',
    expectedNodes: ['read_binary_file', 'ollama', 'text_summarizer', 'rename_keys', 'dropbox', 'onedrive', 'ftp', 'sftp', 'write_binary_file', 'xml', 'html']
  },
  9: {
    name: 'Real-Time Chatbot with Memory + Tools',
    prompt: 'Build AI chatbot that remembers users and can call APIs.',
    expectedNodes: ['chat_trigger', 'ai_agent', 'memory', 'tool', 'http_request', 'graphql', 'function', 'function_item', 'merge', 'noop']
  },
  10: {
    name: 'Finance & Payment Reconciliation System',
    prompt: 'Reconcile all payments daily and flag mismatches.',
    expectedNodes: ['interval', 'stripe', 'paypal', 'aggregate', 'filter', 'if_else', 'stop_and_error', 'error_handler', 'slack_message']
  },
  11: {
    name: 'Smart Email & Calendar Automation',
    prompt: 'Auto-schedule meetings from emails and update calendar.',
    expectedNodes: ['gmail', 'google_gmail', 'outlook', 'google_calendar', 'google_tasks', 'date_time', 'text_formatter']
  },
  12: {
    name: 'SaaS User Lifecycle Automation',
    prompt: 'Track new users, onboarding, churn risk and engagement.',
    expectedNodes: ['form', 'database_write', 'supabase', 'ai_service', 'sentiment_analyzer', 'slack_webhook', 'merge']
  },
  13: {
    name: 'Real-Time Webhook Orchestrator Engine',
    prompt: 'Route incoming webhooks to multiple services conditionally.',
    expectedNodes: ['webhook', 'webhook_response', 'switch', 'http_post', 'respond_to_webhook', 'limit', 'wait']
  },
  14: {
    name: 'Bulk Data Migration & Transformation Pipeline',
    prompt: 'Migrate legacy data into modern systems.',
    expectedNodes: ['split_in_batches', 'loop', 'json_parser', 'edit_fields', 'rename_keys', 'aggregate', 'postgresql', 'mongodb', 'airtable']
  },
  15: {
    name: 'Enterprise Incident & Error Recovery System',
    prompt: 'Detect workflow errors, retry, notify, and auto-recover.',
    expectedNodes: ['error_trigger', 'error_handler', 'wait', 'if_else', 'log_output', 'slack_message', 'telegram', 'discord_webhook']
  }
};

async function testWorkflow(workflowId: number) {
  const workflow = WORKFLOWS[workflowId];
  if (!workflow) {
    console.error(`❌ Workflow ${workflowId} not found`);
    process.exit(1);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🚀 TESTING WORKFLOW ${workflowId}: ${workflow.name}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📝 Prompt: ${workflow.prompt}\n`);

  const builder = new AgenticWorkflowBuilder();
  
  try {
    console.log('📦 Generating workflow...');
    const result = await builder.generateFromPrompt(workflow.prompt, undefined, (progress) => {
      // Optional progress logging
    });

    const generatedWorkflow = result.workflow;
    const generatedNodes = generatedWorkflow.nodes.map(n => n.type);
    
    console.log(`\n✅ Generation SUCCESS`);
    console.log(`   Nodes: ${generatedWorkflow.nodes.length}`);
    console.log(`   Edges: ${generatedWorkflow.edges.length}`);
    console.log(`   Generated nodes: [${generatedNodes.join(', ')}]`);

    // Check for expected nodes
    const missingNodes = workflow.expectedNodes.filter(n => !generatedNodes.includes(n));
    if (missingNodes.length > 0) {
      console.log(`\n⚠️  Missing expected nodes: [${missingNodes.join(', ')}]`);
    } else {
      console.log(`\n✅ All expected nodes generated`);
    }

    // Check for trigger
    const triggerTypes = ['webhook', 'chat_trigger', 'form', 'schedule', 'manual_trigger', 'interval', 'workflow_trigger', 'error_trigger'];
    const hasTrigger = generatedWorkflow.nodes.some(n => triggerTypes.includes(n.type));
    console.log(`   Has trigger: ${hasTrigger ? '✅' : '❌'}`);

    // Check connections
    const nodeIds = new Set(generatedWorkflow.nodes.map(n => n.id));
    const connectedIds = new Set<string>();
    generatedWorkflow.edges.forEach(e => connectedIds.add(e.target));
    const orphanCount = Array.from(nodeIds).filter(id => !connectedIds.has(id) && !generatedWorkflow.nodes.find(n => n.id === id && triggerTypes.includes(n.type))).length;
    console.log(`   Orphan nodes: ${orphanCount === 0 ? '✅ None' : `❌ ${orphanCount}`}`);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ WORKFLOW ${workflowId} TEST COMPLETE`);
    console.log(`${'='.repeat(80)}\n`);

  } catch (error: any) {
    console.error(`\n❌ Generation FAILED: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Main
const workflowId = parseInt(process.argv[2] || '1');
testWorkflow(workflowId).catch(console.error);
