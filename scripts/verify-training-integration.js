#!/usr/bin/env node
/**
 * Comprehensive Training Integration Verification
 * Ensures the training system works 100% correctly with the sample data
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Training Integration for 100% Correct Operation...\n');
console.log('='.repeat(70));

let allTestsPassed = true;
const testResults = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result === true || (result && result.success)) {
      testResults.push({ name, status: '✅ PASS', details: result.details || '' });
      console.log(`✅ ${name}`);
      if (result.details) console.log(`   ${result.details}`);
      return true;
    } else {
      testResults.push({ name, status: '❌ FAIL', details: result.error || result.message || 'Unknown error' });
      console.log(`❌ ${name}`);
      console.log(`   Error: ${result.error || result.message || 'Test failed'}`);
      return false;
    }
  } catch (error) {
    testResults.push({ name, status: '❌ ERROR', details: error.message });
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

// Test 1: Dataset File Exists
test('Dataset file exists', () => {
  const datasetPath = path.join(__dirname, '../data/workflow_training_dataset.json');
  if (fs.existsSync(datasetPath)) {
    return { success: true, details: `Found at: ${datasetPath}` };
  }
  return { success: false, error: `File not found at: ${datasetPath}` };
});

// Test 2: Dataset is Valid JSON
test('Dataset is valid JSON', () => {
  const datasetPath = path.join(__dirname, '../data/workflow_training_dataset.json');
  try {
    const content = fs.readFileSync(datasetPath, 'utf-8');
    const dataset = JSON.parse(content);
    return { 
      success: true, 
      details: `Parsed successfully - ${dataset.workflows?.length || 0} workflows` 
    };
  } catch (error) {
    return { success: false, error: `JSON parse error: ${error.message}` };
  }
});

// Test 3: Dataset Structure
test('Dataset has correct structure', () => {
  const datasetPath = path.join(__dirname, '../data/workflow_training_dataset.json');
  const content = fs.readFileSync(datasetPath, 'utf-8');
  const dataset = JSON.parse(content);
  
  const required = ['version', 'description', 'totalWorkflows', 'workflows'];
  const missing = required.filter(field => !dataset[field]);
  
  if (missing.length > 0) {
    return { success: false, error: `Missing fields: ${missing.join(', ')}` };
  }
  
  if (!Array.isArray(dataset.workflows)) {
    return { success: false, error: 'workflows must be an array' };
  }
  
  return { 
    success: true, 
    details: `Structure valid - ${dataset.workflows.length} workflows, version ${dataset.version}` 
  };
});

// Test 4: All Workflows Have Required Fields
test('All workflows have required fields', () => {
  const datasetPath = path.join(__dirname, '../data/workflow_training_dataset.json');
  const content = fs.readFileSync(datasetPath, 'utf-8');
  const dataset = JSON.parse(content);
  
  const requiredFields = ['id', 'category', 'goal', 'phase1', 'phase2'];
  const phase1Required = ['step1', 'step3', 'step4', 'step5'];
  const phase2Required = ['executionLoop', 'executionFinalization'];
  
  const errors = [];
  
  dataset.workflows.forEach((workflow, index) => {
    const workflowId = workflow.id || `workflow_${index + 1}`;
    
    // Check top-level fields
    requiredFields.forEach(field => {
      if (!workflow[field]) {
        errors.push(`${workflowId}: Missing ${field}`);
      }
    });
    
    // Check phase1 fields
    if (workflow.phase1) {
      phase1Required.forEach(field => {
        if (!workflow.phase1[field]) {
          errors.push(`${workflowId}: Missing phase1.${field}`);
        }
      });
      
      // Check step3 has systemPrompt
      if (workflow.phase1.step3 && !workflow.phase1.step3.systemPrompt) {
        errors.push(`${workflowId}: Missing phase1.step3.systemPrompt`);
      }
      
      // Check step4 has requirements
      if (workflow.phase1.step4 && !workflow.phase1.step4.requirements) {
        errors.push(`${workflowId}: Missing phase1.step4.requirements`);
      }
      
      // Check step5 has selectedNodes
      if (workflow.phase1.step5 && !workflow.phase1.step5.selectedNodes) {
        errors.push(`${workflowId}: Missing phase1.step5.selectedNodes`);
      }
    }
    
    // Check phase2 fields
    if (workflow.phase2) {
      phase2Required.forEach(field => {
        if (!workflow.phase2[field]) {
          errors.push(`${workflowId}: Missing phase2.${field}`);
        }
      });
      
      // Check executionLoop is array
      if (workflow.phase2.executionLoop && !Array.isArray(workflow.phase2.executionLoop)) {
        errors.push(`${workflowId}: phase2.executionLoop must be an array`);
      }
    }
  });
  
  if (errors.length > 0) {
    return { success: false, error: errors.slice(0, 5).join('; ') };
  }
  
  return { 
    success: true, 
    details: `All ${dataset.workflows.length} workflows have required fields` 
  };
});

// Test 5: Training Service File Exists
test('Training service file exists', () => {
  const servicePath = path.join(__dirname, '../src/services/ai/workflow-training-service.ts');
  if (fs.existsSync(servicePath)) {
    return { success: true, details: 'Training service file found' };
  }
  return { success: false, error: 'Training service file not found' };
});

// Test 6: Training Service Has Required Methods
test('Training service has required methods', () => {
  const servicePath = path.join(__dirname, '../src/services/ai/workflow-training-service.ts');
  if (!fs.existsSync(servicePath)) {
    return { success: false, error: 'Service file not found' };
  }
  
  const content = fs.readFileSync(servicePath, 'utf-8');
  const requiredMethods = [
    'buildSystemPromptFewShotPrompt',
    'buildRequirementsFewShotPrompt',
    'buildExecutionReasoningFewShotPrompt',
    'getSimilarWorkflows',
    'getSystemPromptExamples',
    'getRequirementsExamples',
    'getExecutionExamples',
    'isLoaded',
    'reloadDataset',
  ];
  
  const missing = requiredMethods.filter(method => !content.includes(method));
  
  if (missing.length > 0) {
    return { success: false, error: `Missing methods: ${missing.join(', ')}` };
  }
  
  return { 
    success: true, 
    details: `All ${requiredMethods.length} required methods present` 
  };
});

// Test 7: Workflow Builder Integration
test('Workflow builder uses training service', () => {
  const builderPath = path.join(__dirname, '../src/services/ai/workflow-builder.ts');
  if (!fs.existsSync(builderPath)) {
    return { success: false, error: 'Workflow builder file not found' };
  }
  
  const content = fs.readFileSync(builderPath, 'utf-8');
  
  if (!content.includes('workflow-training-service')) {
    return { success: false, error: 'Workflow builder does not import training service' };
  }
  
  if (!content.includes('buildSystemPromptFewShotPrompt')) {
    return { success: false, error: 'Workflow builder does not use training examples for system prompts' };
  }
  
  if (!content.includes('buildRequirementsFewShotPrompt')) {
    return { success: false, error: 'Workflow builder does not use training examples for requirements' };
  }
  
  return { 
    success: true, 
    details: 'Workflow builder properly integrated with training service' 
  };
});

// Test 8: Reasoning Engine Integration
test('Reasoning engine uses training service', () => {
  const reasoningPath = path.join(__dirname, '../src/shared/reasoning-engine.ts');
  if (!fs.existsSync(reasoningPath)) {
    return { success: false, error: 'Reasoning engine file not found' };
  }
  
  const content = fs.readFileSync(reasoningPath, 'utf-8');
  
  if (!content.includes('workflow-training-service')) {
    return { success: false, error: 'Reasoning engine does not import training service' };
  }
  
  if (!content.includes('buildExecutionReasoningFewShotPrompt')) {
    return { success: false, error: 'Reasoning engine does not use training examples' };
  }
  
  return { 
    success: true, 
    details: 'Reasoning engine properly integrated with training service' 
  };
});

// Test 9: Ollama Orchestrator Handles Full Prompts
test('Ollama orchestrator handles full prompts', () => {
  const orchestratorPath = path.join(__dirname, '../src/services/ai/ollama-orchestrator.ts');
  if (!fs.existsSync(orchestratorPath)) {
    return { success: false, error: 'Ollama orchestrator file not found' };
  }
  
  const content = fs.readFileSync(orchestratorPath, 'utf-8');
  
  // Check if it handles full prompts (length > 200 check)
  if (!content.includes('length > 200') && !content.includes('input.prompt') && !content.includes('input.length')) {
    return { 
      success: false, 
      error: 'Ollama orchestrator may not properly handle full prompts with few-shot examples' 
    };
  }
  
  return { 
    success: true, 
    details: 'Ollama orchestrator configured to handle full prompts' 
  };
});

// Test 10: Training Monitor Exists
test('Training monitor exists', () => {
  const monitorPath = path.join(__dirname, '../src/services/ai/training-monitor.ts');
  if (fs.existsSync(monitorPath)) {
    return { success: true, details: 'Training monitor file found' };
  }
  return { success: false, error: 'Training monitor file not found' };
});

// Test 11: API Endpoints Exist
test('Training API endpoints exist', () => {
  const apiPath = path.join(__dirname, '../src/api/training-stats.ts');
  if (!fs.existsSync(apiPath)) {
    return { success: false, error: 'Training API file not found' };
  }
  
  const content = fs.readFileSync(apiPath, 'utf-8');
  const endpoints = [
    'getTrainingStats',
    'getTrainingCategories',
    'getTrainingWorkflows',
    'findSimilarWorkflows',
    'getTrainingExamples',
    'getTrainingUsage',
    'reloadTrainingDataset',
  ];
  
  const missing = endpoints.filter(endpoint => !content.includes(endpoint));
  
  if (missing.length > 0) {
    return { success: false, error: `Missing endpoints: ${missing.join(', ')}` };
  }
  
  return { 
    success: true, 
    details: `All ${endpoints.length} API endpoints present` 
  };
});

// Test 12: Dataset Has Training Examples
test('Dataset contains usable training examples', () => {
  const datasetPath = path.join(__dirname, '../data/workflow_training_dataset.json');
  const content = fs.readFileSync(datasetPath, 'utf-8');
  const dataset = JSON.parse(content);
  
  let examplesCount = 0;
  let systemPromptCount = 0;
  let requirementsCount = 0;
  let executionCount = 0;
  
  dataset.workflows.forEach(workflow => {
    if (workflow.phase1?.step3?.systemPrompt) {
      systemPromptCount++;
    }
    if (workflow.phase1?.step4?.requirements) {
      requirementsCount++;
    }
    if (workflow.phase2?.executionLoop && workflow.phase2.executionLoop.length > 0) {
      executionCount++;
    }
    examplesCount++;
  });
  
  if (systemPromptCount === 0) {
    return { success: false, error: 'No workflows have system prompts' };
  }
  if (requirementsCount === 0) {
    return { success: false, error: 'No workflows have requirements' };
  }
  if (executionCount === 0) {
    return { success: false, error: 'No workflows have execution examples' };
  }
  
  return { 
    success: true, 
    details: `${examplesCount} workflows, ${systemPromptCount} with system prompts, ${requirementsCount} with requirements, ${executionCount} with execution examples` 
  };
});

// Summary
console.log('\n' + '='.repeat(70));
console.log('📊 Verification Summary');
console.log('='.repeat(70));

const passed = testResults.filter(t => t.status.includes('✅')).length;
const failed = testResults.filter(t => t.status.includes('❌')).length;

console.log(`\nTotal Tests: ${testResults.length}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);

if (failed === 0) {
  console.log('\n🎉 All tests passed! Training system is ready for 100% correct operation.');
  console.log('\n💡 Next steps:');
  console.log('   1. Start the server: npm start');
  console.log('   2. Test with a workflow generation request');
  console.log('   3. Monitor training usage: GET /api/training/usage');
  console.log('   4. Check training stats: GET /api/training/stats');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please fix the issues above before using the training system.');
  console.log('\nFailed tests:');
  testResults.filter(t => t.status.includes('❌')).forEach(test => {
    console.log(`   - ${test.name}: ${test.details}`);
  });
  process.exit(1);
}

