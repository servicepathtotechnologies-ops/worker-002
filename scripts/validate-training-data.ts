/**
 * Validate Training Data
 * 
 * Validates that all training examples follow the correct format and pass validation rules:
 * - All required fields present
 * - Connections valid (source/target nodes exist)
 * - No orphan nodes
 * - Data flow consistency
 * - No circular dependencies
 */

import * as fs from 'fs';
import * as path from 'path';

interface WorkflowNode {
  id: string;
  type: string;
  config: Record<string, any>;
}

interface Connection {
  source: string;
  target: string;
  source_output: string;
  target_input: string;
}

interface Workflow {
  summary: string;
  nodes: WorkflowNode[];
  connections: Connection[];
  required_credentials: string[];
  validation_status: 'valid' | 'needs_attention';
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a single workflow
 */
function validateWorkflow(workflow: Workflow, index: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 1. Check required fields
  if (!workflow.summary) {
    errors.push(`Example ${index}: Missing summary`);
  }
  
  if (!Array.isArray(workflow.nodes)) {
    errors.push(`Example ${index}: Nodes must be an array`);
    return { valid: false, errors, warnings };
  }
  
  if (!Array.isArray(workflow.connections)) {
    errors.push(`Example ${index}: Connections must be an array`);
    return { valid: false, errors, warnings };
  }
  
  if (!Array.isArray(workflow.required_credentials)) {
    errors.push(`Example ${index}: required_credentials must be an array`);
  }
  
  if (!['valid', 'needs_attention'].includes(workflow.validation_status)) {
    errors.push(`Example ${index}: Invalid validation_status: ${workflow.validation_status}`);
  }
  
  // 2. Check node IDs are unique
  const nodeIds = new Set<string>();
  workflow.nodes.forEach((node, i) => {
    if (!node.id) {
      errors.push(`Example ${index}, Node ${i}: Missing id`);
    } else if (nodeIds.has(node.id)) {
      errors.push(`Example ${index}, Node ${i}: Duplicate node id: ${node.id}`);
    } else {
      nodeIds.add(node.id);
    }
    
    if (!node.type) {
      errors.push(`Example ${index}, Node ${i}: Missing type`);
    }
    
    if (!node.config || typeof node.config !== 'object') {
      errors.push(`Example ${index}, Node ${i}: Missing or invalid config`);
    }
  });
  
  // 3. Check connections reference valid nodes
  workflow.connections.forEach((conn, i) => {
    if (!nodeIds.has(conn.source)) {
      errors.push(`Example ${index}, Connection ${i}: Source node not found: ${conn.source}`);
    }
    
    if (!nodeIds.has(conn.target)) {
      errors.push(`Example ${index}, Connection ${i}: Target node not found: ${conn.target}`);
    }
    
    if (!conn.source_output) {
      errors.push(`Example ${index}, Connection ${i}: Missing source_output`);
    }
    
    if (!conn.target_input) {
      errors.push(`Example ${index}, Connection ${i}: Missing target_input`);
    }
  });
  
  // 4. Check for orphan nodes (nodes with no connections, except triggers)
  const connectedNodes = new Set<string>();
  workflow.connections.forEach(conn => {
    connectedNodes.add(conn.source);
    connectedNodes.add(conn.target);
  });
  
  const triggerTypes = new Set(['webhook', 'chat_trigger', 'form', 'schedule', 'manual_trigger', 'interval', 'workflow_trigger', 'error_trigger']);
  
  workflow.nodes.forEach((node, i) => {
    const isTrigger = triggerTypes.has(node.type);
    const isConnected = connectedNodes.has(node.id);
    
    if (!isTrigger && !isConnected && workflow.nodes.length > 1) {
      warnings.push(`Example ${index}, Node ${i} (${node.id}): Orphan node - not connected to workflow`);
    }
  });
  
  // 5. Check for circular dependencies (simple check - not exhaustive)
  const visited = new Set<string>();
  const recStack = new Set<string>();
  
  function hasCycle(nodeId: string): boolean {
    if (recStack.has(nodeId)) {
      return true; // Cycle detected
    }
    
    if (visited.has(nodeId)) {
      return false; // Already processed
    }
    
    visited.add(nodeId);
    recStack.add(nodeId);
    
    const outgoing = workflow.connections.filter(c => c.source === nodeId);
    for (const conn of outgoing) {
      if (hasCycle(conn.target)) {
        return true;
      }
    }
    
    recStack.delete(nodeId);
    return false;
  }
  
  workflow.nodes.forEach(node => {
    if (hasCycle(node.id)) {
      errors.push(`Example ${index}: Circular dependency detected involving node ${node.id}`);
    }
  });
  
  // 6. Check for placeholder values in config
  workflow.nodes.forEach((node, i) => {
    const configStr = JSON.stringify(node.config);
    if (configStr.includes('TODO') || configStr.includes('PLACEHOLDER') || configStr.includes('FIXME')) {
      warnings.push(`Example ${index}, Node ${i} (${node.id}): Contains placeholder values in config`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Main validation function
 */
function main() {
  console.log('🔍 Validating training dataset...\n');
  
  const datasetPath = path.join(__dirname, '../data/training_dataset_v2.json');
  
  if (!fs.existsSync(datasetPath)) {
    console.error(`❌ Dataset not found: ${datasetPath}`);
    console.log('💡 Run generate-training-dataset.ts first!');
    process.exit(1);
  }
  
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  const examples = dataset.examples || [];
  
  console.log(`📊 Validating ${examples.length} examples...\n`);
  
  let totalErrors = 0;
  let totalWarnings = 0;
  const invalidExamples: number[] = [];
  
  examples.forEach((example: any, index: number) => {
    if (!example.workflow) {
      console.error(`❌ Example ${index}: Missing workflow`);
      totalErrors++;
      invalidExamples.push(index);
      return;
    }
    
    const result = validateWorkflow(example.workflow, index);
    
    if (!result.valid) {
      totalErrors += result.errors.length;
      invalidExamples.push(index);
      console.error(`❌ Example ${index}: ${result.errors.length} error(s)`);
      result.errors.forEach(err => console.error(`   - ${err}`));
    }
    
    if (result.warnings.length > 0) {
      totalWarnings += result.warnings.length;
      console.warn(`⚠️  Example ${index}: ${result.warnings.length} warning(s)`);
      result.warnings.forEach(warn => console.warn(`   - ${warn}`));
    }
  });
  
  console.log('\n📈 Validation Summary:');
  console.log(`   ✅ Valid examples: ${examples.length - invalidExamples.length}`);
  console.log(`   ❌ Invalid examples: ${invalidExamples.length}`);
  console.log(`   ⚠️  Total warnings: ${totalWarnings}`);
  console.log(`   🔴 Total errors: ${totalErrors}`);
  
  if (invalidExamples.length > 0) {
    console.log(`\n❌ Invalid example indices: ${invalidExamples.join(', ')}`);
    process.exit(1);
  } else {
    console.log('\n✅ All examples are valid!');
  }
}

if (require.main === module) {
  main();
}

export { validateWorkflow, ValidationResult };
