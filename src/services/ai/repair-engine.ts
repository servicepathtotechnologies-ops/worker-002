/**
 * Pattern-Based Repair Engine
 * 
 * Rule-based repair engine that injects missing nodes based on prompt patterns.
 * This is STEP 3.5 of the pipeline: Pattern-Based Repair (after structure building, before validation)
 * 
 * Rules:
 * - Must be rule-based (NOT AI-based)
 * - Detect missing nodes from prompt patterns
 * - Inject nodes and reconnect graph logically
 * - Enforce graph rules (no self-loops, proper connections)
 * 
 * CRITICAL: Do NOT create semantic edges
 * - Only repair structural issues (missing trigger, missing connection in chain)
 * - Do NOT connect output nodes back to data sources
 * - Do NOT infer persistence or feedback loops
 * - Only connect nodes if explicitly defined in intent plan
 * - Orphan nodes remain disconnected unless in intent
 */

import { WorkflowStructure } from './workflow-structure-builder';
import { StructuredIntent } from './intent-structurer';
import { nodeLibrary } from '../nodes/node-library';
import { getDefaultTargetHandle } from '../../core/utils/node-handle-registry';

export interface RepairResult {
  workflow: WorkflowStructure;
  repairs: Array<{
    type: string;
    description: string;
    injectedNodes: string[];
  }>;
}

export class RepairEngine {
  /**
   * Repair workflow structure based on prompt patterns
   */
  repairWorkflow(
    structure: WorkflowStructure,
    intent: StructuredIntent,
    userPrompt: string
  ): RepairResult {
    console.log(`[RepairEngine] Starting pattern-based repair for workflow`);
    
    const repairs: RepairResult['repairs'] = [];
    let repairedStructure = { ...structure };

    // Repair 1: Inject if_else node if conditions exist but not in graph
    if (intent.conditions && intent.conditions.length > 0) {
      const hasIfElse = repairedStructure.nodes.some(n => n.type === 'if_else');
      if (!hasIfElse) {
        repairedStructure = this.injectIfElseNode(repairedStructure, intent.conditions[0]);
        repairs.push({
          type: 'if_else_injection',
          description: 'Injected if_else node based on conditions in prompt',
          injectedNodes: ['if_else_0'],
        });
      }
    }

    // Repair 2: Inject data extractor if prompt mentions form/extract but no extractor node
    const promptLower = userPrompt.toLowerCase();
    const mentionsForm = promptLower.includes('form') || 
                        promptLower.includes('extract') || 
                        promptLower.includes('field');
    const hasExtractor = repairedStructure.nodes.some(n => 
      n.type === 'data_extractor' || 
      n.type === 'form_extractor' ||
      n.type === 'extract_fields'
    );
    
    if (mentionsForm && !hasExtractor && repairedStructure.nodes.length > 0) {
      // Inject extractor before first action that might need extracted data
      const firstActionIndex = repairedStructure.nodes.findIndex(n => 
        !['if_else', 'loop'].includes(n.type)
      );
      if (firstActionIndex >= 0) {
        repairedStructure = this.injectExtractorNode(repairedStructure, firstActionIndex);
        repairs.push({
          type: 'extractor_injection',
          description: 'Injected data extractor node based on form/extract keywords in prompt',
          injectedNodes: ['extractor_0'],
        });
      }
    }

    // Repair 3: Fix schedule trigger if prompt mentions schedule but trigger is not schedule
    const mentionsSchedule = promptLower.includes('schedule') || 
                             promptLower.includes('every') || 
                             promptLower.includes('daily') ||
                             promptLower.includes('hourly') ||
                             promptLower.includes('fixed schedule');
    if (mentionsSchedule && repairedStructure.trigger !== 'schedule') {
      repairedStructure.trigger = 'schedule';
      if (!repairedStructure.trigger_config) {
        repairedStructure.trigger_config = {};
      }
      // Extract schedule interval from prompt
      if (promptLower.includes('hourly')) {
        repairedStructure.trigger_config.interval = 'hourly';
      } else if (promptLower.includes('daily')) {
        repairedStructure.trigger_config.interval = 'daily';
      } else {
        repairedStructure.trigger_config.interval = 'daily'; // Default
      }
      repairs.push({
        type: 'trigger_fix',
        description: 'Fixed trigger type to schedule based on prompt keywords',
        injectedNodes: [],
      });
    }

    // Repair 4: Ensure only one CRM write node unless explicitly requested
    const crmWriteNodes = repairedStructure.nodes.filter(n => {
      const nodeType = n.type;
      return ['hubspot', 'zoho_crm', 'salesforce', 'pipedrive'].includes(nodeType) &&
             (n.config?.operation === 'create' || n.config?.operation === 'update' || !n.config?.operation);
    });

    const mentionsSync = promptLower.includes('sync') || 
                        promptLower.includes('both') ||
                        promptLower.includes('multiple');
    
    if (crmWriteNodes.length > 1 && !mentionsSync) {
      // Keep only the first CRM write node, remove duplicates
      const firstCrmNode = crmWriteNodes[0];
      const duplicateIds = crmWriteNodes.slice(1).map(n => n.id);
      
      repairedStructure.nodes = repairedStructure.nodes.filter(n => 
        !duplicateIds.includes(n.id)
      );
      
      // Remove connections to removed nodes
      repairedStructure.connections = repairedStructure.connections.filter(c =>
        !duplicateIds.includes(c.source) && !duplicateIds.includes(c.target)
      );
      
      repairs.push({
        type: 'crm_deduplication',
        description: `Removed ${duplicateIds.length} duplicate CRM write node(s) (keeping first)`,
        injectedNodes: [],
      });
    }

    // Repair 5: Ensure trigger has outgoing edge
    const triggerHasOutgoing = repairedStructure.connections.some(c => c.source === 'trigger');
    if (!triggerHasOutgoing && repairedStructure.nodes.length > 0) {
      const firstNode = repairedStructure.nodes[0];
      repairedStructure.connections.push({
        source: 'trigger',
        target: firstNode.id,
        sourceOutput: 'output',
        targetInput: this.getDefaultInputField(firstNode.type),
      });
      repairs.push({
        type: 'trigger_connection',
        description: 'Added connection from trigger to first node',
        injectedNodes: [],
      });
    }

    // Repair 6: DISABLED - Do NOT connect orphan nodes
    // This was creating semantic edges that should only be created from explicit intent
    // Orphan nodes should remain disconnected unless explicitly defined in intent plan
    // 
    // Only repair structural issues:
    // - Missing trigger connection (already handled in Repair 5)
    // - Missing connection in chain (only if explicitly defined in intent)
    // 
    // Do NOT:
    // - Connect output nodes back to data sources
    // - Infer persistence or feedback loops
    // - Create connections for orphan nodes
    const nodeIds = new Set(repairedStructure.nodes.map(n => n.id));
    const nodesWithIncoming = new Set(
      repairedStructure.connections
        .filter(c => c.source !== 'trigger')
        .map(c => c.target)
    );
    
    const orphanNodes = repairedStructure.nodes.filter(n => 
      n.id !== 'trigger' && !nodesWithIncoming.has(n.id)
    );
    
    if (orphanNodes.length > 0) {
      // Log warning but do NOT create connections
      console.warn(`[RepairEngine] ⚠️  Found ${orphanNodes.length} orphan node(s) but NOT connecting them (semantic edges disabled):`, 
        orphanNodes.map(n => `${n.id} (${n.type})`).join(', '));
      console.warn(`[RepairEngine]   Orphan nodes should only be connected if explicitly defined in intent plan`);
      
      // Do NOT create connections - orphan nodes remain disconnected
      // This prevents creating semantic edges like:
      // - Output nodes → data sources (feedback loops)
      // - Persistence patterns
      // - Implicit connections not in intent
    }

    // Final: Remove any self-loops (safety check)
    const initialEdgeCount = repairedStructure.connections.length;
    repairedStructure.connections = repairedStructure.connections.filter(c => {
      if (c.source === c.target) {
        console.warn(`[RepairEngine] ⚠️ Removed self-loop: ${c.source} → ${c.target}`);
        return false;
      }
      return true;
    });
    
    if (repairedStructure.connections.length < initialEdgeCount) {
      repairs.push({
        type: 'self_loop_removal',
        description: 'Removed self-loops from connections',
        injectedNodes: [],
      });
    }

    if (repairs.length > 0) {
      console.log(`[RepairEngine] ✅ Applied ${repairs.length} repair(s):`, repairs.map(r => r.type));
    } else {
      console.log(`[RepairEngine] ✅ No repairs needed`);
    }

    return {
      workflow: repairedStructure,
      repairs,
    };
  }

  /**
   * Inject if_else node into workflow structure
   */
  private injectIfElseNode(
    structure: WorkflowStructure,
    condition: NonNullable<StructuredIntent['conditions']>[number]
  ): WorkflowStructure {
    const ifElseNode = {
      id: 'if_else_0',
      type: 'if_else',
      config: {
        condition: condition.condition,
      },
    };

    // Insert if_else after trigger, before first action
    const newNodes = [...structure.nodes];
    newNodes.unshift(ifElseNode);

    // Reconnect: trigger → if_else → first action
    const newConnections: WorkflowStructure['connections'] = [];
    
    // Connect trigger to if_else
    if (newNodes.length > 1) {
      newConnections.push({
        source: 'trigger',
        target: 'if_else_0',
        sourceOutput: 'output',
        targetInput: 'input',
      });
    }

    // Connect if_else true path to first action (if exists)
    // This is a structural repair based on explicit condition in intent, not a semantic edge
    if (structure.nodes.length > 0) {
      const firstAction = structure.nodes[0];
      // Only connect if first action is explicitly in the original structure
      // This prevents connecting to orphaned nodes or creating feedback loops
      const firstActionInOriginal = structure.nodes.some(n => n.id === firstAction.id);
      if (firstActionInOriginal) {
        newConnections.push({
          source: 'if_else_0',
          target: firstAction.id,
          sourceOutput: 'true',
          targetInput: this.getDefaultInputField(firstAction.type),
        });
      }
    }

    // Keep existing connections (they'll be reconnected later if needed)
    newConnections.push(...structure.connections);

    return {
      ...structure,
      nodes: newNodes,
      connections: newConnections,
    };
  }

  /**
   * Inject data extractor node before specified index
   */
  private injectExtractorNode(
    structure: WorkflowStructure,
    beforeIndex: number
  ): WorkflowStructure {
    const extractorNode = {
      id: 'extractor_0',
      type: 'data_extractor',
      config: {},
    };

    const newNodes = [...structure.nodes];
    newNodes.splice(beforeIndex, 0, extractorNode);

    // Reconnect: previous node → extractor → target node
    const newConnections: WorkflowStructure['connections'] = [];
    
    // If there's a trigger connection to the target node, redirect it to extractor
    const targetNodeId = structure.nodes[beforeIndex]?.id;
    const triggerConn = structure.connections.find(c => 
      c.source === 'trigger' && c.target === targetNodeId
    );
    
    if (triggerConn) {
      // Remove old trigger connection
      const otherConnections = structure.connections.filter(c => 
        !(c.source === 'trigger' && c.target === targetNodeId)
      );
      
      // Add trigger → extractor
      newConnections.push({
        source: 'trigger',
        target: 'extractor_0',
        sourceOutput: 'output',
        targetInput: 'input',
      });
      
      // Add extractor → target
      newConnections.push({
        source: 'extractor_0',
        target: targetNodeId,
        sourceOutput: 'output',
        targetInput: this.getDefaultInputField(structure.nodes[beforeIndex].type),
      });
      
      // Add other connections
      newConnections.push(...otherConnections);
    } else {
      // No trigger connection, just insert extractor in chain
      newConnections.push(...structure.connections);
      
      // Find connection that targets the original node and redirect to extractor
      // This is a structural repair: inserting extractor in existing chain, not creating semantic edge
      const incomingConn = structure.connections.find(c => c.target === targetNodeId);
      if (incomingConn) {
        // Only redirect if source is not an output node connecting back to data source
        // This prevents feedback loops: output nodes → data sources
        const sourceNode = structure.nodes.find(n => n.id === incomingConn.source);
        const isOutputNode = sourceNode && this.isOutputNodeType(sourceNode.type);
        const isDataSource = this.isDataSourceNodeType(structure.nodes[beforeIndex].type);
        
        if (!(isOutputNode && isDataSource)) {
          // Safe to redirect: not a feedback loop
          newConnections.push({
            ...incomingConn,
            target: 'extractor_0',
          });
          
          // Add extractor → target
          newConnections.push({
            source: 'extractor_0',
            target: targetNodeId,
            sourceOutput: 'output',
            targetInput: this.getDefaultInputField(structure.nodes[beforeIndex].type),
          });
        } else {
          console.warn(`[RepairEngine] ⚠️  Prevented feedback loop: ${sourceNode?.type} → ${structure.nodes[beforeIndex].type} (semantic edge prevention)`);
        }
      }
    }

    return {
      ...structure,
      nodes: newNodes,
      connections: newConnections,
    };
  }

  /**
   * Check if node type is an output node (should not connect back to data sources)
   */
  private isOutputNodeType(nodeType: string): boolean {
    const outputNodeTypes = [
      'slack_message', 'discord', 'telegram', 'email', 'google_gmail',
      'log_output', 'microsoft_teams', 'whatsapp_cloud', 'twilio',
      'twitter', 'linkedin', 'instagram', 'facebook'
    ];
    return outputNodeTypes.includes(nodeType);
  }

  /**
   * Check if node type is a data source node (should not receive connections from output nodes)
   */
  private isDataSourceNodeType(nodeType: string): boolean {
    const dataSourceNodeTypes = [
      'google_sheets', 'database_read', 'supabase', 'postgresql', 'mysql', 'mongodb',
      'http_request', 'webhook', 'form', 'airtable', 'notion'
    ];
    return dataSourceNodeTypes.includes(nodeType);
  }

  /**
   * Get default input handle ID for node type
   * 
   * ✅ CRITICAL: Returns React Flow handle ID, not config field name.
   * All standard nodes use 'input' as the target handle ID.
   * Special nodes (ai_agent) use their specific handle IDs.
   */
  private getDefaultInputField(nodeType: string): string {
    // Use handle registry for consistency with frontend
    return getDefaultTargetHandle(nodeType);
  }
}

export const repairEngine = new RepairEngine();
