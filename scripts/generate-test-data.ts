/**
 * Generate Test Data for Enterprise Architecture
 * 
 * Creates 300+ sample execution records with node outputs
 * for testing persistence, resume, and state management.
 */

import { SupabaseClient, createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

// Load environment variables
dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Generate sample node output data
 */
function generateNodeOutput(nodeType: string, sequence: number): unknown {
  const baseData = {
    timestamp: new Date().toISOString(),
    sequence,
    nodeType,
  };

  switch (nodeType) {
    case 'text_formatter':
      return {
        ...baseData,
        data: `Formatted text output ${sequence}`,
        formatted: `[${sequence}] Formatted: Sample text`,
      };

    case 'chat_model':
      return {
        ...baseData,
        response: `AI response for sequence ${sequence}`,
        tokens: Math.floor(Math.random() * 1000) + 100,
        model: 'gpt-4',
      };

    case 'ai_agent':
      return {
        ...baseData,
        response_text: `Agent response ${sequence}`,
        reasoning: `Step ${sequence} reasoning`,
        actions: [`action_${sequence}`],
      };

    case 'if_else':
      return {
        ...baseData,
        condition: sequence % 2 === 0,
        result: sequence % 2 === 0 ? 'true' : 'false',
      };

    case 'set_variable':
      return {
        ...baseData,
        variable: `var_${sequence}`,
        value: `value_${sequence}`,
      };

    case 'http_request':
      return {
        ...baseData,
        status: 200,
        data: { result: `HTTP response ${sequence}` },
        headers: { 'content-type': 'application/json' },
      };

    case 'google_sheets':
      return {
        ...baseData,
        rows: Array.from({ length: 10 }, (_, i) => ({
          id: i,
          data: `Row ${i} data`,
        })),
      };

    default:
      return {
        ...baseData,
        output: `Node output ${sequence}`,
        result: 'success',
      };
  }
}

/**
 * Generate large payload (>1MB) for object storage testing
 */
function generateLargePayload(sequence: number): unknown {
  // Generate 2MB payload
  const largeData = 'x'.repeat(2 * 1024 * 1024);
  return {
    timestamp: new Date().toISOString(),
    sequence,
    data: largeData,
    size: largeData.length,
    type: 'large_payload',
  };
}

/**
 * Create sample workflow
 */
async function createSampleWorkflow(supabase: SupabaseClient): Promise<string> {
  const workflowId = randomUUID();
  
  const nodes = [
    { id: 'trigger-1', type: 'manual_trigger', label: 'Start' },
    { id: 'node-1', type: 'text_formatter', label: 'Format Text' },
    { id: 'node-2', type: 'chat_model', label: 'AI Chat' },
    { id: 'node-3', type: 'if_else', label: 'Condition' },
    { id: 'node-4', type: 'set_variable', label: 'Set Var' },
    { id: 'node-5', type: 'http_request', label: 'HTTP Call' },
  ];

  const edges = [
    { id: 'e1', source: 'trigger-1', target: 'node-1' },
    { id: 'e2', source: 'node-1', target: 'node-2' },
    { id: 'e3', source: 'node-2', target: 'node-3' },
    { id: 'e4', source: 'node-3', target: 'node-4' },
    { id: 'e5', source: 'node-4', target: 'node-5' },
  ];

  const { error } = await supabase
    .from('workflows')
    .insert({
      id: workflowId,
      name: `Test Workflow ${Date.now()}`,
      definition: { nodes, edges },
      is_active: true,
    });

  if (error) {
    throw new Error(`Failed to create workflow: ${error.message}`);
  }

  return workflowId;
}

/**
 * Generate execution with node steps
 */
async function generateExecution(
  supabase: SupabaseClient,
  workflowId: string,
  executionNumber: number,
  options: {
    includeLargePayload?: boolean;
    includeFailedNodes?: boolean;
    resumeTest?: boolean;
  } = {}
): Promise<string> {
  const executionId = randomUUID();
  const userId = randomUUID();
  const startedAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000); // Random time in last 7 days

  // Create execution
  const { error: execError } = await supabase
    .from('executions')
    .insert({
      id: executionId,
      workflow_id: workflowId,
      user_id: userId,
      status: options.resumeTest ? 'running' : 'success',
      trigger: 'manual',
      input: { test: true, executionNumber },
      started_at: startedAt.toISOString(),
      finished_at: options.resumeTest ? null : new Date(startedAt.getTime() + 5000).toISOString(),
    });

  if (execError) {
    throw new Error(`Failed to create execution: ${execError.message}`);
  }

  // Create node execution steps
  const nodeTypes = ['text_formatter', 'chat_model', 'if_else', 'set_variable', 'http_request'];
  const steps = [];

  for (let i = 0; i < nodeTypes.length; i++) {
    const nodeId = `node-${i + 1}`;
    const nodeType = nodeTypes[i];
    const sequence = i + 1;

    // Determine if this node should fail
    const shouldFail = options.includeFailedNodes && i === 2; // Fail 3rd node

    let output: unknown;
    if (options.includeLargePayload && i === 3) {
      // 4th node has large payload
      output = generateLargePayload(sequence);
    } else {
      output = generateNodeOutput(nodeType, sequence);
    }

    // For resume test, stop at 3rd node
    if (options.resumeTest && i >= 2) {
      break; // Don't create steps after 3rd node
    }

    steps.push({
      execution_id: executionId,
      node_id: nodeId,
      node_name: `Node ${sequence}`,
      node_type: nodeType,
      input_json: { input: `Input for ${nodeId}` },
      output_json: shouldFail ? null : output,
      status: shouldFail ? 'failed' : 'success',
      error: shouldFail ? `Error in node ${nodeId}` : null,
      sequence,
      completed_at: new Date(startedAt.getTime() + (sequence * 1000)).toISOString(),
    });
  }

  // Insert all steps
  if (steps.length > 0) {
    const { error: stepsError } = await supabase
      .from('execution_steps')
      .insert(steps);

    if (stepsError) {
      console.error(`Failed to insert steps for execution ${executionId}:`, stepsError);
    }
  }

  // Update execution with step_outputs aggregate
  const stepOutputs: Record<string, unknown> = {};
  steps.forEach(step => {
    if (step.output_json) {
      stepOutputs[step.node_id] = step.output_json;
    }
  });

  await supabase
    .from('executions')
    .update({
      step_outputs: stepOutputs,
      current_node: steps.length > 0 ? steps[steps.length - 1].node_id : null,
    })
    .eq('id', executionId);

  return executionId;
}

/**
 * Main function to generate all test data
 */
async function generateTestData() {
  console.log('🚀 Starting test data generation...\n');

  try {
    // Create sample workflow
    console.log('📝 Creating sample workflow...');
    const workflowId = await createSampleWorkflow(supabase);
    console.log(`✅ Created workflow: ${workflowId}\n`);

    const totalExecutions = 300;
    const batchSize = 50;
    const executions: string[] = [];

    console.log(`📊 Generating ${totalExecutions} executions...\n`);

    // Generate executions in batches
    for (let batch = 0; batch < totalExecutions / batchSize; batch++) {
      const batchStart = batch * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, totalExecutions);

      console.log(`Generating batch ${batch + 1}: executions ${batchStart + 1} to ${batchEnd}...`);

      const batchPromises = [];
      for (let i = batchStart; i < batchEnd; i++) {
        const options: any = {};

        // Every 10th execution has large payload
        if (i % 10 === 0) {
          options.includeLargePayload = true;
        }

        // Every 20th execution has failed nodes
        if (i % 20 === 0) {
          options.includeFailedNodes = true;
        }

        // Every 30th execution is for resume testing
        if (i % 30 === 0) {
          options.resumeTest = true;
        }

        batchPromises.push(
          generateExecution(supabase, workflowId, i + 1, options)
            .then(id => {
              executions.push(id);
              return id;
            })
            .catch(err => {
              console.error(`Failed to generate execution ${i + 1}:`, err);
              return null;
            })
        );
      }

      await Promise.all(batchPromises);
      console.log(`✅ Batch ${batch + 1} complete (${batchEnd - batchStart} executions)\n`);
    }

    // Summary
    console.log('\n📊 Generation Summary:');
    console.log(`✅ Total executions created: ${executions.length}`);
    console.log(`✅ Workflow ID: ${workflowId}`);
    console.log(`✅ Large payload executions: ${Math.floor(totalExecutions / 10)}`);
    console.log(`✅ Failed node executions: ${Math.floor(totalExecutions / 20)}`);
    console.log(`✅ Resume test executions: ${Math.floor(totalExecutions / 30)}`);

    // Verify data
    console.log('\n🔍 Verifying data...');
    const { data: steps, error: stepsError } = await supabase
      .from('execution_steps')
      .select('id')
      .eq('execution_id', executions[0]);

    if (stepsError) {
      console.error('❌ Error verifying steps:', stepsError);
    } else {
      console.log(`✅ Verified: ${steps?.length || 0} steps for first execution`);
    }

    console.log('\n✅ Test data generation complete!');
    console.log(`\n📝 Workflow ID for testing: ${workflowId}`);
    console.log(`📝 Sample execution IDs: ${executions.slice(0, 5).join(', ')}`);

  } catch (error: any) {
    console.error('❌ Error generating test data:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  generateTestData()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

export { generateTestData, generateExecution, createSampleWorkflow };
