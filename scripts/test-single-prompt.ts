/**
 * Test single prompt workflow generation
 * Directly tests workflow builder without API server
 */

import { AgenticWorkflowBuilder } from '../src/services/ai/workflow-builder';

const prompt = "Capture leads from website, qualify using AI, store in CRM, notify sales, and respond automatically.";

async function testPrompt() {
  console.log('='.repeat(80));
  console.log('Testing Workflow Generation');
  console.log('='.repeat(80));
  console.log(`Prompt: ${prompt}`);
  console.log('='.repeat(80));
  console.log('');

  try {
    const builder = new AgenticWorkflowBuilder();
    
    console.log('Starting workflow generation...');
    const startTime = Date.now();
    
    const result = await builder.generateFromPrompt(prompt, {});
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('');
    console.log('='.repeat(80));
    console.log('✅ Workflow Generation Complete');
    console.log('='.repeat(80));
    console.log(`Duration: ${duration.toFixed(2)}s`);
    console.log('');
    
    if (result.nodes) {
      console.log(`Generated ${result.nodes.length} nodes:`);
      result.nodes.forEach((node: any, index: number) => {
        const nodeType = node.data?.type || node.type || 'unknown';
        console.log(`  ${index + 1}. ${nodeType} (${node.id})`);
      });
      console.log('');
    }
    
    if (result.edges) {
      console.log(`Generated ${result.edges.length} edges`);
      console.log('');
    }
    
    if (result.errors && result.errors.length > 0) {
      console.log('❌ Errors:');
      result.errors.forEach((error: string, index: number) => {
        console.log(`  ${index + 1}. ${error}`);
      });
      console.log('');
    }
    
    if (result.warnings && result.warnings.length > 0) {
      console.log('⚠️  Warnings:');
      result.warnings.forEach((warning: string, index: number) => {
        console.log(`  ${index + 1}. ${warning}`);
      });
      console.log('');
    }
    
    console.log('='.repeat(80));
    console.log('Full Result:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error: any) {
    console.error('');
    console.error('='.repeat(80));
    console.error('❌ ERROR OCCURRED');
    console.error('='.repeat(80));
    console.error(`Error Type: ${error.constructor.name}`);
    console.error(`Error Message: ${error.message}`);
    console.error('');
    
    if (error.stack) {
      console.error('Stack Trace:');
      console.error(error.stack);
      console.error('');
    }
    
    if (error.cause) {
      console.error('Cause:');
      console.error(error.cause);
      console.error('');
    }
    
    // Try to extract more details
    if (error.response) {
      console.error('Response Data:');
      console.error(JSON.stringify(error.response, null, 2));
      console.error('');
    }
    
    process.exit(1);
  }
}

// Run the test
testPrompt().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
