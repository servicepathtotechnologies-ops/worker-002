/**
 * ✅ SCHEMA COMPLETENESS AUDIT
 * 
 * This script audits all node schemas to ensure they match actual runtime outputs.
 * 
 * Purpose:
 * - Verify output schemas in node-output-types.ts match actual runtime outputs
 * - Identify missing or incorrect schema definitions
 * - Generate report of schema completeness
 */

import { nodeLibrary } from '../src/services/nodes/node-library';
import { NODE_OUTPUT_SCHEMAS, getNodeOutputSchema } from '../src/core/types/node-output-types';
import { unifiedNodeRegistry } from '../src/core/registry/unified-node-registry';

interface SchemaAuditResult {
  nodeType: string;
  hasOutputSchema: boolean;
  hasRuntimeOutput: boolean;
  schemaMatches: boolean;
  schemaType?: string;
  runtimeType?: string;
  issues: string[];
  recommendations: string[];
}

/**
 * Audit all node schemas
 */
export async function auditSchemaCompleteness(): Promise<{
  totalNodes: number;
  auditedNodes: number;
  completeSchemas: number;
  incompleteSchemas: number;
  results: SchemaAuditResult[];
}> {
  const allSchemas = nodeLibrary.getAllSchemas();
  const results: SchemaAuditResult[] = [];
  
  console.log(`[Schema Audit] 🔍 Auditing ${allSchemas.length} node schemas...`);
  
  for (const schema of allSchemas) {
    const nodeType = schema.type;
    const result: SchemaAuditResult = {
      nodeType,
      hasOutputSchema: false,
      hasRuntimeOutput: false,
      schemaMatches: false,
      issues: [],
      recommendations: [],
    };
    
    // Check if output schema exists
    const outputSchema = getNodeOutputSchema(nodeType);
    if (outputSchema) {
      result.hasOutputSchema = true;
      result.schemaType = outputSchema.type;
    } else {
      result.issues.push('No output schema defined in node-output-types.ts');
      result.recommendations.push('Add output schema definition to NODE_OUTPUT_SCHEMAS');
    }
    
    // Check if node has registry definition (runtime output)
    const nodeDef = unifiedNodeRegistry.get(nodeType);
    if (nodeDef && nodeDef.outputSchema) {
      result.hasRuntimeOutput = true;
      // Extract runtime output type from outputSchema
      const outputPorts = Object.keys(nodeDef.outputSchema);
      if (outputPorts.length > 0) {
        const mainPort = nodeDef.outputSchema[outputPorts[0]];
        // outputSchema structure: { [portName]: { type: string, description: string } }
        if (mainPort && typeof mainPort === 'object' && 'type' in mainPort) {
          result.runtimeType = mainPort.type as string;
        } else if (typeof mainPort === 'string') {
          // Fallback: if port is just a string type
          result.runtimeType = mainPort;
        }
      }
    } else {
      result.issues.push('No runtime output schema in UnifiedNodeRegistry');
      result.recommendations.push('Ensure node has outputSchema in registry definition');
    }
    
    // Compare schema types
    if (result.hasOutputSchema && result.hasRuntimeOutput) {
      if (result.schemaType === result.runtimeType) {
        result.schemaMatches = true;
      } else {
        result.issues.push(
          `Schema type mismatch: defined as "${result.schemaType}" but runtime is "${result.runtimeType}"`
        );
        result.recommendations.push(
          `Update output schema in node-output-types.ts to match runtime type "${result.runtimeType}"`
        );
      }
    }
    
    // Check for common issues
    if (schema.nodeCapability) {
      const capabilityOutputType = schema.nodeCapability.outputType;
      if (result.schemaType && capabilityOutputType !== result.schemaType) {
        result.issues.push(
          `NodeCapability outputType (${capabilityOutputType}) doesn't match output schema (${result.schemaType})`
        );
        result.recommendations.push('Align NodeCapability.outputType with output schema');
      }
    }
    
    results.push(result);
  }
  
  const completeSchemas = results.filter(r => r.schemaMatches && r.hasOutputSchema && r.hasRuntimeOutput).length;
  const incompleteSchemas = results.length - completeSchemas;
  
  console.log(`[Schema Audit] ✅ Audit complete:`);
  console.log(`  - Total nodes: ${results.length}`);
  console.log(`  - Complete schemas: ${completeSchemas}`);
  console.log(`  - Incomplete schemas: ${incompleteSchemas}`);
  
  return {
    totalNodes: allSchemas.length,
    auditedNodes: results.length,
    completeSchemas,
    incompleteSchemas,
    results,
  };
}

/**
 * Generate audit report
 */
export function generateAuditReport(auditResults: {
  totalNodes: number;
  auditedNodes: number;
  completeSchemas: number;
  incompleteSchemas: number;
  results: SchemaAuditResult[];
}): string {
  const { results, incompleteSchemas } = auditResults;
  
  let report = `# Schema Completeness Audit Report\n\n`;
  report += `**Date:** ${new Date().toISOString()}\n\n`;
  report += `**Summary:**\n`;
  report += `- Total Nodes: ${auditResults.totalNodes}\n`;
  report += `- Complete Schemas: ${auditResults.completeSchemas}\n`;
  report += `- Incomplete Schemas: ${incompleteSchemas}\n\n`;
  
  if (incompleteSchemas > 0) {
    report += `## ⚠️ Incomplete Schemas\n\n`;
    
    const incomplete = results.filter(r => !r.schemaMatches || !r.hasOutputSchema || !r.hasRuntimeOutput);
    
    incomplete.forEach(result => {
      report += `### ${result.nodeType}\n\n`;
      report += `**Issues:**\n`;
      result.issues.forEach(issue => {
        report += `- ${issue}\n`;
      });
      report += `\n**Recommendations:**\n`;
      result.recommendations.forEach(rec => {
        report += `- ${rec}\n`;
      });
      report += `\n`;
    });
  } else {
    report += `## ✅ All Schemas Complete\n\n`;
    report += `All node schemas match their runtime outputs.\n`;
  }
  
  return report;
}

// Run audit if executed directly
if (require.main === module) {
  auditSchemaCompleteness()
    .then(results => {
      const report = generateAuditReport(results);
      console.log('\n' + report);
      
      // Write report to file
      const fs = require('fs');
      const path = require('path');
      const reportPath = path.join(__dirname, '../SCHEMA_AUDIT_REPORT.md');
      fs.writeFileSync(reportPath, report);
      console.log(`\n✅ Report written to: ${reportPath}`);
    })
    .catch(error => {
      console.error('❌ Audit failed:', error);
      process.exit(1);
    });
}
