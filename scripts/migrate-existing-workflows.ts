/**
 * Migration Script for Existing Workflows
 * Migrates existing workflows to use normalized node types and schema validation
 */

import * as fs from 'fs';
import * as path from 'path';
import { WorkflowAutoRepair } from '../src/core/contracts/workflow-auto-repair';
import { NodeSchemaRegistry } from '../src/core/contracts/node-schema-registry';
import { normalizeNodeType } from '../src/core/utils/node-type-normalizer';
import type { Workflow } from '../src/core/contracts/types';

const autoRepair = new WorkflowAutoRepair();
const schemaRegistry = NodeSchemaRegistry.getInstance();

interface WorkflowFile {
  id: string;
  name?: string;
  workflow: Workflow;
  filePath: string;
}

/**
 * Load workflows from directory
 */
function loadWorkflowsFromDirectory(dirPath: string): WorkflowFile[] {
  const workflows: WorkflowFile[] = [];
  
  if (!fs.existsSync(dirPath)) {
    console.warn(`⚠️  Directory not found: ${dirPath}`);
    return workflows;
  }
  
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(dirPath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const workflow = JSON.parse(content);
        
        workflows.push({
          id: workflow.id || path.basename(file, '.json'),
          name: workflow.name,
          workflow: workflow,
          filePath: filePath
        });
      } catch (error) {
        console.error(`❌ Error loading ${file}:`, error);
      }
    }
  }
  
  return workflows;
}

/**
 * Migrate a single workflow
 */
function migrateWorkflow(workflowFile: WorkflowFile): {
  success: boolean;
  fixes: string[];
  errors: string[];
} {
  const { workflow } = workflowFile;
  
  try {
    // Step 1: Normalize all node types
    workflow.nodes = workflow.nodes.map(node => {
      const normalizedType = normalizeNodeType(node);
      if (normalizedType && normalizedType !== 'custom') {
        if (!node.data) node.data = {};
        node.data.type = normalizedType;
        node.type = 'custom'; // Frontend compatibility
      }
      return node;
    });
    
    // Step 2: Auto-repair
    const result = autoRepair.validateAndRepair(workflow, 3);
    
    if (result.valid) {
      // Step 3: Save migrated workflow
      const backupPath = workflowFile.filePath + '.backup';
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(workflowFile.filePath, backupPath);
      }
      
      fs.writeFileSync(
        workflowFile.filePath,
        JSON.stringify(result.repairedWorkflow, null, 2)
      );
      
      return {
        success: true,
        fixes: result.fixes,
        errors: []
      };
    } else {
      return {
        success: false,
        fixes: result.fixes,
        errors: result.errors
      };
    }
  } catch (error) {
    return {
      success: false,
      fixes: [],
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

/**
 * Main migration function
 */
async function migrateWorkflows() {
  console.log('🚀 Starting workflow migration...');
  console.log('='.repeat(50));
  
  // Find workflow directories
  const workflowDirs = [
    path.join(__dirname, '../test_workflows'),
    path.join(__dirname, '../../ctrl_checks/test_workflows'),
    path.join(__dirname, '../data/workflows')
  ];
  
  let allWorkflows: WorkflowFile[] = [];
  
  for (const dir of workflowDirs) {
    const workflows = loadWorkflowsFromDirectory(dir);
    allWorkflows = allWorkflows.concat(workflows);
  }
  
  if (allWorkflows.length === 0) {
    console.log('ℹ️  No workflow files found to migrate');
    return;
  }
  
  console.log(`📦 Found ${allWorkflows.length} workflows to migrate\n`);
  
  let successCount = 0;
  let failCount = 0;
  const allFixes: string[] = [];
  const allErrors: string[] = [];
  
  for (const workflowFile of allWorkflows) {
    console.log(`\n🔍 Migrating: ${workflowFile.name || workflowFile.id}`);
    
    const result = migrateWorkflow(workflowFile);
    
    if (result.success) {
      successCount++;
      console.log(`✅ Successfully migrated`);
      if (result.fixes.length > 0) {
        console.log(`   Fixes applied: ${result.fixes.length}`);
        allFixes.push(...result.fixes);
      }
    } else {
      failCount++;
      console.log(`❌ Migration failed`);
      if (result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.join(', ')}`);
        allErrors.push(...result.errors);
      }
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Migration Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`   🔧 Total fixes applied: ${allFixes.length}`);
  console.log(`   ⚠️  Total errors: ${allErrors.length}`);
  
  if (allFixes.length > 0) {
    console.log('\n🔧 Common fixes applied:');
    const fixCounts = new Map<string, number>();
    allFixes.forEach(fix => {
      const key = fix.split(':')[0] || fix;
      fixCounts.set(key, (fixCounts.get(key) || 0) + 1);
    });
    fixCounts.forEach((count, fix) => {
      console.log(`   - ${fix}: ${count} times`);
    });
  }
  
  console.log('\n🎉 Migration completed!');
}

// Run migration if called directly
if (require.main === module) {
  migrateWorkflows().catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}

export { migrateWorkflows, migrateWorkflow };
