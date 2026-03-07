// Workflow Graph Repair Utility
// Automatically detects and repairs missing structural nodes in workflows

import type { WorkflowGenerationStructure, WorkflowNode, WorkflowEdge, Requirements } from '../../core/types/ai-types';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export interface RepairResult {
  repaired: boolean;
  injectedNodes: Array<{ type: string; reason: string; position: number }>;
  modifiedStructure: WorkflowGenerationStructure;
  issues: string[];
}

export interface GraphIntegrityCheck {
  missingNodes: Array<{ type: string; reason: string; requiredPosition: number }>;
  missingConnections: Array<{ source: string; target: string; reason: string }>;
  orderIssues: Array<{ issue: string; suggestion: string }>;
}

export class WorkflowGraphRepair {
  /**
   * Check graph integrity and detect missing structural nodes
   */
  checkGraphIntegrity(
    structure: WorkflowGenerationStructure,
    nodes: WorkflowNode[],
    requirements: Requirements,
    userPrompt: string
  ): GraphIntegrityCheck {
    const missingNodes: Array<{ type: string; reason: string; requiredPosition: number }> = [];
    const missingConnections: Array<{ source: string; target: string; reason: string }> = [];
    const orderIssues: Array<{ issue: string; suggestion: string }> = [];

    const promptLower = userPrompt.toLowerCase();
    const stepTypes = structure.steps.map(s => {
      const stepAny = s as any;
      return unifiedNormalizeNodeTypeString(stepAny.type || stepAny.nodeType || '') || stepAny.type || '';
    });
    const nodeTypes = nodes.map(n => unifiedNormalizeNodeType(n) || n.type || '');

    // Check 1: Form trigger requires form data extraction
    if (structure.trigger === 'form') {
      const hasFormExtraction = stepTypes.some(t => 
        ['set_variable', 'json_parser', 'edit_fields', 'set'].includes(t)
      ) || nodeTypes.some(t => 
        ['set_variable', 'json_parser', 'edit_fields', 'set'].includes(t)
      );
      
      if (!hasFormExtraction && (promptLower.includes('form') || promptLower.includes('fill'))) {
        missingNodes.push({
          type: 'set_variable',
          reason: 'Form trigger requires form data extraction to access form fields',
          requiredPosition: 0 // After trigger, before other nodes
        });
      }
    }

    // Check 2: Conditional logic requires if_else node
    // Use strict patterns to avoid false positives (e.g., "agent" contains "age", "manage" contains "age")
    const strictConditionalPatterns = [
      /\bif\s+(.+?)\s+then\b/i,           // "if X then Y"
      /\bif\s+(.+?)\s+else\b/i,           // "if X else Y"
      /\bcheck\s+if\b/i,                   // "check if"
      /\bgreater\s+than\b/i,               // "greater than"
      /\bless\s+than\b/i,                  // "less than"
      /\bgreater\s+or\s+equal\b/i,         // "greater or equal"
      /\bless\s+or\s+equal\b/i,            // "less or equal"
      /\bage\s+(is|>|>=|<|<=|greater|less)/i, // "age is X" or "age > X"
      /\b(\d+)\s*(>|>=|<|<=|==)\s*\d+/i,   // "7 > 5" or "age >= 7"
      /\bwhen\s+(.+?)\s+then\b/i,          // "when X then Y"
      /\bonly\s+if\b/i,                    // "only if"
      /\bunless\b/i,                       // "unless"
    ];
    
    // Also check for standalone conditional keywords that are less likely to be false positives
    const conditionalKeywords = ['if then', 'if else', 'check if', 'validate if', 'verify if'];
    const hasStrictPattern = strictConditionalPatterns.some(pattern => pattern.test(userPrompt));
    const hasConditionalKeyword = conditionalKeywords.some(keyword => promptLower.includes(keyword));
    const hasConditional = hasStrictPattern || hasConditionalKeyword;
    const hasIfElse = stepTypes.includes('if_else') || nodeTypes.includes('if_else');
    
    if (hasConditional && !hasIfElse) {
      // Determine position: after form extraction if form exists, otherwise after trigger
      const position = structure.trigger === 'form' ? 1 : 0;
      const matchedPattern = strictConditionalPatterns.find(p => p.test(userPrompt))?.toString() || 
                            conditionalKeywords.find(k => promptLower.includes(k)) || 
                            'conditional logic';
      missingNodes.push({
        type: 'if_else',
        reason: `Conditional logic detected in prompt (${matchedPattern}) requires if_else node`,
        requiredPosition: position
      });
    }

    // Check 3: Loop pattern requires loop node
    const loopKeywords = ['for each', 'loop', 'iterate', 'process each', 'each row', 'each item'];
    const hasLoopKeyword = loopKeywords.some(keyword => promptLower.includes(keyword));
    const hasLoop = stepTypes.includes('loop') || nodeTypes.includes('loop');
    const hasDataSource = stepTypes.some(t => ['google_sheets', 'database_read', 'airtable'].includes(t)) ||
                         nodeTypes.some(t => ['google_sheets', 'database_read', 'airtable'].includes(t));
    const hasCreateOp = stepTypes.some(t => ['hubspot', 'zoho', 'pipedrive', 'airtable'].includes(t)) ||
                       nodeTypes.some(t => ['hubspot', 'zoho', 'pipedrive', 'airtable'].includes(t));
    
    if (hasLoopKeyword && !hasLoop && hasDataSource && hasCreateOp) {
      // Loop should be between data source and create operation
      const dataSourceIndex = stepTypes.findIndex(t => ['google_sheets', 'database_read', 'airtable'].includes(t));
      const createOpIndex = stepTypes.findIndex(t => ['hubspot', 'zoho', 'pipedrive', 'airtable'].includes(t));
      const position = dataSourceIndex >= 0 && createOpIndex > dataSourceIndex ? dataSourceIndex + 1 : stepTypes.length;
      
      missingNodes.push({
        type: 'loop',
        reason: 'Loop pattern detected (data source → create operation) requires loop node',
        requiredPosition: position
      });
    }

    // Check 4: Read before write order validation
    const readOps = stepTypes.filter((t, idx) => {
      const step = structure.steps[idx] as any;
      const operation = step?.operation || (nodes.find(n => {
        const nType = unifiedNormalizeNodeType(n) || n.type || '';
        return nType === t;
      })?.data as any)?.config?.operation || '';
      return ['get', 'getMany', 'read', 'search'].includes(String(operation).toLowerCase());
    });
    const writeOps = stepTypes.filter((t, idx) => {
      const step = structure.steps[idx] as any;
      const operation = step?.operation || (nodes.find(n => {
        const nType = unifiedNormalizeNodeType(n) || n.type || '';
        return nType === t;
      })?.data as any)?.config?.operation || '';
      return ['create', 'update', 'write', 'delete'].includes(String(operation).toLowerCase());
    });

    if (writeOps.length > 0 && readOps.length > 0) {
      const firstWriteIndex = stepTypes.findIndex(t => writeOps.includes(t));
      const lastReadIndex = stepTypes.map((t, idx) => readOps.includes(t) ? idx : -1)
                                    .filter(idx => idx >= 0)
                                    .sort((a, b) => b - a)[0];
      
      if (firstWriteIndex >= 0 && lastReadIndex >= 0 && firstWriteIndex < lastReadIndex) {
        orderIssues.push({
          issue: `Write operation at position ${firstWriteIndex} comes before read operation at position ${lastReadIndex}`,
          suggestion: 'Read operations should come before write operations'
        });
      }
    }

    // Check 5: Data source → loop → create pattern validation
    if (hasDataSource && hasCreateOp && !hasLoop) {
      const dataSourceIndex = stepTypes.findIndex(t => ['google_sheets', 'database_read', 'airtable'].includes(t));
      const createOpIndex = stepTypes.findIndex(t => ['hubspot', 'zoho', 'pipedrive', 'airtable'].includes(t));
      
      if (dataSourceIndex >= 0 && createOpIndex > dataSourceIndex) {
        missingNodes.push({
          type: 'loop',
          reason: 'Data source → create operation pattern requires loop node between them',
          requiredPosition: dataSourceIndex + 1
        });
      }
    }

    return { missingNodes, missingConnections, orderIssues };
  }

  /**
   * Repair workflow graph by injecting missing structural nodes
   */
  repairWorkflowGraph(
    structure: WorkflowGenerationStructure,
    nodes: WorkflowNode[],
    requirements: Requirements,
    userPrompt: string
  ): RepairResult {
    const issues: string[] = [];
    const injectedNodes: Array<{ type: string; reason: string; position: number }> = [];

    // Check integrity
    const integrityCheck = this.checkGraphIntegrity(structure, nodes, requirements, userPrompt);

    if (integrityCheck.missingNodes.length === 0 && integrityCheck.orderIssues.length === 0) {
      return {
        repaired: false,
        injectedNodes: [],
        modifiedStructure: structure,
        issues: []
      };
    }

    // Create modified structure
    const modifiedSteps = [...structure.steps];
    const modifiedConnections = [...(structure.connections || [])];

    // Sort missing nodes by required position
    const sortedMissingNodes = [...integrityCheck.missingNodes].sort((a, b) => a.requiredPosition - b.requiredPosition);

    // Inject missing nodes
    for (const missingNode of sortedMissingNodes) {
      const nodeType = missingNode.type;
      
      // ✅ CRITICAL: Skip trigger injection if trigger already exists
      const isTriggerType = ['manual_trigger', 'webhook', 'schedule', 'interval', 'chat_trigger', 'form', 'error_trigger'].includes(nodeType);
      if (isTriggerType && structure.trigger) {
        console.log(`⚠️  [GraphRepair] Skipping trigger injection - trigger already exists: ${structure.trigger}`);
        continue;
      }
      
      const position = Math.min(missingNode.requiredPosition, modifiedSteps.length);

      // Create step definition for missing node
      const stepId = `step${modifiedSteps.length + 1}`;
      const stepDefinition: any = {
        id: stepId,
        type: nodeType,
        description: this.getNodeDescription(nodeType, userPrompt),
      };

      // Add specific configuration based on node type
      if (nodeType === 'if_else') {
        stepDefinition.conditions = this.inferConditions(userPrompt);
      } else if (nodeType === 'set_variable' && structure.trigger === 'form') {
        stepDefinition.fields = this.inferFormFields(userPrompt);
      } else if (nodeType === 'loop') {
        stepDefinition.items = '{{$json.rows}}'; // Default to rows from data source
      }

      // Insert at position
      modifiedSteps.splice(position, 0, stepDefinition);
      injectedNodes.push({
        type: nodeType,
        reason: missingNode.reason,
        position: position
      });

      issues.push(`Injected ${nodeType} node: ${missingNode.reason}`);
    }

    // Rebuild connections after node injection
    const rebuiltConnections = this.rebuildConnections(
      structure.trigger || 'manual_trigger',
      modifiedSteps,
      structure.connections || []
    );

    const modifiedStructure: WorkflowGenerationStructure = {
      trigger: structure.trigger,
      steps: modifiedSteps,
      outputs: structure.outputs || [],
      connections: rebuiltConnections,
    };

    // Add metadata
    (modifiedStructure as any)._repaired = true;
    (modifiedStructure as any)._injectedNodes = injectedNodes;

    return {
      repaired: injectedNodes.length > 0,
      injectedNodes,
      modifiedStructure,
      issues: [...issues, ...integrityCheck.orderIssues.map(o => o.issue)]
    };
  }

  /**
   * Get node description based on node type and prompt
   */
  private getNodeDescription(nodeType: string, userPrompt: string): string {
    const promptLower = userPrompt.toLowerCase();
    
    if (nodeType === 'if_else') {
      if (promptLower.includes('age')) {
        return 'Check if age is greater than threshold';
      }
      return 'Conditional check';
    } else if (nodeType === 'set_variable') {
      if (promptLower.includes('form')) {
        return 'Extract form data';
      }
      return 'Extract data fields';
    } else if (nodeType === 'loop') {
      return 'Loop through items';
    }
    
    return `${nodeType} operation`;
  }

  /**
   * Infer conditions from user prompt
   */
  private inferConditions(userPrompt: string): any[] {
    const promptLower = userPrompt.toLowerCase();
    const conditions: any[] = [];

    // Age check - only if explicitly mentioned with comparison
    const agePattern = /\bage\s+(is|>|>=|<|<=|greater|less|more|than)\s*(\d+)/i;
    const ageMatch = userPrompt.match(agePattern);
    if (ageMatch) {
      const threshold = parseInt(ageMatch[2]) || 7;
      const operator = promptLower.includes('greater') || promptLower.includes('>') || promptLower.includes('more') 
        ? 'greater_than' 
        : promptLower.includes('less') || promptLower.includes('<') 
        ? 'less_than' 
        : 'equals';
      
      conditions.push({
        field: 'age',
        operator: operator,
        value: threshold
      });
      return conditions;
    }

    // Check for explicit conditional patterns
    const ifThenPattern = /\bif\s+(.+?)\s+then/i;
    const ifThenMatch = userPrompt.match(ifThenPattern);
    if (ifThenMatch) {
      // Extract the condition from "if X then"
      const conditionText = ifThenMatch[1].trim();
      // Try to parse common patterns
      const greaterThanMatch = conditionText.match(/(\w+)\s*(>|>=|greater\s+than)\s*(\d+)/i);
      const lessThanMatch = conditionText.match(/(\w+)\s*(<|<=|less\s+than)\s*(\d+)/i);
      const equalsMatch = conditionText.match(/(\w+)\s*(==|=|equals|is)\s*(.+)/i);
      
      if (greaterThanMatch) {
        conditions.push({
          field: greaterThanMatch[1],
          operator: 'greater_than',
          value: parseInt(greaterThanMatch[3]) || greaterThanMatch[3]
        });
      } else if (lessThanMatch) {
        conditions.push({
          field: lessThanMatch[1],
          operator: 'less_than',
          value: parseInt(lessThanMatch[3]) || lessThanMatch[3]
        });
      } else if (equalsMatch) {
        conditions.push({
          field: equalsMatch[1],
          operator: 'equals',
          value: equalsMatch[3].trim()
        });
      } else {
        // Generic condition
        conditions.push({
          field: 'value',
          operator: 'equals',
          value: true
        });
      }
      return conditions;
    }

    // Generic condition as fallback (only if we're sure there's a conditional)
    if (conditions.length === 0) {
      conditions.push({
        field: 'condition',
        operator: 'equals',
        value: true
      });
    }

    return conditions;
  }

  /**
   * Infer form fields from user prompt
   */
  private inferFormFields(userPrompt: string): any {
    const promptLower = userPrompt.toLowerCase();
    const fields: Record<string, string> = {};

    // Extract field names mentioned in prompt
    if (promptLower.includes('name')) {
      fields.name = '{{$json.name}}';
    }
    if (promptLower.includes('age')) {
      fields.age = '{{$json.age}}';
    }
    if (promptLower.includes('email')) {
      fields.email = '{{$json.email}}';
    }

    return fields;
  }

  /**
   * Rebuild connections after node injection
   */
  private rebuildConnections(
    trigger: string,
    steps: any[],
    originalConnections: Array<{ source: string; target: string; outputField?: string; inputField?: string }>
  ): Array<{ source: string; target: string; outputField?: string; inputField?: string }> {
    const connections: Array<{ source: string; target: string; outputField?: string; inputField?: string }> = [];

    // If no steps, return empty
    if (steps.length === 0) {
      return connections;
    }

    // Build linear chain: trigger → step1 → step2 → step3
    // Connect trigger to first step
    if (steps.length > 0) {
      connections.push({
        source: 'trigger',
        target: steps[0].id,
        outputField: 'inputData',
        inputField: 'input'
      });
    }

    // Connect steps sequentially
    for (let i = 0; i < steps.length - 1; i++) {
      connections.push({
        source: steps[i].id,
        target: steps[i + 1].id,
        outputField: 'output',
        inputField: 'input'
      });
    }

    return connections;
  }
}

export const workflowGraphRepair = new WorkflowGraphRepair();
