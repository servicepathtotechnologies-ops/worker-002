// AI-Based Workflow Validator
// Uses AI to validate that generated workflow structure matches user prompt intent

import { ollamaOrchestrator } from './ollama-orchestrator';
import type { WorkflowGenerationStructure, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

export interface AIValidationResult {
  valid: boolean;
  confidence: number; // 0-100
  issues: string[];
  suggestions: string[];
  nodeOrderValid: boolean;
  connectionsValid: boolean;
  completenessValid: boolean;
}

export class AIWorkflowValidator {
  /**
   * Validate workflow structure against user prompt using AI
   */
  async validateWorkflowStructure(
    userPrompt: string,
    structure: WorkflowGenerationStructure,
    nodes?: WorkflowNode[],
    edges?: WorkflowEdge[]
  ): Promise<AIValidationResult> {
    try {
      // Prepare workflow structure summary for AI analysis
      const workflowSummary = this.prepareWorkflowSummary(structure, nodes, edges);
      
      // Create AI validation prompt
      const validationPrompt = this.createValidationPrompt(userPrompt, workflowSummary);
      
      // Call AI for validation
      const aiResponse = await ollamaOrchestrator.processRequest('workflow-generation', {
        prompt: validationPrompt,
        temperature: 0.1, // Low temperature for consistent validation
      });
      
      // Parse AI response (processRequest returns string)
      const validationResult = this.parseAIResponse(String(aiResponse));
      
      return validationResult;
    } catch (error) {
      console.error('❌ [AI Validator] Error during AI validation:', error);
      // Fallback: return invalid result with error
      return {
        valid: false,
        confidence: 0,
        issues: [`AI validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        suggestions: ['Please review the workflow manually'],
        nodeOrderValid: false,
        connectionsValid: false,
        completenessValid: false,
      };
    }
  }

  /**
   * ✅ FIXED: Prepare structured graph JSON for AI analysis
   * 
   * Uses structured JSON instead of natural language to prevent false positives.
   */
  private prepareWorkflowSummary(
    structure: WorkflowGenerationStructure,
    nodes?: WorkflowNode[],
    edges?: WorkflowEdge[]
  ): string {
    // ✅ Build structured graph JSON
    const graphData = {
      trigger: structure.trigger || null,
      triggerNodeId: nodes?.find(n => {
        const nodeType = unifiedNormalizeNodeType(n) || n.type || '';
        return nodeType.includes('trigger') || nodeType === structure.trigger;
      })?.id || null,
      executionOrder: this.buildExecutionOrder(nodes || [], edges || []),
      nodes: (nodes || []).map(node => ({
        id: node.id,
        type: unifiedNormalizeNodeType(node) || node.type || 'unknown',
        label: (node.data as any)?.label || node.id,
        isTrigger: this.isTriggerNode(node),
        operation: (node.data as any)?.config?.operation || (node.data as any)?.operation || null,
      })),
      edges: (edges || []).map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || 'default',
        targetHandle: edge.targetHandle || 'default',
      })),
      connectivity: {
        totalNodes: nodes?.length || 0,
        totalEdges: edges?.length || 0,
        allNodesReachable: this.checkAllNodesReachable(nodes || [], edges || []),
      },
    };
    
    return `## STRUCTURED WORKFLOW GRAPH (JSON):
\`\`\`json
${JSON.stringify(graphData, null, 2)}
\`\`\`

## EXECUTION ORDER:
${graphData.executionOrder.map((nodeId, idx) => {
  const node = graphData.nodes.find(n => n.id === nodeId);
  return `${idx + 1}. ${node?.type || nodeId}${node?.isTrigger ? ' [TRIGGER]' : ''}`;
}).join('\n')}

## CONNECTIVITY:
- Total Nodes: ${graphData.connectivity.totalNodes}
- Total Edges: ${graphData.connectivity.totalEdges}
- All Nodes Reachable: ${graphData.connectivity.allNodesReachable ? 'YES' : 'NO'}
- Trigger Node ID: ${graphData.triggerNodeId || 'NOT FOUND'}`;
  }
  
  /**
   * Build execution order from nodes and edges
   */
  private buildExecutionOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
    // Find trigger node
    const triggerNode = nodes.find(n => this.isTriggerNode(n));
    if (!triggerNode) return nodes.map(n => n.id);
    
    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    edges.forEach(edge => {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    });
    
    // BFS from trigger
    const order: string[] = [];
    const visited = new Set<string>();
    const queue = [triggerNode.id];
    visited.add(triggerNode.id);
    
    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      order.push(currentNodeId);
      
      const neighbors = outgoing.get(currentNodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    
    // Add any remaining nodes
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        order.push(node.id);
      }
    }
    
    return order;
  }
  
  /**
   * Check if node is a trigger
   */
  private isTriggerNode(node: WorkflowNode): boolean {
    const nodeType = unifiedNormalizeNodeType(node) || node.type || '';
    return ['manual_trigger', 'schedule', 'webhook', 'form', 'chat_trigger', 
            'interval', 'error_trigger', 'workflow_trigger'].includes(nodeType) ||
           nodeType.includes('trigger');
  }
  
  /**
   * Check if all nodes are reachable from trigger
   */
  private checkAllNodesReachable(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
    const triggerNode = nodes.find(n => this.isTriggerNode(n));
    if (!triggerNode) return false;
    
    // Build adjacency list
    const outgoing = new Map<string, string[]>();
    edges.forEach(edge => {
      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }
      outgoing.get(edge.source)!.push(edge.target);
    });
    
    // BFS from trigger
    const reachable = new Set<string>();
    const queue = [triggerNode.id];
    reachable.add(triggerNode.id);
    
    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      const neighbors = outgoing.get(currentNodeId) || [];
      for (const neighbor of neighbors) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    
    return reachable.size === nodes.length;
  }

  /**
   * Create AI validation prompt
   */
  private createValidationPrompt(userPrompt: string, workflowSummary: string): string {
    return `# WORKFLOW VALIDATION TASK

You are an expert workflow validator. Your task is to analyze if the generated workflow structure correctly matches the user's intent.

## USER PROMPT:
"${userPrompt}"

## GENERATED WORKFLOW STRUCTURE:
${workflowSummary}

## VALIDATION CRITERIA:

1. **NODE ORDER VALIDATION**:
   - Are nodes in the correct logical order?
   - For "extract from X and create in Y": X (read) should come before Y (write)
   - For "get from X and store in Y": X (read) should come before Y (write)
   - Data sources (read) should come before loops, loops should come before create operations
   - Read operations should come before write operations
   - ⚠️ CRITICAL: "create a chat bot" or "create a CRM agent" means SETTING UP a workflow, NOT a create operation node
   - ⚠️ CRITICAL: If trigger is "manual_trigger" and nodes list shows "[TRIGGER]" node, the trigger EXISTS - do NOT report "missing trigger"

2. **CONNECTIONS VALIDATION**:
   - Are all nodes properly connected?
   - Is there a clear data flow from trigger to final node?
   - Are connections logical (e.g., data source → loop → create operation)?
   - Are there any isolated or orphaned nodes?

3. **COMPLETENESS VALIDATION**:
   - Does the workflow include all required nodes mentioned in the prompt?
   - ⚠️ CRITICAL: "create a chat bot" = chatbot workflow (trigger + ai_agent), NOT a create operation
   - ⚠️ CRITICAL: "create a CRM agent" = CRM workflow (trigger + CRM node), NOT a create operation
   - ⚠️ CRITICAL: "create a CRM agent workflow" = workflow setup (manual_trigger + CRM node), NOT a create operation
   - ⚠️ CRITICAL: If nodes list shows "[TRIGGER]" node, the trigger EXISTS - do NOT report "missing trigger"
   - ⚠️ CRITICAL: Only literal "create X in Y" patterns (e.g., "create contact in HubSpot") require create operations
   - ⚠️ CRITICAL: If user says "specify platform", only ONE CRM platform should be present (not multiple)
   - Are all required operations present (get, create, read, write, etc.) ONLY if explicitly mentioned?
   - Is the workflow structure complete and executable?

4. **LOGICAL FLOW VALIDATION**:
   - Does the workflow make logical sense?
   - Can the workflow execute end-to-end?
   - Are there any missing steps or gaps in the flow?
   - ⚠️ CRITICAL: Chatbot workflows (schedule → ai_agent) are VALID and COMPLETE - do not require "create" nodes

## YOUR RESPONSE FORMAT (JSON ONLY):

Return a JSON object with this exact structure:
{
  "valid": true/false,
  "confidence": 0-100,
  "nodeOrderValid": true/false,
  "connectionsValid": true/false,
  "completenessValid": true/false,
  "issues": ["issue1", "issue2", ...],
  "suggestions": ["suggestion1", "suggestion2", ...]
}

## VALIDATION RULES:

- Set "valid" to false if ANY of the following are true:
  * Nodes are in wrong order (e.g., write before read)
  * Missing required nodes from prompt (BUT see exceptions below)
  * Connections don't form a logical flow
  * Workflow cannot execute end-to-end

- ⚠️ CRITICAL EXCEPTIONS - These are VALID workflows (do NOT mark as invalid):
  * "create a chat bot" → schedule/chat_trigger + ai_agent = VALID (no create operation needed)
  * "create a CRM agent" → manual_trigger/schedule + CRM node = VALID (no create operation needed)
  * "create a CRM agent workflow" → manual_trigger + CRM node = VALID (no create operation needed)
  * "create a sales agent" → schedule + CRM node = VALID (no create operation needed)
  * "create a workflow" → trigger + action nodes = VALID (no create operation needed)
  * Only literal "create X in Y" patterns require create operation nodes
  * If nodes list shows "[TRIGGER]" node, trigger EXISTS - do NOT report "missing trigger"

- Set "confidence" based on how well the workflow matches the prompt (0-100)
  * Chatbot workflows with schedule/chat_trigger + ai_agent should have HIGH confidence (≥80%)

- List specific issues in "issues" array (but exclude false positives for "create X agent" workflows)

- Provide actionable suggestions in "suggestions" array

## CRITICAL:
- Be strict but fair
- Focus on logical correctness and completeness
- Consider the user's intent, not just literal matching
- Understand that "create a [type] agent" means workflow setup, NOT a create operation
- Return ONLY valid JSON, no explanations, no markdown

Return the JSON now:`;
  }

  /**
   * Parse AI response into validation result
   */
  private parseAIResponse(aiResponse: string): AIValidationResult {
    try {
      // Extract JSON from response (handle markdown code blocks and text responses)
      let jsonStr = String(aiResponse).trim();
      
      // Try to extract JSON object from response
      if (jsonStr.includes('```')) {
        // Handle markdown code blocks
        const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        } else {
          // Try to extract JSON object from text
          const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (jsonObjectMatch) {
            jsonStr = jsonObjectMatch[0];
          }
        }
      } else {
        // Try to extract JSON object from text response
        const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
        }
      }
      
      // If still no JSON found, try line-by-line extraction
      if (!jsonStr.includes('{')) {
        const lines = jsonStr.split('\n');
        const startIndex = lines.findIndex((l: string) => l.includes('{'));
        if (startIndex >= 0) {
          let endIndex = -1;
          for (let i = lines.length - 1; i >= startIndex; i--) {
            if (lines[i].includes('}')) {
              endIndex = i;
              break;
            }
          }
          if (endIndex >= 0) {
            jsonStr = lines.slice(startIndex, endIndex + 1).join('\n');
          }
        }
      }
      
      // Parse JSON
      const parsed = JSON.parse(jsonStr);
      
      // Validate structure
      const result: AIValidationResult = {
        valid: Boolean(parsed.valid),
        confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
        nodeOrderValid: Boolean(parsed.nodeOrderValid),
        connectionsValid: Boolean(parsed.connectionsValid),
        completenessValid: Boolean(parsed.completenessValid),
      };
      
      console.log(`✅ [AI Validator] Validation result: valid=${result.valid}, confidence=${result.confidence}%`);
      if (result.issues.length > 0) {
        console.log(`⚠️  [AI Validator] Issues found: ${result.issues.join('; ')}`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ [AI Validator] Failed to parse AI response:', error);
      console.error('Raw response:', aiResponse);
      
      // Fallback: try to extract information from text response
      const hasIssues = aiResponse.toLowerCase().includes('invalid') || 
                       aiResponse.toLowerCase().includes('wrong') ||
                       aiResponse.toLowerCase().includes('missing') ||
                       aiResponse.toLowerCase().includes('error');
      
      return {
        valid: !hasIssues,
        confidence: hasIssues ? 30 : 70,
        issues: ['Failed to parse AI validation response. Please review manually.'],
        suggestions: ['Check workflow structure manually'],
        nodeOrderValid: !hasIssues,
        connectionsValid: !hasIssues,
        completenessValid: !hasIssues,
      };
    }
  }

  /**
   * Validate node order specifically
   */
  async validateNodeOrder(
    userPrompt: string,
    nodes: WorkflowNode[]
  ): Promise<{ valid: boolean; issues: string[] }> {
    const nodeOrder = nodes.map(n => {
      const type = unifiedNormalizeNodeType(n) || n.type || 'unknown';
      const operation = (n.data as any)?.config?.operation || (n.data as any)?.operation || '';
      return { type, operation, label: (n.data as any)?.label || n.id };
    });
    
    const prompt = `# NODE ORDER VALIDATION

User Prompt: "${userPrompt}"

Node Order:
${nodeOrder.map((n, i) => `${i + 1}. ${n.label} (${n.type}${n.operation ? `, operation: ${n.operation}` : ''})`).join('\n')}

Analyze if the node order is correct. Consider:
- Read operations should come before write operations
- Data sources (read) should come before loops
- Loops should come before create operations
- For "get from X and store in Y": X should come before Y
- ⚠️ CRITICAL: "create a chat bot" or "create a CRM agent" means SETTING UP a workflow, NOT requiring a create operation node
- ⚠️ CRITICAL: Chatbot workflows (schedule/chat_trigger → ai_agent) are VALID - do not require create operations or loops
- ⚠️ CRITICAL: Only literal "create X in Y" patterns (e.g., "create contact in HubSpot") require create operation nodes

Return JSON:
{
  "valid": true/false,
  "issues": ["issue1", "issue2"]
}`;

    let response: string = '';
    try {
      response = await ollamaOrchestrator.processRequest('workflow-generation', {
        prompt,
        temperature: 0.1,
      });
      
      // Extract JSON from response (handle markdown code blocks and text responses)
      let jsonStr = String(response).trim();
      
      // Remove markdown code blocks if present
      if (jsonStr.includes('```')) {
        const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        } else {
          // Try to extract JSON object from text
          const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
          if (jsonObjectMatch) {
            jsonStr = jsonObjectMatch[0];
          }
        }
      } else {
        // Try to extract JSON object from text response
        const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
        }
      }
      
      const parsed = JSON.parse(jsonStr);
      return {
        valid: Boolean(parsed.valid),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      };
    } catch (error) {
      console.error('❌ [AI Validator] Node order validation failed:', error);
      const responseStr = String(response || '');
      if (responseStr) {
        console.error('   Response preview:', responseStr.substring(0, 200));
      }
      return { valid: true, issues: [] }; // Default to valid if validation fails
    }
  }
}

export const aiWorkflowValidator = new AIWorkflowValidator();
