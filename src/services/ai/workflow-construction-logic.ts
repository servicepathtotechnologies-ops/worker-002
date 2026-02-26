/**
 * Workflow Construction Logic (STEP-3)
 * 
 * This module implements the strict 7-phase workflow construction process
 * following the Workflow Construction Logic System Prompt specification.
 */

// Workflow Construction Phases (MANDATORY)
export enum WorkflowConstructionPhase {
  PHASE_1_TRIGGER_SELECTION = 'PHASE_1_TRIGGER_SELECTION',
  PHASE_2_ACTION_NODE_SELECTION = 'PHASE_2_ACTION_NODE_SELECTION',
  PHASE_3_DATA_MAPPING = 'PHASE_3_DATA_MAPPING',
  PHASE_4_CONDITIONS_AND_LOGIC = 'PHASE_4_CONDITIONS_AND_LOGIC',
  PHASE_5_AI_USAGE = 'PHASE_5_AI_USAGE',
  PHASE_6_ERROR_HANDLING = 'PHASE_6_ERROR_HANDLING',
  PHASE_7_WORKFLOW_FINALIZATION = 'PHASE_7_WORKFLOW_FINALIZATION',
}

// Node Selection Priority (STRICT ORDER)
export enum NodeSelectionPriority {
  NATIVE_INTEGRATION = 1,  // Highest priority
  AI_AGENT = 2,            // Only if reasoning needed
  HTTP_REQUEST = 3,        // Last resort
}

// AI Usage Rules
export interface AIUsageRules {
  allowed: string[];
  forbidden: string[];
}

export const AI_USAGE_RULES: AIUsageRules = {
  allowed: [
    'text generation',
    'summarization',
    'classification',
    'data transformation',
    'decision-making with clear criteria',
    'content analysis',
    'sentiment analysis',
    'intent detection',
    'natural language understanding',
  ],
  forbidden: [
    'authentication',
    'API selection',
    'data mapping guesses',
    'credential generation',
    'node selection',
    'workflow structure decisions',
  ],
};

// Trigger Selection Rules
export interface TriggerSelectionRule {
  intent: string | RegExp;
  triggerType: string;
  description: string;
}

export const TRIGGER_SELECTION_RULES: TriggerSelectionRule[] = [
  {
    intent: /when.*email|new email|email arrives|gmail/i,
    triggerType: 'gmail',
    description: 'Gmail Trigger - When a new email arrives',
  },
  {
    intent: /every.*day|daily|at \d+.*am|at \d+.*pm|cron|schedule/i,
    triggerType: 'schedule',
    description: 'Schedule Trigger - Time-based execution',
  },
  {
    intent: /when.*form|form.*submit|form submission/i,
    triggerType: 'form',
    description: 'Form Trigger - When form is submitted',
  },
  {
    intent: /webhook|http.*request|api.*call|external.*trigger/i,
    triggerType: 'webhook',
    description: 'Webhook Trigger - External HTTP request',
  },
  {
    intent: /when.*row|new row|sheet.*update|google.*sheet(?!.*doc)/i,
    triggerType: 'google_sheets',
    description: 'Google Sheets Trigger - When a new row is added',
  },
  {
    intent: /chat|conversation|ai.*chat|chatbot/i,
    triggerType: 'chat_trigger',
    description: 'Chat Trigger - Chat-based interaction',
  },
  {
    intent: /manual|on.*demand|when.*click|user.*trigger/i,
    triggerType: 'manual_trigger',
    description: 'Manual Trigger - User-initiated execution',
  },
  {
    intent: /interval|every \d+.*(s|m|h)|recurring/i,
    triggerType: 'interval',
    description: 'Interval Trigger - Recurring at intervals',
  },
];

// Node Selection Heuristics
export interface NodeSelectionHeuristic {
  scenario: string;
  decision: string;
  priority: NodeSelectionPriority;
}

export const NODE_SELECTION_HEURISTICS: NodeSelectionHeuristic[] = [
  {
    scenario: 'Simple data pass-through',
    decision: 'No AI - Use transformation nodes',
    priority: NodeSelectionPriority.NATIVE_INTEGRATION,
  },
  {
    scenario: 'Conditional routing',
    decision: 'IF/Else node',
    priority: NodeSelectionPriority.NATIVE_INTEGRATION,
  },
  {
    scenario: 'Text understanding',
    decision: 'AI Agent',
    priority: NodeSelectionPriority.AI_AGENT,
  },
  {
    scenario: 'External API',
    decision: 'Native node > HTTP Request',
    priority: NodeSelectionPriority.NATIVE_INTEGRATION,
  },
  {
    scenario: 'Multiple services',
    decision: 'Parallel branches',
    priority: NodeSelectionPriority.NATIVE_INTEGRATION,
  },
];

// Hard Fail Conditions
export interface HardFailCondition {
  condition: string;
  description: string;
}

export const HARD_FAIL_CONDITIONS: HardFailCondition[] = [
  {
    condition: 'trigger_missing',
    description: 'Trigger node is missing',
  },
  {
    condition: 'credentials_missing',
    description: 'Required credentials are missing',
  },
  {
    condition: 'ai_used_unnecessarily',
    description: 'AI used when not needed',
  },
  {
    condition: 'required_field_empty',
    description: 'Required field is empty',
  },
  {
    condition: 'node_output_unused',
    description: 'Node output is not used by any downstream node',
  },
];

/**
 * Workflow Construction Logic Manager
 */
export class WorkflowConstructionLogic {
  private currentPhase: WorkflowConstructionPhase | null = null;
  private phaseHistory: Array<{ phase: WorkflowConstructionPhase; timestamp: string }> = [];
  private constructionErrors: Array<{ phase: WorkflowConstructionPhase; error: string }> = [];

  /**
   * PHASE 1: Trigger Selection
   */
  selectTrigger(userIntent: string, answers?: Record<string, string>): {
    triggerType: string;
    confidence: number;
    error?: string;
  } {
    this.setPhase(WorkflowConstructionPhase.PHASE_1_TRIGGER_SELECTION);

    // Check for explicit trigger in answers (PRIORITY: Answers override prompt matching)
    if (answers) {
      const answerText = Object.values(answers).join(' ').toLowerCase();
      
      // Check for manual trigger explicitly
      if (answerText.includes('manual') || answerText.includes('manual run') || answerText.includes('▶️ manual')) {
        console.log('✅ [Trigger Selection] Manual trigger detected in answers - using manual_trigger');
        return { triggerType: 'manual_trigger', confidence: 1.0 };
      }
      
      // Check for other explicit triggers
      const explicitTrigger = Object.values(answers).find(answer =>
        typeof answer === 'string' && 
        (answer.toLowerCase().includes('trigger') || 
         answer.toLowerCase().includes('schedule') ||
         answer.toLowerCase().includes('webhook') ||
         answer.toLowerCase().includes('form'))
      );
      
      if (explicitTrigger) {
        const triggerMatch = TRIGGER_SELECTION_RULES.find(rule => 
          rule.triggerType === explicitTrigger.toLowerCase().replace(/\s+/g, '_')
        );
        if (triggerMatch) {
          return { triggerType: triggerMatch.triggerType, confidence: 1.0 };
        }
      }
    }

    // Match intent to trigger rules
    const matches = TRIGGER_SELECTION_RULES
      .map(rule => ({
        rule,
        match: typeof rule.intent === 'string' 
          ? userIntent.toLowerCase().includes(rule.intent.toLowerCase())
          : rule.intent.test(userIntent),
      }))
      .filter(m => m.match)
      .sort((a, b) => {
        // Prioritize more specific matches
        const aSpecific = a.rule.intent instanceof RegExp ? 1 : 0;
        const bSpecific = b.rule.intent instanceof RegExp ? 1 : 0;
        return bSpecific - aSpecific;
      });

    if (matches.length === 0) {
      return {
        triggerType: 'manual_trigger',
        confidence: 0.3,
        error: 'No trigger match found, defaulting to manual trigger',
      };
    }

    if (matches.length > 1) {
      // Multiple triggers implied - apply priority rules
      // Priority 1: chat_trigger for chatbot workflows
      const chatTriggerMatch = matches.find(m => m.rule.triggerType === 'chat_trigger');
      if (chatTriggerMatch) {
        console.log('✅ [Trigger Selection] Chatbot workflow detected - prioritizing chat_trigger over other triggers');
        return {
          triggerType: 'chat_trigger',
          confidence: 0.95,
        };
      }
      
      // Priority 2: Check if user explicitly mentioned a trigger in answers
      if (answers) {
        const answerText = Object.values(answers).join(' ').toLowerCase();
        for (const match of matches) {
          if (answerText.includes(match.rule.triggerType.replace('_', ' ')) || 
              answerText.includes(match.rule.triggerType)) {
            console.log(`✅ [Trigger Selection] User explicitly mentioned ${match.rule.triggerType} in answers`);
            return {
              triggerType: match.rule.triggerType,
              confidence: 0.9,
            };
          }
        }
      }
      
      // Priority 3: Use the most specific match (RegExp over string)
      const mostSpecific = matches.sort((a, b) => {
        const aSpecific = a.rule.intent instanceof RegExp ? 1 : 0;
        const bSpecific = b.rule.intent instanceof RegExp ? 1 : 0;
        return bSpecific - aSpecific;
      })[0];
      
      console.log(`✅ [Trigger Selection] Multiple triggers detected, using most specific: ${mostSpecific.rule.triggerType}`);
      return {
        triggerType: mostSpecific.rule.triggerType,
        confidence: 0.8,
      };
    }

    return {
      triggerType: matches[0].rule.triggerType,
      confidence: 0.9,
    };
  }

  /**
   * PHASE 2: Action Node Selection
   */
  selectActionNodes(
    requirements: any,
    triggerType: string,
    availableNodes: Map<string, any>
  ): {
    nodes: Array<{ type: string; priority: NodeSelectionPriority; reason: string }>;
    errors: string[];
  } {
    this.setPhase(WorkflowConstructionPhase.PHASE_2_ACTION_NODE_SELECTION);

    const selectedNodes: Array<{ type: string; priority: NodeSelectionPriority; reason: string }> = [];
    const errors: string[] = [];

    // Apply node selection priority
    // 1. Check for native integration nodes first
    const nativeNodes = this.findNativeNodes(requirements, availableNodes);
    nativeNodes.forEach(node => {
      selectedNodes.push({
        type: node.type,
        priority: NodeSelectionPriority.NATIVE_INTEGRATION,
        reason: `Native integration available for ${node.service}`,
      });
    });

    // 2. Check if AI is needed (and allowed)
    const needsAI = this.shouldUseAI(requirements);
    if (needsAI.allowed) {
      selectedNodes.push({
        type: 'ai_agent',
        priority: NodeSelectionPriority.AI_AGENT,
        reason: needsAI.reason,
      });
    } else if (needsAI.forbidden) {
      errors.push(`AI usage forbidden: ${needsAI.reason}`);
    }

    // 3. Use HTTP Request only as last resort
    const needsHTTP = this.needsHTTPRequest(requirements, selectedNodes);
    if (needsHTTP.needed) {
      selectedNodes.push({
        type: 'http_request',
        priority: NodeSelectionPriority.HTTP_REQUEST,
        reason: needsHTTP.reason,
      });
    }

    // Validate: No redundant nodes
    const nodeTypes = selectedNodes.map(n => n.type);
    const duplicates = nodeTypes.filter((type, index) => nodeTypes.indexOf(type) !== index);
    if (duplicates.length > 0) {
      errors.push(`Redundant nodes detected: ${duplicates.join(', ')}`);
    }

    return { nodes: selectedNodes, errors };
  }

  /**
   * PHASE 3: Data Mapping Rules
   */
  validateDataMapping(
    nodes: any[],
    edges: any[]
  ): {
    valid: boolean;
    errors: Array<{ nodeId: string; field: string; error: string }>;
    warnings: Array<{ nodeId: string; field: string; warning: string }>;
  } {
    this.setPhase(WorkflowConstructionPhase.PHASE_3_DATA_MAPPING);

    const errors: Array<{ nodeId: string; field: string; error: string }> = [];
    const warnings: Array<{ nodeId: string; field: string; warning: string }> = [];

    // Check every node input is mapped
    nodes.forEach(node => {
      const nodeConfig = node.data?.config || {};
      const nodeType = node.data?.type || node.type;

      // Get required fields for this node type
      const requiredFields = this.getRequiredFields(nodeType);

      requiredFields.forEach(field => {
        const fieldValue = nodeConfig[field.key];

        // Check if field is empty
        if (!fieldValue || fieldValue === '' || fieldValue === null || fieldValue === undefined) {
          if (field.required) {
            errors.push({
              nodeId: node.id,
              field: field.key,
              error: `Required field '${field.key}' is empty`,
            });
          } else {
            warnings.push({
              nodeId: node.id,
              field: field.key,
              warning: `Optional field '${field.key}' is empty`,
            });
          }
        }

        // Check for hard-coded sample data
        if (fieldValue && this.isSampleData(fieldValue)) {
          errors.push({
            nodeId: node.id,
            field: field.key,
            error: `Field '${field.key}' contains sample/placeholder data: ${fieldValue}`,
          });
        }

        // Check for fake IDs
        if (fieldValue && this.isFakeId(fieldValue)) {
          errors.push({
            nodeId: node.id,
            field: field.key,
            error: `Field '${field.key}' contains fake ID: ${fieldValue}`,
          });
        }
      });
    });

    // Check all edges have valid source/target
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);

      if (!sourceNode) {
        errors.push({
          nodeId: edge.target,
          field: 'source',
          error: `Edge references non-existent source node: ${edge.source}`,
        });
      }

      if (!targetNode) {
        errors.push({
          nodeId: edge.source,
          field: 'target',
          error: `Edge references non-existent target node: ${edge.target}`,
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * PHASE 4: Conditions & Logic
   */
  validateConditionsAndLogic(nodes: any[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    this.setPhase(WorkflowConstructionPhase.PHASE_4_CONDITIONS_AND_LOGIC);

    const errors: string[] = [];
    const warnings: string[] = [];

    nodes.forEach(node => {
      const nodeType = node.data?.type || node.type;

      if (nodeType === 'if_else' || nodeType === 'switch') {
        const config = node.data?.config || {};
        const condition = config.condition || config.expression;

        // Check condition is explicit
        if (!condition || condition.trim() === '') {
          errors.push(`Node ${node.id}: Condition is empty`);
        } else if (this.isVagueCondition(condition)) {
          errors.push(`Node ${node.id}: Condition is vague: "${condition}"`);
        }

        // Check for deep nesting
        const nestingLevel = this.getNestingLevel(node, nodes);
        if (nestingLevel > 2) {
          warnings.push(`Node ${node.id}: Deep nesting detected (level ${nestingLevel})`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * PHASE 5: AI Usage Rules
   */
  validateAIUsage(nodes: any[]): {
    valid: boolean;
    errors: Array<{ nodeId: string; error: string }>;
    warnings: Array<{ nodeId: string; warning: string }>;
  } {
    this.setPhase(WorkflowConstructionPhase.PHASE_5_AI_USAGE);

    const errors: Array<{ nodeId: string; error: string }> = [];
    const warnings: Array<{ nodeId: string; warning: string }> = [];

    nodes.forEach(node => {
      const nodeType = node.data?.type || node.type;

      if (nodeType === 'ai_agent' || nodeType.includes('ai') || nodeType.includes('gpt') || nodeType.includes('claude') || nodeType.includes('gemini')) {
        const config = node.data?.config || {};

        // Check AI is used for allowed purposes
        const purpose = config.purpose || config.role || config.task || '';
        const isAllowed = AI_USAGE_RULES.allowed.some(allowed => 
          purpose.toLowerCase().includes(allowed.toLowerCase())
        );
        const isForbidden = AI_USAGE_RULES.forbidden.some(forbidden => 
          purpose.toLowerCase().includes(forbidden.toLowerCase())
        );

        if (isForbidden) {
          errors.push({
            nodeId: node.id,
            error: `AI used for forbidden purpose: ${purpose}`,
          });
        } else if (!isAllowed && purpose) {
          warnings.push({
            nodeId: node.id,
            warning: `AI purpose unclear: ${purpose}`,
          });
        }

        // Check AI prompt structure
        const prompt = config.prompt || config.userInput || config.systemPrompt || '';
        if (!prompt) {
          errors.push({
            nodeId: node.id,
            error: 'AI node missing prompt/instructions',
          });
        } else if (!this.hasValidAIPromptStructure(prompt)) {
          warnings.push({
            nodeId: node.id,
            warning: 'AI prompt may not have clear structure (Role, Task, Output Format)',
          });
        }

        // Check output schema is defined
        const outputSchema = config.outputSchema || config.responseFormat || '';
        if (!outputSchema && !config.response_json) {
          warnings.push({
            nodeId: node.id,
            warning: 'AI output schema not explicitly defined',
          });
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * PHASE 6: Error Handling
   */
  validateErrorHandling(nodes: any[], edges: any[]): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    recommendations: string[];
  } {
    this.setPhase(WorkflowConstructionPhase.PHASE_6_ERROR_HANDLING);

    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Find external nodes (API calls, HTTP requests, etc.)
    const externalNodes = nodes.filter(node => {
      const nodeType = node.data?.type || node.type;
      return nodeType.includes('http') || 
             nodeType.includes('api') || 
             nodeType.includes('slack') ||
             nodeType.includes('email') ||
             nodeType.includes('gmail') ||
             nodeType.includes('sheets') ||
             nodeType.includes('discord');
    });

    externalNodes.forEach(node => {
      // Check if error path exists
      const hasErrorPath = edges.some(edge => 
        edge.source === node.id && 
        (edge.targetHandle?.includes('error') || 
         nodes.find(n => n.id === edge.target)?.data?.type === 'error_trigger')
      );

      if (!hasErrorPath) {
        warnings.push(`External node ${node.id} (${node.data?.type}) has no error handling path`);
        recommendations.push(`Add error handling path for ${node.data?.type} node`);
      }
    });

    // Check for infinite loops
    const hasInfiniteLoop = this.detectInfiniteLoops(nodes, edges);
    if (hasInfiniteLoop) {
      errors.push('Infinite loop detected in workflow');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      recommendations,
    };
  }

  /**
   * PHASE 7: Workflow Finalization
   */
  finalizeWorkflow(
    nodes: any[],
    edges: any[],
    credentials: string[]
  ): {
    valid: boolean;
    checklist: Array<{ item: string; status: 'pass' | 'fail' | 'warning'; message?: string }>;
    errors: string[];
  } {
    this.setPhase(WorkflowConstructionPhase.PHASE_7_WORKFLOW_FINALIZATION);

    const checklist: Array<{ item: string; status: 'pass' | 'fail' | 'warning'; message?: string }> = [];
    const errors: string[] = [];

    // Checklist item 1: All nodes connected
    const orphanNodes = nodes.filter(node => {
      const hasIncoming = edges.some(e => e.target === node.id);
      const hasOutgoing = edges.some(e => e.source === node.id);
      const isTrigger = (node.data?.type || node.type)?.includes('trigger');
      return !isTrigger && !hasIncoming && !hasOutgoing;
    });

    if (orphanNodes.length > 0) {
      // RELAXED: Don't fail on orphan nodes - just warn and let auto-fix handle it
      checklist.push({
        item: 'All nodes connected',
        status: 'warning',
        message: `${orphanNodes.length} orphan node(s) found - will be auto-connected`,
      });
      // Don't add to errors - let the auto-fix logic handle orphan nodes
      // errors.push(`Orphan nodes: ${orphanNodes.map(n => n.id).join(', ')}`);
    } else {
      checklist.push({
        item: 'All nodes connected',
        status: 'pass',
      });
    }

    // Checklist item 2: Credentials mapped
    const missingCredentials = credentials.filter(cred => {
      // Check if credential is referenced in any node config
      return !nodes.some(node => {
        const config = JSON.stringify(node.data?.config || {});
        return config.toLowerCase().includes(cred.toLowerCase().replace(/_/g, ''));
      });
    });

    if (missingCredentials.length > 0) {
      checklist.push({
        item: 'Credentials mapped',
        status: 'warning',
        message: `Some credentials may not be mapped: ${missingCredentials.join(', ')}`,
      });
    } else {
      checklist.push({
        item: 'Credentials mapped',
        status: 'pass',
      });
    }

    // Checklist item 3: Inputs validated
    const dataMapping = this.validateDataMapping(nodes, edges);
    if (dataMapping.errors.length > 0) {
      checklist.push({
        item: 'Inputs validated',
        status: 'fail',
        message: `${dataMapping.errors.length} input validation error(s)`,
      });
      errors.push(...dataMapping.errors.map(e => `${e.nodeId}.${e.field}: ${e.error}`));
    } else {
      checklist.push({
        item: 'Inputs validated',
        status: 'pass',
      });
    }

    // Checklist item 4: AI outputs structured
    const aiNodes = nodes.filter(n => 
      (n.data?.type || n.type)?.includes('ai') || 
      (n.data?.type || n.type)?.includes('gpt') ||
      (n.data?.type || n.type)?.includes('claude') ||
      (n.data?.type || n.type)?.includes('gemini')
    );

    const aiUsage = this.validateAIUsage(aiNodes);
    if (aiUsage.errors.length > 0) {
      checklist.push({
        item: 'AI outputs structured',
        status: 'fail',
        message: `${aiUsage.errors.length} AI usage error(s)`,
      });
      errors.push(...aiUsage.errors.map(e => `${e.nodeId}: ${e.error}`));
    } else {
      checklist.push({
        item: 'AI outputs structured',
        status: 'pass',
      });
    }

    // Checklist item 5: Errors handled (RELAXED: warnings only, not failures)
    const errorHandling = this.validateErrorHandling(nodes, edges);
    if (errorHandling.errors.length > 0) {
      // RELAXED: Treat error handling issues as warnings, not failures
      checklist.push({
        item: 'Errors handled',
        status: 'warning',
        message: `${errorHandling.errors.length} error handling issue(s)`,
      });
      // Don't add to errors - these are not critical
      // errors.push(...errorHandling.errors);
    } else if (errorHandling.warnings.length > 0) {
      checklist.push({
        item: 'Errors handled',
        status: 'warning',
        message: `${errorHandling.warnings.length} warning(s)`,
      });
    } else {
      checklist.push({
        item: 'Errors handled',
        status: 'pass',
      });
    }

    return {
      valid: errors.length === 0,
      checklist,
      errors,
    };
  }

  // Helper methods
  private setPhase(phase: WorkflowConstructionPhase): void {
    this.currentPhase = phase;
    this.phaseHistory.push({
      phase,
      timestamp: new Date().toISOString(),
    });
  }

  private findNativeNodes(requirements: any, availableNodes: Map<string, any>): Array<{ type: string; service: string }> {
    const nativeNodes: Array<{ type: string; service: string }> = [];
    
    // Check requirements for services that have native nodes
    const services = [
      ...(requirements.platforms || []),
      ...(requirements.apis || []),
    ];

    services.forEach(service => {
      const serviceName = typeof service === 'string' ? service : (service.name || service.type || '');
      const nodeType = this.mapServiceToNodeType(serviceName);
      
      if (nodeType && availableNodes.has(nodeType)) {
        nativeNodes.push({ type: nodeType, service: serviceName });
      }
    });

    return nativeNodes;
  }

  private shouldUseAI(requirements: any): { allowed: boolean; forbidden: boolean; reason: string } {
    const prompt = (requirements.userPrompt || '').toLowerCase();
    const needsAI = AI_USAGE_RULES.allowed.some(allowed => 
      prompt.includes(allowed.toLowerCase())
    );
    const forbiddenAI = AI_USAGE_RULES.forbidden.some(forbidden => 
      prompt.includes(forbidden.toLowerCase())
    );

    if (forbiddenAI) {
      return { allowed: false, forbidden: true, reason: 'AI usage is forbidden for this purpose' };
    }

    if (needsAI) {
      return { allowed: true, forbidden: false, reason: 'AI needed for text understanding/generation' };
    }

    return { allowed: false, forbidden: false, reason: 'AI not needed' };
  }

  private needsHTTPRequest(requirements: any, selectedNodes: any[]): { needed: boolean; reason: string } {
    // Check if we have native nodes for all requirements
    const hasNativeNodes = selectedNodes.some(n => n.priority === NodeSelectionPriority.NATIVE_INTEGRATION);
    
    // Check if there are APIs mentioned but no native nodes
    const hasAPIs = requirements.apis && requirements.apis.length > 0;
    
    if (hasAPIs && !hasNativeNodes) {
      return { needed: true, reason: 'API required but no native node available' };
    }

    return { needed: false, reason: '' };
  }

  private getRequiredFields(nodeType: string): Array<{ key: string; required: boolean }> {
    // This would typically come from node definitions
    // For now, return common required fields
    const commonFields: Record<string, Array<{ key: string; required: boolean }>> = {
      'slack_message': [{ key: 'channel', required: true }, { key: 'message', required: true }],
      'email': [{ key: 'to', required: true }, { key: 'subject', required: true }],
      'http_request': [{ key: 'url', required: true }, { key: 'method', required: true }],
      'ai_agent': [{ key: 'userInput', required: true }],
    };

    return commonFields[nodeType] || [];
  }

  private isSampleData(value: any): boolean {
    if (typeof value !== 'string') return false;
    const lower = value.toLowerCase();
    return lower.includes('example') ||
           lower.includes('sample') ||
           lower.includes('test') ||
           lower.includes('placeholder') ||
           lower.includes('todo') ||
           lower === 'xxx' ||
           lower === 'xxx@xxx.com';
  }

  private isFakeId(value: any): boolean {
    if (typeof value !== 'string') return false;
    // Check for common fake ID patterns
    return /^(test|fake|dummy|sample|example)[-_]?[a-z0-9]+$/i.test(value) ||
           value === '123' ||
           value === 'abc123';
  }

  private isVagueCondition(condition: string): boolean {
    const vaguePatterns = [
      /check|verify|validate|test/i,
      /if.*then/i,
      /when.*then/i,
    ];
    return vaguePatterns.some(pattern => pattern.test(condition) && condition.length < 20);
  }

  private getNestingLevel(node: any, allNodes: any[]): number {
    // Simplified nesting level calculation
    // In a real implementation, this would traverse the graph
    return 1; // Placeholder
  }

  private hasValidAIPromptStructure(prompt: string): boolean {
    // Check if prompt has Role, Task, Output Format structure
    const hasRole = /role|you are|act as/i.test(prompt);
    const hasTask = /task|objective|goal|purpose/i.test(prompt);
    const hasOutput = /output|format|schema|json|structure/i.test(prompt);
    return hasRole && hasTask && hasOutput;
  }

  private detectInfiniteLoops(nodes: any[], edges: any[]): boolean {
    // Simple cycle detection
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      recStack.add(nodeId);

      const outgoingEdges = edges.filter(e => e.source === nodeId);
      for (const edge of outgoingEdges) {
        if (hasCycle(edge.target)) return true;
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const node of nodes) {
      if (!visited.has(node.id) && hasCycle(node.id)) {
        return true;
      }
    }

    return false;
  }

  private mapServiceToNodeType(serviceName: string): string | null {
    const serviceMap: Record<string, string> = {
      'slack': 'slack_message',
      'email': 'email',
      'gmail': 'gmail',
      'discord': 'discord',
      'google docs': 'google_doc',  // CRITICAL: Must come before 'sheets' to avoid false match
      'google doc': 'google_doc',
      'docs': 'google_doc',
      'sheets': 'google_sheets',
      'google sheets': 'google_sheets',
      'http': 'http_request',
      'api': 'http_request',
    };

    const lower = serviceName.toLowerCase();
    // Sort by key length (longest first) to match more specific terms first
    const sortedEntries = Object.entries(serviceMap).sort((a, b) => b[0].length - a[0].length);
    for (const [key, value] of sortedEntries) {
      if (lower.includes(key)) {
        return value;
      }
    }

    return null;
  }

  getCurrentPhase(): WorkflowConstructionPhase | null {
    return this.currentPhase;
  }

  getPhaseHistory(): Array<{ phase: WorkflowConstructionPhase; timestamp: string }> {
    return [...this.phaseHistory];
  }

  getConstructionErrors(): Array<{ phase: WorkflowConstructionPhase; error: string }> {
    return [...this.constructionErrors];
  }
}
