/**
 * Verify Test Data
 * 
 * Verifies that test data was generated correctly
 * and checks all enterprise architecture features.
 */

import { SupabaseClient, createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifyTestData() {
  console.log('🔍 Verifying test data...\n');

  try {
    // 1. Check total executions
    const { data: executions, error: execError } = await supabase
      .from('executions')
      .select('id, status, current_node, step_outputs')
      .limit(1000);

    if (execError) {
      throw new Error(`Failed to fetch executions: ${execError.message}`);
    }

    console.log(`✅ Total executions found: ${executions?.length || 0}`);

    // 2. Check execution_steps
    const { data: steps, error: stepsError } = await supabase
      .from('execution_steps')
      .select('id, execution_id, node_id, output_json, status')
      .limit(1000);

    if (stepsError) {
      throw new Error(`Failed to fetch steps: ${stepsError.message}`);
    }

    console.log(`✅ Total execution steps found: ${steps?.length || 0}`);

    // 3. Check for large payloads (object storage references)
    const largePayloads = steps?.filter(step => {
      if (!step.output_json || typeof step.output_json !== 'object') return false;
      const output = step.output_json as any;
      return output._storage === 's3';
    }) || [];

    console.log(`✅ Large payload references found: ${largePayloads.length}`);

    // 4. Check for resume test executions (status = 'running')
    const runningExecutions = executions?.filter(e => e.status === 'running') || [];
    console.log(`✅ Resume test executions (running): ${runningExecutions.length}`);

    // 5. Check for failed executions
    const failedExecutions = executions?.filter(e => e.status === 'failed') || [];
    console.log(`✅ Failed executions: ${failedExecutions.length}`);

    // 6. Check step_outputs aggregates
    const withStepOutputs = executions?.filter(e => 
      e.step_outputs && 
      typeof e.step_outputs === 'object' && 
      Object.keys(e.step_outputs as any).length > 0
    ) || [];
    console.log(`✅ Executions with step_outputs: ${withStepOutputs.length}`);

    // 7. Sample data verification
    if (executions && executions.length > 0) {
      const sample = executions[0];
      console.log(`\n📋 Sample Execution:`);
      console.log(`   ID: ${sample.id}`);
      console.log(`   Status: ${sample.status}`);
      console.log(`   Current Node: ${sample.current_node || 'N/A'}`);
      console.log(`   Step Outputs: ${Object.keys((sample.step_outputs as any) || {}).length} nodes`);
    }

    // 8. Check data distribution
    const statusCounts: Record<string, number> = {};
    executions?.forEach(e => {
      statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
    });

    console.log(`\n📊 Status Distribution:`);
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });

    console.log('\n✅ Verification complete!');
  } catch (error: any) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  verifyTestData()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

export { verifyTestData };
