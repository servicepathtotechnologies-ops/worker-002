#!/usr/bin/env node
/**
 * Training Dataset Validation Script
 * Validates the structure and content of the workflow training dataset
 */

const fs = require('fs');
const path = require('path');

const datasetPath = path.join(__dirname, '../data/workflow_training_dataset.json');

console.log('🔍 Validating Training Dataset...\n');

try {
  // Read and parse dataset
  const fileContent = fs.readFileSync(datasetPath, 'utf-8');
  const dataset = JSON.parse(fileContent);

  let errors = [];
  let warnings = [];
  let stats = {
    totalWorkflows: 0,
    validWorkflows: 0,
    invalidWorkflows: 0,
    categories: new Set(),
    totalExecutionIterations: 0,
  };

  // Validate top-level structure
  if (!dataset.version) {
    errors.push('Missing version field');
  }
  if (!dataset.description) {
    warnings.push('Missing description field');
  }
  if (!dataset.workflows || !Array.isArray(dataset.workflows)) {
    errors.push('Missing or invalid workflows array');
    process.exit(1);
  }

  stats.totalWorkflows = dataset.workflows.length;

  // Validate each workflow
  dataset.workflows.forEach((workflow, index) => {
    const workflowId = workflow.id || `workflow_${index + 1}`;
    let workflowValid = true;

    // Required fields
    if (!workflow.id) {
      errors.push(`Workflow ${index + 1}: Missing id`);
      workflowValid = false;
    }
    if (!workflow.category) {
      warnings.push(`Workflow ${workflowId}: Missing category`);
    } else {
      stats.categories.add(workflow.category);
    }
    if (!workflow.goal) {
      errors.push(`Workflow ${workflowId}: Missing goal`);
      workflowValid = false;
    }

    // Phase 1 validation
    if (!workflow.phase1) {
      errors.push(`Workflow ${workflowId}: Missing phase1`);
      workflowValid = false;
    } else {
      if (!workflow.phase1.step1 || !workflow.phase1.step1.userPrompt) {
        errors.push(`Workflow ${workflowId}: Missing phase1.step1.userPrompt`);
        workflowValid = false;
      }
      if (!workflow.phase1.step3 || !workflow.phase1.step3.systemPrompt) {
        errors.push(`Workflow ${workflowId}: Missing phase1.step3.systemPrompt`);
        workflowValid = false;
      }
      if (!workflow.phase1.step4 || !workflow.phase1.step4.requirements) {
        errors.push(`Workflow ${workflowId}: Missing phase1.step4.requirements`);
        workflowValid = false;
      }
      if (!workflow.phase1.step5 || !workflow.phase1.step5.selectedNodes) {
        errors.push(`Workflow ${workflowId}: Missing phase1.step5.selectedNodes`);
        workflowValid = false;
      }
      if (!workflow.phase1.step5.connections || !Array.isArray(workflow.phase1.step5.connections)) {
        warnings.push(`Workflow ${workflowId}: Missing or invalid phase1.step5.connections`);
      }
    }

    // Phase 2 validation
    if (!workflow.phase2) {
      errors.push(`Workflow ${workflowId}: Missing phase2`);
      workflowValid = false;
    } else {
      if (!workflow.phase2.executionLoop || !Array.isArray(workflow.phase2.executionLoop)) {
        errors.push(`Workflow ${workflowId}: Missing or invalid phase2.executionLoop`);
        workflowValid = false;
      } else {
        stats.totalExecutionIterations += workflow.phase2.executionLoop.length;
      }
      if (!workflow.phase2.executionFinalization) {
        errors.push(`Workflow ${workflowId}: Missing phase2.executionFinalization`);
        workflowValid = false;
      } else {
        if (workflow.phase2.executionFinalization.totalIterations === undefined) {
          warnings.push(`Workflow ${workflowId}: Missing totalIterations in executionFinalization`);
        }
        if (workflow.phase2.executionFinalization.goalAchieved === undefined) {
          warnings.push(`Workflow ${workflowId}: Missing goalAchieved in executionFinalization`);
        }
      }
    }

    if (workflowValid) {
      stats.validWorkflows++;
    } else {
      stats.invalidWorkflows++;
    }
  });

  // Validate metrics
  if (dataset.trainingMetrics) {
    if (dataset.trainingMetrics.totalWorkflows !== stats.totalWorkflows) {
      warnings.push(`Training metrics totalWorkflows (${dataset.trainingMetrics.totalWorkflows}) doesn't match actual workflows (${stats.totalWorkflows})`);
    }
  }

  // Print results
  console.log('📊 Validation Results:\n');
  console.log(`Total Workflows: ${stats.totalWorkflows}`);
  console.log(`Valid Workflows: ${stats.validWorkflows}`);
  console.log(`Invalid Workflows: ${stats.invalidWorkflows}`);
  console.log(`Categories: ${Array.from(stats.categories).join(', ')}`);
  console.log(`Total Execution Iterations: ${stats.totalExecutionIterations}\n`);

  if (errors.length > 0) {
    console.log('❌ Errors:');
    errors.forEach(error => console.log(`   - ${error}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    warnings.forEach(warning => console.log(`   - ${warning}`));
    console.log('');
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Dataset is valid! All workflows pass validation.\n');
    process.exit(0);
  } else if (errors.length === 0) {
    console.log('✅ Dataset is valid with warnings. All required fields are present.\n');
    process.exit(0);
  } else {
    console.log('❌ Dataset validation failed. Please fix the errors above.\n');
    process.exit(1);
  }

} catch (error) {
  console.error('❌ Failed to validate dataset:', error.message);
  if (error instanceof SyntaxError) {
    console.error('   This looks like a JSON syntax error. Please check the file format.');
  }
  process.exit(1);
}

