// AI Workflow Editor
// In-workflow intelligence with node suggestions and code assist

import { geminiOrchestrator } from './gemini-orchestrator';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { unifiedGraphOrchestrator } from '../../core/orchestration/unified-graph-orchestrator';
import type { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import type { ExecutionOrder } from '../../core/orchestration/execution-order-manager';
import type {
  AiEditorOperation,
  AiEditorMutationOperation,
  AiEditorNodeSchemaSummary,
  AiEditorRegistryContext,
  WorkflowDiff,
  WorkflowNodeDiff,
  WorkflowEdgeDiff,
} from '../../core/types/ai-editor-contracts';

interface NodeSuggestion {
  type: string;
  reason: string;
  confidence: number;
  impact: string;
}

interface NodeImprovement {
  suggestions: NodeSuggestion[];
  alternatives: any[];
  optimizations: any[];
  warnings: string[];
}

export class AIWorkflowEditor {
  /**
   * Build a registry-driven summary of all node types that appear in the given workflow.
   * This is the canonical way for the AI editor to discover node schemas without ever
   * re-defining them outside of unified-node-registry.
   */
  buildRegistryContextForWorkflow(workflow: Workflow): AiEditorRegistryContext {
    const nodeSchemas = new Map<string, AiEditorNodeSchemaSummary>();

    for (const node of workflow.nodes || []) {
      const normalizedType =
        unifiedNormalizeNodeType(node as any) ||
        (node as any).data?.type ||
        node.type;

      if (!normalizedType || nodeSchemas.has(normalizedType)) {
        continue;
      }

      const def = unifiedNodeRegistry.get(normalizedType);
      if (!def) {
        continue;
      }

      const inputs: AiEditorNodeSchemaSummary['inputs'] = [];
      const inputSchema = def.inputSchema || {};
      const requiredInputs = new Set(def.requiredInputs || []);

      for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
        const fd: any = fieldDef;
        inputs.push({
          name: fieldName,
          type: String(fd.type || 'string'),
          required: requiredInputs.has(fieldName) || !!fd.required,
          description:
            typeof fd.description === 'string' ? fd.description : undefined,
        });
      }

      const outputs: AiEditorNodeSchemaSummary['outputs'] = [];
      const outputSchema = unifiedNodeRegistry.getOutputSchema(normalizedType);
      if (outputSchema) {
        for (const [portName, portDef] of Object.entries(outputSchema)) {
          const port: any = portDef;
          const schema = port.schema || {};
          const properties = schema.properties as
            | Record<string, { type?: string }>
            | undefined;
          const fields: Record<string, string> = {};

          if (properties && typeof properties === 'object') {
            for (const [propName, meta] of Object.entries(properties)) {
              const mt: any = meta;
              const t = typeof mt.type === 'string' ? mt.type : 'any';
              fields[propName] = t;
            }
          }

          outputs.push({
            port: portName,
            fields: Object.keys(fields).length ? fields : undefined,
          });
        }
      }

      const credentials =
        def.credentialSchema?.requirements?.map((req) => ({
          provider: req.provider,
          category: req.category || 'credential',
          required: !!req.required,
        })) || [];

      nodeSchemas.set(normalizedType, {
        type: normalizedType,
        label: def.label,
        category: def.category,
        description: def.description,
        inputs,
        outputs,
        credentials: credentials.length ? credentials : undefined,
      });
    }

    return {
      nodeSchemas: Object.fromEntries(nodeSchemas.entries()),
    };
  }

  /**
   * Apply a list of AI editor operations to a workflow using the unified graph orchestrator.
   * All structural changes are delegated to orchestrator; edges are never mutated directly.
   */
  async applyOperations(
    workflow: Workflow,
    operations: AiEditorOperation[]
  ): Promise<{
    workflow: Workflow;
    executionOrder?: ExecutionOrder;
    diff: WorkflowDiff;
    errors: string[];
    warnings: string[];
  }> {
    let currentWorkflow: Workflow = {
      nodes: [...workflow.nodes],
      edges: [...workflow.edges],
      metadata: workflow.metadata,
    };
    let executionOrder: ExecutionOrder | undefined;
    const errors: string[] = [];
    const warnings: string[] = [];

    const originalNodesById = new Map<string, WorkflowNode>();
    const originalEdgesById = new Map<string, WorkflowEdge>();
    for (const n of workflow.nodes) originalNodesById.set(n.id, n);
    for (const e of workflow.edges) originalEdgesById.set(e.id, e);

    const mutationOps = operations.filter(
      (op): op is AiEditorMutationOperation =>
        op.kind !== 'explain_workflow' && op.kind !== 'validate_workflow'
    );

    const applyJsonPointerUpdate = (obj: any, path: string, value: unknown) => {
      if (!path.startsWith('/')) {
        throw new Error(`Invalid JSON pointer path: ${path}`);
      }
      const segments = path
        .split('/')
        .slice(1)
        .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
      let target: any = obj;
      for (let i = 0; i < segments.length - 1; i++) {
        const key = segments[i];
        if (typeof target[key] !== 'object' || target[key] === null) {
          target[key] = {};
        }
        target = target[key];
      }
      target[segments[segments.length - 1]] = value;
    };

    for (const op of mutationOps) {
      try {
        if (op.kind === 'add_node' || op.kind === 'insert_safety_node') {
          const def = unifiedNodeRegistry.get(op.nodeType);
          if (!def) {
            errors.push(`Unknown node type: ${op.nodeType}`);
            continue;
          }
          const id = `${op.nodeType}_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;
          const baseConfig = def.defaultConfig();
          const config = {
            ...baseConfig,
            ...(op.configOverrides || {}),
          };
          const customLabel =
            op.kind === 'add_node' && typeof op.label === 'string' ? op.label : undefined;
          const newNode: WorkflowNode = {
            id,
            type: op.nodeType,
            position: { x: 0, y: 0 },
            data: {
              label: customLabel || def.label || op.nodeType,
              type: op.nodeType,
              category: def.category,
              config,
            },
          };

          const positionHint = op.kind === 'insert_safety_node' ? op.position : op.positionHint;
          const injectionPosition = positionHint?.relation || 'after';
          const referenceNodeId = positionHint?.referenceNodeId || currentWorkflow.nodes[0]?.id;

          if (!referenceNodeId) {
            errors.push('add_node: no referenceNodeId available to place the node');
            continue;
          }

          const injectionContext = {
            type: op.kind === 'insert_safety_node' ? 'safety' : 'user_requested',
            position: injectionPosition,
            referenceNodeId,
            reason: 'ai_editor',
          } as const;

          const result = await unifiedGraphOrchestrator.injectNode(
            currentWorkflow,
            newNode,
            injectionContext
          );
          currentWorkflow = result.workflow;
          executionOrder = result.executionOrder;
          if (result.errors.length) errors.push(...result.errors);
          if (result.warnings.length) warnings.push(...result.warnings);
        } else if (op.kind === 'remove_node') {
          const result = unifiedGraphOrchestrator.removeNode(currentWorkflow, op.nodeId);
          currentWorkflow = result.workflow;
          executionOrder = result.executionOrder;
          if (result.errors.length) errors.push(...result.errors);
          if (result.warnings.length) warnings.push(...result.warnings);
        } else if (op.kind === 'update_node_config') {
          const node = currentWorkflow.nodes.find((n) => n.id === op.nodeId);
          if (!node) {
            errors.push(`update_node_config: node ${op.nodeId} not found`);
            continue;
          }
          const clonedConfig = { ...(node.data.config || {}) };
          applyJsonPointerUpdate(clonedConfig, op.path, op.newValue);
          node.data = {
            ...node.data,
            config: clonedConfig,
          };
          const recon = unifiedGraphOrchestrator.reconcileWorkflow(currentWorkflow);
          currentWorkflow = recon.workflow;
          executionOrder = recon.executionOrder;
          if (recon.errors.length) errors.push(...recon.errors);
          if (recon.warnings.length) warnings.push(...recon.warnings);
        } else if (op.kind === 'replace_node') {
          const node = currentWorkflow.nodes.find((n) => n.id === op.targetNodeId);
          if (!node) {
            errors.push(`replace_node: node ${op.targetNodeId} not found`);
            continue;
          }
          const def = unifiedNodeRegistry.get(op.newNodeType);
          if (!def) {
            errors.push(`replace_node: unknown node type ${op.newNodeType}`);
            continue;
          }
          const baseConfig = def.defaultConfig();
          const existingConfig = (node.data.config || {}) as Record<string, unknown>;
          const inputSchema = def.inputSchema || {};

          const preservedConfig: Record<string, unknown> = {};
          if (op.configStrategy === 'preserve_compatible' || op.configStrategy === 'merge') {
            for (const key of Object.keys(inputSchema)) {
              if (key in existingConfig) {
                preservedConfig[key] = existingConfig[key];
              }
            }
          }

          const mergedConfig: Record<string, unknown> =
            op.configStrategy === 'use_defaults'
              ? { ...baseConfig }
              : {
                  ...baseConfig,
                  ...preservedConfig,
                };

          if (op.configOverrides) {
            Object.assign(mergedConfig, op.configOverrides);
          }

          node.type = op.newNodeType;
          node.data = {
            ...node.data,
            type: op.newNodeType,
            label: def.label || node.data.label || op.newNodeType,
            category: def.category,
            config: mergedConfig,
          };

          const recon = unifiedGraphOrchestrator.reconcileWorkflow(currentWorkflow);
          currentWorkflow = recon.workflow;
          executionOrder = recon.executionOrder;
          if (recon.errors.length) errors.push(...recon.errors);
          if (recon.warnings.length) warnings.push(...recon.warnings);
        } else if (op.kind === 'refactor_linearize') {
          // Phase 1: no-op with explicit warning; structural refactors require dedicated design.
          warnings.push(
            'refactor_linearize: operation acknowledged but no structural changes were applied in this phase.'
          );
        }
      } catch (err: any) {
        errors.push(
          `Failed to apply operation ${op.kind}: ${err?.message || String(err)}`
        );
      }
    }

    const validation = unifiedGraphOrchestrator.validateWorkflow(
      currentWorkflow,
      executionOrder
    );
    if (!validation.valid) {
      errors.push(...validation.errors);
    }
    if (validation.warnings.length) {
      warnings.push(...validation.warnings);
    }

    const nodeDiffs: WorkflowNodeDiff[] = [];
    const edgeDiffs: WorkflowEdgeDiff[] = [];

    const finalNodesById = new Map<string, WorkflowNode>();
    const finalEdgesById = new Map<string, WorkflowEdge>();
    for (const n of currentWorkflow.nodes) finalNodesById.set(n.id, n);
    for (const e of currentWorkflow.edges) finalEdgesById.set(e.id, e);

    const allNodeIds = new Set<string>([
      ...Array.from(originalNodesById.keys()),
      ...Array.from(finalNodesById.keys()),
    ]);
    for (const id of allNodeIds) {
      const before = originalNodesById.get(id);
      const after = finalNodesById.get(id);
      if (!before && after) {
        nodeDiffs.push({ nodeId: id, before: undefined, after });
      } else if (before && !after) {
        nodeDiffs.push({ nodeId: id, before, after: undefined });
      } else if (before && after) {
        const beforeJson = JSON.stringify(before);
        const afterJson = JSON.stringify(after);
        if (beforeJson !== afterJson) {
          nodeDiffs.push({ nodeId: id, before, after });
        }
      }
    }

    const allEdgeIds = new Set<string>([
      ...Array.from(originalEdgesById.keys()),
      ...Array.from(finalEdgesById.keys()),
    ]);
    for (const id of allEdgeIds) {
      const before = originalEdgesById.get(id);
      const after = finalEdgesById.get(id);
      if (!before && after) {
        edgeDiffs.push({ edgeId: id, before: undefined, after });
      } else if (before && !after) {
        edgeDiffs.push({ edgeId: id, before, after: undefined });
      } else if (before && after) {
        const beforeJson = JSON.stringify(before);
        const afterJson = JSON.stringify(after);
        if (beforeJson !== afterJson) {
          edgeDiffs.push({ edgeId: id, before, after });
        }
      }
    }

    const diff: WorkflowDiff = {
      nodes: nodeDiffs.length ? nodeDiffs : undefined,
      edges: edgeDiffs.length ? edgeDiffs : undefined,
      metadata:
        JSON.stringify(workflow.metadata || {}) !==
        JSON.stringify(currentWorkflow.metadata || {})
          ? {
              before: workflow.metadata,
              after: currentWorkflow.metadata,
            }
          : undefined,
    };

    return {
      workflow: currentWorkflow,
      executionOrder,
      diff,
      errors,
      warnings,
    };
  }

  /**
   * LLM-backed structured edit suggestions with orchestrator dry-run for diff preview (no persistence).
   */
  async suggestWorkflowEdits(
    workflow: Workflow,
    prompt: string,
    options?: {
      focusedNodeId?: string;
      /** Prior AI Editor chat turns so follow-ups ("implement it") stay aligned with discussed intent */
      conversationHistory?: Array<{ role: string; content: string }>;
    }
  ): Promise<{
    message: string;
    operations: AiEditorMutationOperation[];
    dryRun: Awaited<ReturnType<AIWorkflowEditor['applyOperations']>>;
  }> {
    const registryContext = this.buildRegistryContextForWorkflow(workflow);
    const validation = unifiedGraphOrchestrator.validateWorkflow(workflow);
    const focusedNodeId = options?.focusedNodeId;
    const focusedNode = focusedNodeId
      ? workflow.nodes.find((n) => n.id === focusedNodeId)
      : undefined;

    const opHelp = [
      'Allowed operation "kind" values ONLY:',
      '- add_node: { "kind":"add_node", "nodeType": string, "label"?: string, "configOverrides"?: object, "positionHint"?: { "relation":"before"|"after"|"replace", "referenceNodeId": string } }',
      '- remove_node: { "kind":"remove_node", "nodeId": string }',
      '- replace_node: { "kind":"replace_node", "targetNodeId": string, "newNodeType": string, "configStrategy"?: "preserve_compatible"|"use_defaults"|"merge", "configOverrides"?: object }',
      '- update_node_config: { "kind":"update_node_config", "nodeId": string, "path": string (JSON pointer starting with /, e.g. /subject), "newValue": any }',
      '- insert_safety_node: { "kind":"insert_safety_node", "nodeType": string, "position": { "relation":"before"|"after", "referenceNodeId": string }, "configOverrides"?: object }',
      '- refactor_linearize: { "kind":"refactor_linearize", "focusNodeIds"?: string[] } (prefer avoiding; may be no-op)',
      'Use existing node ids from the workflow for references. Do not output edges.',
    ].join('\n');

    const llmInput = [
      'You are a workflow editor. Respond with ONLY a single JSON object (no markdown fences) with keys:',
      '- message: short human explanation',
      '- operations: array of mutation operations following the schema below',
      opHelp,
      '=== WORKFLOW NODES ===',
      JSON.stringify(
        workflow.nodes.map((n) => ({
          id: n.id,
          type: (n.data as any)?.type || n.type,
          label: (n.data as any)?.label,
        })),
        null,
        2
      ),
      '=== WORKFLOW EDGES ===',
      JSON.stringify(
        workflow.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type,
        })),
        null,
        2
      ),
      focusedNode
        ? `=== FOCUSED NODE ===\n${JSON.stringify({ id: focusedNode.id, type: (focusedNode.data as any)?.type || focusedNode.type }, null, 2)}`
        : '',
      '=== REGISTRY SUMMARY (node types in workflow) ===',
      JSON.stringify(registryContext.nodeSchemas, null, 2),
      '=== STRUCTURAL VALIDATION ===',
      JSON.stringify(
        {
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
        },
        null,
        2
      ),
      options?.conversationHistory?.length
        ? [
            '=== RECENT CONVERSATION (multi-turn — use for vague follow-ups) ===',
            'Critical rules:',
            '- If the latest user message is short or vague (e.g. "implement it", "do that", "yes", "go ahead", "apply"), the operations MUST implement what earlier messages already established.',
            '- Do NOT invent unrelated edits (e.g. tweaking text_formatter or ollama config) when the user and assistant discussed changing the trigger or graph structure.',
            '- Example: user asked to start with manual_trigger instead of schedule → use replace_node on the schedule node id with newNodeType "manual_trigger" (preserve_compatible or merge as needed), NOT random downstream config updates.',
            '- Identify trigger nodes from WORKFLOW NODES (types like schedule, manual_trigger, webhook_trigger, form, chat_trigger).',
            JSON.stringify(
              options.conversationHistory.map((t) => ({
                role: t.role,
                content:
                  typeof t.content === 'string' && t.content.length > 12000
                    ? `${t.content.slice(0, 12000)}\n...[truncated]`
                    : t.content,
              })),
              null,
              2
            ),
          ].join('\n\n')
        : '',
      '=== USER REQUEST (latest turn) ===',
      prompt.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');

    let message = 'Review suggested operations below.';
    let operations: AiEditorMutationOperation[] = [];

    try {
      const rawResult = await geminiOrchestrator.processRequest('chat-generation', llmInput, {
        model: 'gemini-3.5-flash',
        temperature: 0.25,
      });
      const text =
        typeof rawResult === 'string'
          ? rawResult
          : (rawResult as any)?.content || JSON.stringify(rawResult);
      const parsed = this.parseSuggestJson(text);
      message = parsed.message || message;
      operations = this.sanitizeMutationOperations(parsed.operations);
    } catch (e: any) {
      message = `Could not produce structured suggestions: ${e?.message || String(e)}`;
      operations = [];
    }

    const clone: Workflow = JSON.parse(JSON.stringify(workflow));
    const dryRun = await this.applyOperations(clone, operations);

    return { message, operations, dryRun };
  }

  private parseSuggestJson(text: string): { message: string; operations: unknown[] } {
    const trimmed = text.trim();
    let jsonStr = trimmed;
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      jsonStr = fence[1].trim();
    }
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start >= 0 && end > start) {
      jsonStr = jsonStr.slice(start, end + 1);
    }
    const obj = JSON.parse(jsonStr);
    return {
      message: typeof obj.message === 'string' ? obj.message : '',
      operations: Array.isArray(obj.operations) ? obj.operations : [],
    };
  }

  private sanitizeMutationOperations(raw: unknown[]): AiEditorMutationOperation[] {
    const allowed = new Set<string>([
      'add_node',
      'remove_node',
      'replace_node',
      'update_node_config',
      'insert_safety_node',
      'refactor_linearize',
    ]);
    const out: AiEditorMutationOperation[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const k = (item as any).kind;
      if (typeof k !== 'string' || !allowed.has(k)) continue;
      out.push(item as AiEditorMutationOperation);
    }
    return out;
  }

  async suggestNodeImprovements(
    workflow: Workflow,
    currentNode: WorkflowNode
  ): Promise<NodeImprovement> {
    const analysis = await this.analyzeNodeContext(workflow, currentNode);
    
    return {
      suggestions: await this.generateSuggestions(analysis, currentNode),
      alternatives: await this.findAlternativeNodes(currentNode, workflow),
      optimizations: await this.suggestOptimizations(currentNode, workflow),
      warnings: this.identifyPotentialIssues(currentNode, workflow),
    };
  }

  async replaceNode(
    workflow: Workflow,
    nodeId: string,
    replacementType: string
  ): Promise<{
    success: boolean;
    newNode?: any;
    impactAnalysis?: any;
    migrationSteps?: string[];
    errors?: string[];
    suggestions?: string[];
  }> {
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) {
      return {
        success: false,
        errors: ['Node not found'],
      };
    }
    
    const context = this.extractNodeContext(workflow, nodeId);
    
    // Generate new node configuration
    const newConfig = await this.generateNodeConfig(replacementType, context);
    
    // Validate the replacement
    const validation = await this.validateReplacement(workflow, nodeId, newConfig);
    
    if (validation.valid) {
      return {
        success: true,
        newNode: newConfig,
        impactAnalysis: validation.impact,
        migrationSteps: validation.migrationSteps,
      };
    }
    
    return {
      success: false,
      errors: validation.errors,
      suggestions: validation.suggestions,
    };
  }

  async realTimeCodeAssist(
    node: WorkflowNode,
    code: string,
    language: string
  ): Promise<{
    completions: string[];
    corrections: any[];
    optimizations: any[];
    documentation: string;
  }> {
    const context = {
      nodeType: node.type,
      nodeConfig: node.data.config,
      existingCode: code,
      language,
    };
    
    try {
      const result = await geminiOrchestrator.processRequest('code-assistance', {
        prompt: `Provide code assistance for ${language} in this context: ${JSON.stringify(context, null, 2)}`,
        model: 'qwen2.5-coder:7b',
        temperature: 0.2,
      });
      
      // Parse AI response
      const parsed = typeof result === 'string' ? this.parseCodeAssistResponse(result) : result;
      
      return {
        completions: parsed.completions || [],
        corrections: parsed.corrections || [],
        optimizations: parsed.optimizations || [],
        documentation: parsed.documentation || '',
      };
    } catch (error) {
      console.error('Error in code assist:', error);
      return {
        completions: [],
        corrections: [],
        optimizations: [],
        documentation: '',
      };
    }
  }

  private async analyzeNodeContext(
    workflow: Workflow,
    node: WorkflowNode
  ): Promise<any> {
    // Analyze surrounding nodes and connections
    const incomingEdges = workflow.edges.filter(e => e.target === node.id);
    const outgoingEdges = workflow.edges.filter(e => e.source === node.id);
    
    const inputNodes = incomingEdges.map(e => 
      workflow.nodes.find(n => n.id === e.source)
    ).filter(Boolean);
    
    const outputNodes = outgoingEdges.map(e => 
      workflow.nodes.find(n => n.id === e.target)
    ).filter(Boolean);
    
    return {
      node,
      inputNodes: inputNodes.map(n => ({ type: n!.type, label: n!.data.label })),
      outputNodes: outputNodes.map(n => ({ type: n!.type, label: n!.data.label })),
      workflowSize: workflow.nodes.length,
      nodeCategory: node.data.category,
    };
  }

  private async generateSuggestions(
    analysis: any,
    currentNode: WorkflowNode
  ): Promise<NodeSuggestion[]> {
    const prompt = `Analyze this workflow node and suggest improvements:
Current Node: ${currentNode.data.label} (${currentNode.type})
Category: ${currentNode.data.category}
Input Nodes: ${analysis.inputNodes.map((n: any) => n.type).join(', ')}
Output Nodes: ${analysis.outputNodes.map((n: any) => n.type).join(', ')}

Suggest 3-5 improvements or alternative approaches. Respond with JSON:
{
  "suggestions": [
    {
      "type": "add_node|replace_node|optimize",
      "reason": "...",
      "confidence": 0.0-1.0,
      "impact": "..."
    }
  ]
}`;
    
    try {
      const result = await geminiOrchestrator.processRequest('node-suggestion', {
        prompt,
        temperature: 0.5,
      });
      
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      return parsed.suggestions || [];
    } catch (error) {
      console.error('Error generating suggestions:', error);
      return [];
    }
  }

  private async findAlternativeNodes(
    currentNode: WorkflowNode,
    workflow: Workflow
  ): Promise<any[]> {
    // Find nodes that could replace the current node
    const alternatives: any[] = [];
    
    // Simple heuristic: find nodes in same category
    const sameCategoryNodes = workflow.nodes.filter(
      n => n.data.category === currentNode.data.category && n.id !== currentNode.id
    );
    
    alternatives.push(...sameCategoryNodes.map(n => ({
      node: n,
      reason: 'Same category',
      compatibility: this.checkCompatibility(currentNode, n),
    })));
    
    return alternatives.slice(0, 5);
  }

  private async suggestOptimizations(
    node: WorkflowNode,
    workflow: Workflow
  ): Promise<any[]> {
    const optimizations: any[] = [];
    
    // Check for common optimization patterns
    const actualType = unifiedNormalizeNodeType(node as any) || node.data?.type || node.type;
    const def = unifiedNodeRegistry.get(actualType);

    const isHttpLike = !!def?.inputSchema && ('url' in def.inputSchema || 'endpoint' in def.inputSchema);
    if (isHttpLike) {
      optimizations.push({
        type: 'caching',
        suggestion: 'Consider adding caching for repeated requests',
        impact: 'high',
      });
    }
    
    const isCodeLike = !!def?.inputSchema && ('code' in def.inputSchema || 'script' in def.inputSchema);
    if (isCodeLike) {
      optimizations.push({
        type: 'performance',
        suggestion: 'Review code for performance bottlenecks',
        impact: 'medium',
      });
    }
    
    return optimizations;
  }

  private identifyPotentialIssues(
    node: WorkflowNode,
    workflow: Workflow
  ): string[] {
    const warnings: string[] = [];
    const actualType = unifiedNormalizeNodeType(node as any) || node.data?.type || node.type;
    const def = unifiedNodeRegistry.get(actualType);
    const isTrigger = def?.category === 'trigger' || actualType.includes('trigger');
    
    // Check for common issues
    const incomingEdges = workflow.edges.filter(e => e.target === node.id);
    if (incomingEdges.length === 0 && !isTrigger) {
      warnings.push('Node has no input connections');
    }
    
    const outgoingEdges = workflow.edges.filter(e => e.source === node.id);
    if (outgoingEdges.length === 0) {
      warnings.push('Node has no output connections');
    }
    
    // Check for error handling
    const isHttpLike = !!def?.inputSchema && ('url' in def.inputSchema || 'endpoint' in def.inputSchema);
    if (isHttpLike) {
      const hasErrorHandlingNode = workflow.nodes.some((n) => {
        const nt = unifiedNormalizeNodeType(n as any) || (n as any).data?.type || n.type;
        const nd = unifiedNodeRegistry.get(nt);
        return (nd?.tags || []).some((t) => String(t).toLowerCase().includes('error'));
      });
      if (!hasErrorHandlingNode) {
        warnings.push('HTTP-like node may benefit from explicit error handling (retry/fallback path)');
      }
    }
    
    return warnings;
  }

  private extractNodeContext(workflow: Workflow, nodeId: string): any {
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (!node) return {};
    
    const incomingEdges = workflow.edges.filter(e => e.target === nodeId);
    const outgoingEdges = workflow.edges.filter(e => e.source === nodeId);
    
    return {
      node,
      inputs: incomingEdges.map(e => ({
        source: workflow.nodes.find(n => n.id === e.source),
        edge: e,
      })),
      outputs: outgoingEdges.map(e => ({
        target: workflow.nodes.find(n => n.id === e.target),
        edge: e,
      })),
      workflowContext: {
        totalNodes: workflow.nodes.length,
        categories: [...new Set(workflow.nodes.map(n => n.data.category))],
      },
    };
  }

  private async generateNodeConfig(
    replacementType: string,
    context: any
  ): Promise<any> {
    const prompt = `Generate configuration for a ${replacementType} node to replace the current node.
Context: ${JSON.stringify(context, null, 2)}

Provide a JSON configuration object with appropriate fields for this node type.`;
    
    try {
      const result = await geminiOrchestrator.processRequest('code-generation', {
        prompt,
        temperature: 0.3,
      });
      
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      return {
        type: replacementType,
        data: {
          type: replacementType,
          label: replacementType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          config: parsed.config || parsed,
        },
      };
    } catch (error) {
      console.error('Error generating node config:', error);
      return {
        type: replacementType,
        data: {
          type: replacementType,
          label: replacementType,
          config: {},
        },
      };
    }
  }

  private async validateReplacement(
    workflow: Workflow,
    nodeId: string,
    newConfig: any
  ): Promise<{
    valid: boolean;
    impact?: any;
    migrationSteps?: string[];
    errors?: string[];
    suggestions?: string[];
  }> {
    const errors: string[] = [];
    const suggestions: string[] = [];
    
    // Basic validation
    if (!newConfig.type) {
      errors.push('New node type is required');
    }
    
    // Check compatibility with connections
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (node) {
      const incomingEdges = workflow.edges.filter(e => e.target === nodeId);
      const outgoingEdges = workflow.edges.filter(e => e.source === nodeId);
      
      if (incomingEdges.length > 0) {
        suggestions.push(`Review ${incomingEdges.length} incoming connection(s)`);
      }
      
      if (outgoingEdges.length > 0) {
        suggestions.push(`Review ${outgoingEdges.length} outgoing connection(s)`);
      }
    }
    
    return {
      valid: errors.length === 0,
      impact: {
        affectedNodes: workflow.edges.filter(e => 
          e.source === nodeId || e.target === nodeId
        ).length,
        connections: workflow.edges.filter(e => 
          e.source === nodeId || e.target === nodeId
        ).length,
      },
      migrationSteps: [
        '1. Backup current workflow',
        '2. Replace node configuration',
        '3. Verify connections',
        '4. Test workflow execution',
      ],
      errors: errors.length > 0 ? errors : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  private checkCompatibility(node1: WorkflowNode, node2: WorkflowNode): 'high' | 'medium' | 'low' {
    if (node1.data.category === node2.data.category) {
      return 'high';
    }
    if (node1.type === node2.type) {
      return 'high';
    }
    return 'medium';
  }

  private parseCodeAssistResponse(response: string): any {
    try {
      // Try to parse as JSON first
      return JSON.parse(response);
    } catch {
      // If not JSON, try to extract structured information
      const completions: string[] = [];
      const corrections: any[] = [];
      const optimizations: any[] = [];
      
      // Simple pattern matching (can be enhanced)
      const completionMatches = response.match(/completion[s]?:?\s*(.+?)(?:\n|$)/gi);
      if (completionMatches) {
        completionMatches.forEach(match => {
          const content = match.replace(/completion[s]?:?\s*/i, '').trim();
          if (content) completions.push(content);
        });
      }
      
      return {
        completions,
        corrections,
        optimizations,
        documentation: response,
      };
    }
  }
}

// Export singleton instance
export const aiWorkflowEditor = new AIWorkflowEditor();
