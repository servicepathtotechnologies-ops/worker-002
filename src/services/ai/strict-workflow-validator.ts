// STRICT WORKFLOW VALIDATOR
// Enforces mandatory rules: node selection, wiring, execution order
// Based on "AUTONOMOUS WORKFLOW AGENT — STRICT BUILD PROMPT"

import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';

export interface RequiredService {
  service: string;
  nodeType: string;
  purpose: string;
  mandatory: boolean;
}

export interface NodeOrderingRule {
  category: string;
  order: number;
  description: string;
  nodeTypes: string[];
}

export interface StrictValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missingServices: RequiredService[];
  disconnectedNodes: string[];
  wrongOrder: Array<{ node: string; expectedOrder: number; actualOrder: number }>;
  missingConnections: Array<{ source: string; target: string }>;
  aiMisplaced: boolean;
  rebuildRequired: boolean;
}

/**
 * STRICT WORKFLOW VALIDATOR
 * 
 * Enforces:
 * - All required services are present
 * - Correct node execution order
 * - All nodes are connected
 * - AI is only used when needed
 * - No disconnected nodes
 */
export class StrictWorkflowValidator {
  /**
   * Mandatory node ordering rules
   */
  private readonly NODE_ORDERING_RULES: NodeOrderingRule[] = [
    {
      category: 'trigger',
      order: 0,
      description: 'Workflow trigger',
      nodeTypes: ['form', 'webhook', 'schedule', 'manual_trigger', 'email', 'chat_trigger'],
    },
    {
      category: 'data_enrichment',
      order: 1,
      description: 'Data creation/enrichment (AI only if needed)',
      nodeTypes: ['ai_agent', 'openai_gpt', 'anthropic_claude', 'google_gemini', 'javascript', 'set'],
    },
    {
      category: 'data_storage',
      order: 2,
      description: 'Data storage (Sheets/DB)',
      nodeTypes: ['google_sheets', 'database_write', 'supabase', 'database_read'],
    },
    {
      category: 'internal_notification',
      order: 3,
      description: 'Internal notifications (Slack, Teams)',
      nodeTypes: ['slack_message', 'discord_webhook', 'teams_message'],
    },
    {
      category: 'external_communication',
      order: 4,
      description: 'External communication (Email, SMS)',
      nodeTypes: ['email', 'gmail', 'twilio', 'sms'],
    },
  ];

  /**
   * Validate workflow against strict rules
   */
  validateStrict(
    workflow: Workflow,
    userPrompt: string,
    requirements: any
  ): StrictValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingServices: RequiredService[] = [];
    const disconnectedNodes: string[] = [];
    const wrongOrder: Array<{ node: string; expectedOrder: number; actualOrder: number }> = [];
    const missingConnections: Array<{ source: string; target: string }> = [];

    // STEP 1: Check required services checklist
    const requiredServices = this.extractRequiredServices(userPrompt, requirements);
    const presentServices = this.checkServicesPresent(workflow.nodes, requiredServices);
    missingServices.push(...presentServices.missing);

    if (missingServices.length > 0) {
      errors.push(`Missing required services: ${missingServices.map(s => s.service).join(', ')}`);
    }

    // STEP 2: Validate node ordering
    const orderingIssues = this.validateNodeOrdering(workflow);
    wrongOrder.push(...orderingIssues);

    if (orderingIssues.length > 0) {
      errors.push(`Node ordering violations: ${orderingIssues.length} nodes in wrong order`);
    }

    // STEP 3: Validate all nodes are connected
    const connectionIssues = this.validateConnections(workflow);
    disconnectedNodes.push(...connectionIssues.disconnected);
    missingConnections.push(...connectionIssues.missing);

    if (connectionIssues.disconnected.length > 0) {
      errors.push(`Disconnected nodes: ${connectionIssues.disconnected.join(', ')}`);
    }

    if (connectionIssues.missing.length > 0) {
      errors.push(`Missing connections: ${connectionIssues.missing.length} required connections missing`);
    }

    // STEP 4: Validate AI usage
    const aiIssues = this.validateAIUsage(workflow, userPrompt);
    if (aiIssues.misplaced) {
      errors.push('AI node is misplaced or unnecessary');
      warnings.push(aiIssues.reason || 'AI should only be used for personalization, summarization, classification, or transformation');
    }

    // STEP 5: Validate data mapping
    const dataMappingIssues = this.validateDataMapping(workflow, requirements);
    if (dataMappingIssues.length > 0) {
      warnings.push(`Data mapping issues: ${dataMappingIssues.join(', ')}`);
    }

    const rebuildRequired = errors.length > 0;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      missingServices,
      disconnectedNodes,
      wrongOrder,
      missingConnections,
      aiMisplaced: aiIssues.misplaced,
      rebuildRequired,
    };
  }

  /**
   * Extract required services from user prompt
   */
  private extractRequiredServices(userPrompt: string, requirements: any): RequiredService[] {
    const services: RequiredService[] = [];
    const promptLower = userPrompt.toLowerCase();

    // Check for Google Sheets
    if (promptLower.includes('google sheets') || promptLower.includes('sheets') || promptLower.includes('save to') || promptLower.includes('store')) {
      services.push({
        service: 'Google Sheets',
        nodeType: 'google_sheets',
        purpose: 'Data storage',
        mandatory: true,
      });
    }

    // Check for Slack
    if (promptLower.includes('slack') || promptLower.includes('notify') || promptLower.includes('sales team')) {
      services.push({
        service: 'Slack',
        nodeType: 'slack_message',
        purpose: 'Internal notification',
        mandatory: true,
      });
    }

    // Check for Gmail/Email
    if (promptLower.includes('gmail') || promptLower.includes('email') || promptLower.includes('send email') || promptLower.includes('follow-up')) {
      services.push({
        service: 'Gmail',
        nodeType: 'gmail',
        purpose: 'External communication',
        mandatory: true,
      });
    }

    // Check for AI (only if personalization/summarization needed)
    if (
      promptLower.includes('personalized') ||
      promptLower.includes('personalize') ||
      promptLower.includes('ai-generated') ||
      promptLower.includes('generate content')
    ) {
      services.push({
        service: 'AI (Gemini)',
        nodeType: 'google_gemini',
        purpose: 'Content generation/personalization',
        mandatory: false, // Optional
      });
    }

    return services;
  }

  /**
   * Check if required services are present in workflow
   */
  private checkServicesPresent(
    nodes: WorkflowNode[],
    requiredServices: RequiredService[]
  ): { missing: RequiredService[]; present: RequiredService[] } {
    const missing: RequiredService[] = [];
    const present: RequiredService[] = [];

    const nodeTypes = new Set(nodes.map(n => n.type));

    requiredServices.forEach(service => {
      if (service.mandatory && !nodeTypes.has(service.nodeType)) {
        missing.push(service);
      } else if (nodeTypes.has(service.nodeType)) {
        present.push(service);
      }
    });

    return { missing, present };
  }

  /**
   * Validate node execution order
   */
  private validateNodeOrdering(workflow: Workflow): Array<{ node: string; expectedOrder: number; actualOrder: number }> {
    const issues: Array<{ node: string; expectedOrder: number; actualOrder: number }> = [];

    // Calculate execution order from edges
    const executionOrder = this.calculateExecutionOrder(workflow);

    workflow.nodes.forEach((node, index) => {
      const nodeType = node.type;
      const expectedRule = this.NODE_ORDERING_RULES.find(rule =>
        rule.nodeTypes.includes(nodeType)
      );

      if (expectedRule) {
        const actualOrder = executionOrder.indexOf(node.id);
        const expectedOrder = expectedRule.order;

        // Allow some flexibility (within 1 position)
        if (actualOrder !== -1 && Math.abs(actualOrder - expectedOrder) > 1) {
          issues.push({
            node: node.data?.label || node.id,
            expectedOrder,
            actualOrder,
          });
        }
      }
    });

    return issues;
  }

  /**
   * Validate all nodes are connected
   */
  private validateConnections(workflow: Workflow): {
    disconnected: string[];
    missing: Array<{ source: string; target: string }>;
  } {
    const disconnected: string[] = [];
    const missing: Array<{ source: string; target: string }> = [];

    const triggerNodes = workflow.nodes.filter(n =>
      ['form', 'webhook', 'schedule', 'manual_trigger', 'chat_trigger'].includes(n.type)
    );

    if (triggerNodes.length === 0) {
      disconnected.push('No trigger node found');
      return { disconnected, missing };
    }

    // Build connection graph
    const connectedNodes = new Set<string>();
    const edgesBySource = new Map<string, WorkflowEdge[]>();
    const edgesByTarget = new Map<string, WorkflowEdge[]>();

    workflow.edges.forEach(edge => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);

      if (!edgesBySource.has(edge.source)) {
        edgesBySource.set(edge.source, []);
      }
      edgesBySource.get(edge.source)!.push(edge);

      if (!edgesByTarget.has(edge.target)) {
        edgesByTarget.set(edge.target, []);
      }
      edgesByTarget.get(edge.target)!.push(edge);
    });

    // Start from trigger and traverse
    const visited = new Set<string>();
    triggerNodes.forEach(trigger => {
      this.traverseConnections(trigger.id, edgesBySource, visited);
    });

    // Check for disconnected nodes
    workflow.nodes.forEach(node => {
      const isTrigger = ['form', 'webhook', 'schedule', 'manual_trigger', 'chat_trigger'].includes(node.type);
      
      if (!isTrigger && !visited.has(node.id)) {
        disconnected.push(node.data?.label || node.id);
      }

      // Check for nodes without outgoing connections (except final nodes)
      const hasOutgoing = edgesBySource.has(node.id) && edgesBySource.get(node.id)!.length > 0;
      const isFinalNode = this.isFinalNodeType(node.type);
      
      if (!hasOutgoing && !isFinalNode && !isTrigger) {
        // Find what should connect to this node
        const nextNode = this.findNextNode(node, workflow);
        if (nextNode) {
          missing.push({
            source: node.id,
            target: nextNode.id,
          });
        }
      }
    });

    // Check for sequential connections
    const executionOrder = this.calculateExecutionOrder(workflow);
    for (let i = 0; i < executionOrder.length - 1; i++) {
      const currentId = executionOrder[i];
      const nextId = executionOrder[i + 1];

      const hasConnection = workflow.edges.some(
        e => e.source === currentId && e.target === nextId
      );

      if (!hasConnection) {
        missing.push({ source: currentId, target: nextId });
      }
    }

    return { disconnected, missing };
  }

  /**
   * Validate AI usage
   */
  private validateAIUsage(workflow: Workflow, userPrompt: string): {
    misplaced: boolean;
    reason?: string;
  } {
    const aiNodes = workflow.nodes.filter(n =>
      ['ai_agent', 'openai_gpt', 'anthropic_claude', 'google_gemini'].includes(n.type)
    );

    if (aiNodes.length === 0) {
      return { misplaced: false };
    }

    const promptLower = userPrompt.toLowerCase();
    
    // Check if this is a chatbot workflow (AI is always required for chatbots)
    const isChatbotWorkflow = 
      promptLower.includes('chatbot') ||
      promptLower.includes('chat bot') ||
      promptLower.includes('ai chat') ||
      promptLower.includes('conversational ai') ||
      promptLower.includes('assistant') ||
      promptLower.includes('talk to ai') ||
      promptLower.includes('chat with ai') ||
      promptLower.includes('ai conversation') ||
      workflow.nodes.some(n => n.type === 'chat_trigger');
    
    const needsAI =
      isChatbotWorkflow ||
      promptLower.includes('personalized') ||
      promptLower.includes('personalize') ||
      promptLower.includes('ai-generated') ||
      promptLower.includes('generate content') ||
      promptLower.includes('summarize') ||
      promptLower.includes('classify');

    if (!needsAI && aiNodes.length > 0) {
      return {
        misplaced: true,
        reason: 'AI node present but not required by prompt',
      };
    }

    // Check AI node position (should be after trigger, before final communication)
    const executionOrder = this.calculateExecutionOrder(workflow);
    aiNodes.forEach(aiNode => {
      const aiIndex = executionOrder.indexOf(aiNode.id);
      if (aiIndex === -1) return;

      // AI should be early in the flow (after trigger, before storage/communication)
      if (aiIndex > executionOrder.length / 2) {
        return {
          misplaced: true,
          reason: 'AI node is placed too late in execution order',
        };
      }
    });

    return { misplaced: false };
  }

  /**
   * Validate data mapping
   */
  private validateDataMapping(workflow: Workflow, requirements: any): string[] {
    const issues: string[] = [];

    // Check if form fields are mapped to sheets
    const formNodes = workflow.nodes.filter(n => n.type === 'form');
    const sheetsNodes = workflow.nodes.filter(n => n.type === 'google_sheets');

    if (formNodes.length > 0 && sheetsNodes.length > 0) {
      // Check if there's a connection between form and sheets
      const hasConnection = workflow.edges.some(
        e => formNodes.some(f => f.id === e.source) && sheetsNodes.some(s => s.id === e.target)
      );

      if (!hasConnection) {
        issues.push('Form fields not mapped to Google Sheets');
      }
    }

    // Check if data is mapped to Slack message
    const slackNodes = workflow.nodes.filter(n => n.type === 'slack_message');
    if (slackNodes.length > 0 && formNodes.length > 0) {
      const hasConnection = workflow.edges.some(
        e => formNodes.some(f => f.id === e.source) && slackNodes.some(s => s.id === e.target)
      );

      if (!hasConnection) {
        issues.push('Form data not mapped to Slack message');
      }
    }

    return issues;
  }

  /**
   * Calculate execution order from edges
   */
  private calculateExecutionOrder(workflow: Workflow): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const inDegree = new Map<string, number>();

    // Initialize in-degree
    workflow.nodes.forEach(node => {
      inDegree.set(node.id, 0);
    });

    // Calculate in-degree
    workflow.edges.forEach(edge => {
      const current = inDegree.get(edge.target) || 0;
      inDegree.set(edge.target, current + 1);
    });

    // Find trigger nodes (in-degree 0)
    const queue: string[] = [];
    workflow.nodes.forEach(node => {
      if (inDegree.get(node.id) === 0) {
        queue.push(node.id);
      }
    });

    // Topological sort
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      order.push(nodeId);
      visited.add(nodeId);

      workflow.edges
        .filter(e => e.source === nodeId)
        .forEach(edge => {
          const targetDegree = (inDegree.get(edge.target) || 0) - 1;
          inDegree.set(edge.target, targetDegree);
          if (targetDegree === 0 && !visited.has(edge.target)) {
            queue.push(edge.target);
          }
        });
    }

    return order;
  }

  /**
   * Traverse connections from a node
   */
  private traverseConnections(
    nodeId: string,
    edgesBySource: Map<string, WorkflowEdge[]>,
    visited: Set<string>
  ): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const outgoing = edgesBySource.get(nodeId) || [];
    outgoing.forEach(edge => {
      this.traverseConnections(edge.target, edgesBySource, visited);
    });
  }

  /**
   * Check if node type is a final node (doesn't need outgoing connections)
   */
  private isFinalNodeType(nodeType: string): boolean {
    return ['email', 'gmail', 'slack_message', 'discord_webhook', 'database_write'].includes(nodeType);
  }

  /**
   * Find next node that should connect to current node
   */
  private findNextNode(node: WorkflowNode, workflow: Workflow): WorkflowNode | null {
    const nodeType = node.type;
    const executionOrder = this.calculateExecutionOrder(workflow);
    const currentIndex = executionOrder.indexOf(node.id);

    if (currentIndex === -1 || currentIndex >= executionOrder.length - 1) {
      return null;
    }

    const nextId = executionOrder[currentIndex + 1];
    return workflow.nodes.find(n => n.id === nextId) || null;
  }
}

// Export singleton instance
export const strictWorkflowValidator = new StrictWorkflowValidator();
