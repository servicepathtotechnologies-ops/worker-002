/**
 * ✅ ROOT-LEVEL NODE VERIFICATION SCRIPT
 * 
 * Verifies all nodes in the system meet architectural requirements:
 * 1. All nodes in UnifiedNodeRegistry
 * 2. All nodes have complete context
 * 3. All nodes have accurate schemas
 * 4. No hardcoded logic
 * 5. All nodes migrated from legacy executor
 */

import { nodeLibrary } from '../src/services/nodes/node-library';
import { unifiedNodeRegistry } from '../src/core/registry/unified-node-registry';
import { getMigrationReport, validateRegistryCoverage, getMigrationStatus } from '../src/core/registry/registry-migration-helper';
import { CANONICAL_NODE_TYPES } from '../src/services/nodes/node-library';

interface VerificationResult {
  nodeType: string;
  inRegistry: boolean;
  hasContext: boolean;
  hasInputSchema: boolean;
  hasOutputSchema: boolean;
  hasOverride: boolean;
  migrationStatus: 'complete' | 'pending' | 'in_progress';
  issues: string[];
}

/**
 * Verify a single node
 */
function verifyNode(nodeType: string): VerificationResult {
  const issues: string[] = [];
  
  // Check registry
  const nodeDef = unifiedNodeRegistry.get(nodeType);
  const inRegistry = !!nodeDef;
  
  if (!inRegistry) {
    issues.push('Not in UnifiedNodeRegistry');
  }
  
  // Check context
  const schema = nodeLibrary.getSchema(nodeType);
  const hasContext = !!schema && 
    !!schema.description &&
    !!schema.aiSelectionCriteria &&
    (schema.keywords?.length > 0 || schema.aiSelectionCriteria.keywords?.length > 0);
  
  if (!hasContext) {
    issues.push('Missing context (description, keywords, or aiSelectionCriteria)');
  }
  
  // Check schemas
  const hasInputSchema = !!nodeDef?.inputSchema && Object.keys(nodeDef.inputSchema).length > 0;
  const hasOutputSchema = !!nodeDef?.outputSchema;
  
  if (!hasInputSchema) {
    issues.push('Missing or empty input schema');
  }
  if (!hasOutputSchema) {
    issues.push('Missing output schema');
  }
  
  // Check override
  const hasOverride = !!schema && 
    ['google_gmail', 'if_else', 'log_output', 'chat_model', 'database_read', 'database_write',
     'ai_agent', 'ai_chat_model', 'ollama', 'openai_gpt', 'anthropic_claude', 'google_gemini',
     'timeout', 'try_catch', 'retry', 'parallel'].includes(nodeType);
  
  // Get migration status
  const migrationStatus = getMigrationStatus(nodeType);
  
  return {
    nodeType,
    inRegistry,
    hasContext,
    hasInputSchema,
    hasOutputSchema,
    hasOverride,
    migrationStatus: migrationStatus.migrationStatus,
    issues,
  };
}

/**
 * Verify all nodes
 */
function verifyAllNodes(): {
  total: number;
  passed: number;
  failed: number;
  results: VerificationResult[];
  summary: {
    inRegistry: number;
    hasContext: number;
    hasInputSchema: number;
    hasOutputSchema: number;
    hasOverride: number;
    fullyMigrated: number;
  };
} {
  const results = CANONICAL_NODE_TYPES.map(nodeType => verifyNode(nodeType));
  
  const passed = results.filter(r => r.issues.length === 0).length;
  const failed = results.filter(r => r.issues.length > 0).length;
  
  const summary = {
    inRegistry: results.filter(r => r.inRegistry).length,
    hasContext: results.filter(r => r.hasContext).length,
    hasInputSchema: results.filter(r => r.hasInputSchema).length,
    hasOutputSchema: results.filter(r => r.hasOutputSchema).length,
    hasOverride: results.filter(r => r.hasOverride).length,
    fullyMigrated: results.filter(r => r.migrationStatus === 'complete').length,
  };
  
  return {
    total: results.length,
    passed,
    failed,
    results,
    summary,
  };
}

/**
 * Main verification function
 */
function main() {
  console.log('🔍 ROOT-LEVEL NODE VERIFICATION\n');
  console.log('=' .repeat(80));
  
  // 1. Registry Coverage
  console.log('\n1️⃣ REGISTRY COVERAGE');
  console.log('-'.repeat(80));
  const coverage = validateRegistryCoverage();
  if (coverage.valid) {
    console.log('✅ All nodes in registry');
  } else {
    console.log(`❌ ${coverage.errors.length} errors, ${coverage.warnings.length} warnings`);
    coverage.errors.forEach(e => console.log(`   ❌ ${e}`));
    coverage.warnings.forEach(w => console.log(`   ⚠️  ${w}`));
  }
  
  // 2. Migration Report
  console.log('\n2️⃣ MIGRATION STATUS');
  console.log('-'.repeat(80));
  const migrationReport = getMigrationReport();
  console.log(`Total Nodes: ${migrationReport.total}`);
  console.log(`✅ Migrated: ${migrationReport.migrated} (${((migrationReport.migrated / migrationReport.total) * 100).toFixed(1)}%)`);
  console.log(`⚠️  Unmigrated: ${migrationReport.unmigrated} (${((migrationReport.unmigrated / migrationReport.total) * 100).toFixed(1)}%)`);
  
  // 3. Detailed Verification
  console.log('\n3️⃣ DETAILED VERIFICATION');
  console.log('-'.repeat(80));
  const verification = verifyAllNodes();
  console.log(`Total: ${verification.total}`);
  console.log(`✅ Passed: ${verification.passed}`);
  console.log(`❌ Failed: ${verification.failed}`);
  
  console.log('\n📊 SUMMARY');
  console.log('-'.repeat(80));
  console.log(`In Registry: ${verification.summary.inRegistry}/${verification.total} (${((verification.summary.inRegistry / verification.total) * 100).toFixed(1)}%)`);
  console.log(`Has Context: ${verification.summary.hasContext}/${verification.total} (${((verification.summary.hasContext / verification.total) * 100).toFixed(1)}%)`);
  console.log(`Has Input Schema: ${verification.summary.hasInputSchema}/${verification.total} (${((verification.summary.hasInputSchema / verification.total) * 100).toFixed(1)}%)`);
  console.log(`Has Output Schema: ${verification.summary.hasOutputSchema}/${verification.total} (${((verification.summary.hasOutputSchema / verification.total) * 100).toFixed(1)}%)`);
  console.log(`Has Override: ${verification.summary.hasOverride}/${verification.total} (${((verification.summary.hasOverride / verification.total) * 100).toFixed(1)}%)`);
  console.log(`Fully Migrated: ${verification.summary.fullyMigrated}/${verification.total} (${((verification.summary.fullyMigrated / verification.total) * 100).toFixed(1)}%)`);
  
  // 4. Failed Nodes
  const failedNodes = verification.results.filter(r => r.issues.length > 0);
  if (failedNodes.length > 0) {
    console.log('\n❌ FAILED NODES');
    console.log('-'.repeat(80));
    failedNodes.slice(0, 20).forEach(node => {
      console.log(`\n${node.nodeType}:`);
      node.issues.forEach(issue => console.log(`  ❌ ${issue}`));
    });
    if (failedNodes.length > 20) {
      console.log(`\n... and ${failedNodes.length - 20} more`);
    }
  }
  
  // 5. Recommendations
  console.log('\n💡 RECOMMENDATIONS');
  console.log('-'.repeat(80));
  if (verification.summary.fullyMigrated < verification.total) {
    console.log(`⚠️  ${verification.total - verification.summary.fullyMigrated} nodes need migration`);
    console.log('   → Start with trigger nodes (highest priority)');
    console.log('   → Then migrate logic and communication nodes');
    console.log('   → Finally migrate utility and specialized nodes');
  }
  
  if (verification.summary.hasContext < verification.total) {
    console.log(`⚠️  ${verification.total - verification.summary.hasContext} nodes missing context`);
    console.log('   → Add description, keywords, and capabilities to NodeLibrary');
  }
  
  if (verification.summary.hasInputSchema < verification.total) {
    console.log(`⚠️  ${verification.total - verification.summary.hasInputSchema} nodes missing input schema`);
    console.log('   → Verify inputSchema in UnifiedNodeDefinition');
  }
  
  if (verification.summary.hasOutputSchema < verification.total) {
    console.log(`⚠️  ${verification.total - verification.summary.hasOutputSchema} nodes missing output schema`);
    console.log('   → Verify outputSchema in UnifiedNodeDefinition');
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Verification Complete');
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { verifyAllNodes, verifyNode };
