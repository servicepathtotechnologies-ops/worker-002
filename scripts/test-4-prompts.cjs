/**
 * Test 4 Prompts - Simple CommonJS version
 * Tests the first 4 prompts from test_prompts.json
 */

const fs = require('fs');
const path = require('path');

// Load environment variables first - use ts-node to load TypeScript files
const tsNode = require('ts-node');
tsNode.register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs'
  }
});

require('../src/core/env-loader');
const { agenticWorkflowBuilder } = require('../src/services/ai/workflow-builder');

// Get directory name
const scriptDir = path.dirname(__filename || process.argv[1] || '.');

// Load test prompts - limit to first 4
const testPromptsPath = path.join(scriptDir, '../data/test_prompts.json');
const testData = JSON.parse(fs.readFileSync(testPromptsPath, 'utf-8'));
const prompts = testData.test_prompts.slice(0, 4);

async function runTests() {
  console.log('🧪 Testing 4 Prompts\n');
  
  for (let i = 0; i < prompts.length; i++) {
    const testPrompt = prompts[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Test ${i + 1}/4: ${testPrompt.name}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`📝 Prompt: "${testPrompt.prompt}"`);
    console.log(`\n⏳ Generating workflow...`);
    
    try {
      const startTime = Date.now();
      
      const workflow = await agenticWorkflowBuilder.generateFromPrompt(
        testPrompt.prompt,
        {},
        (progress) => {
          if (progress.stepName) {
            process.stdout.write(`\r   ${progress.stepName}... (${progress.progress || 0}%)`);
          }
        }
      );
      
      const responseTime = Date.now() - startTime;
      process.stdout.write('\n');
      
      console.log(`✅ Workflow generated successfully! (${responseTime}ms)`);
      
      if (workflow.workflow?.nodes) {
        const nodeTypes = workflow.workflow.nodes.map(n => n.data?.type || n.type || 'unknown');
        console.log(`\n📊 Generated ${workflow.workflow.nodes.length} nodes: ${nodeTypes.join(', ')}`);
        console.log(`   Expected: ${testPrompt.expected_nodes.join(', ')}`);
      }
      
      if (workflow.requiredCredentials) {
        console.log(`\n🔐 Required Credentials: ${workflow.requiredCredentials.map(c => c.provider || c).join(', ')}`);
        console.log(`   Expected: ${testPrompt.expected_credentials.join(', ')}`);
      }
      
      if (workflow.validation) {
        console.log(`\n✅ Validation: ${workflow.validation.valid ? 'PASSED' : 'NEEDS ATTENTION'}`);
        if (workflow.validation.errors?.length > 0) {
          console.log(`   Errors: ${workflow.validation.errors.length}`);
          workflow.validation.errors.slice(0, 3).forEach(err => {
            console.log(`   - ${err}`);
          });
        }
        if (workflow.validation.warnings?.length > 0) {
          console.log(`   Warnings: ${workflow.validation.warnings.length}`);
          workflow.validation.warnings.slice(0, 3).forEach(warn => {
            console.log(`   - ${warn}`);
          });
        }
      }
      
    } catch (error) {
      console.log(`\n❌ Error: ${error.message}`);
      if (error.stack) {
        console.log(`\nStack trace:`);
        console.log(error.stack.split('\n').slice(0, 5).join('\n'));
      }
    }
    
    // Wait between tests
    if (i < prompts.length - 1) {
      console.log(`\n⏸️  Waiting 2 seconds before next test...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ Testing Complete');
  console.log(`${'='.repeat(80)}\n`);
}

// Ensure __filename is available
if (typeof __filename === 'undefined') {
  global.__filename = process.argv[1];
}

runTests().catch(console.error);
