/**
 * Intelligent Configuration Filler
 *
 * Uses prompt + data-flow context to fill node configurations from user intent,
 * without hardcoding node-type-specific "intent" logic.
 *
 * Core behavior:
 * - Nodes are processed sequentially in topological order.
 * - For each node, we look at:
 *   - user intent (prompt)
 *   - upstream JSON shape (EffectiveOutputSchema)
 *   - this node's responsibility (registry input schema + requiredInputs)
 * - We only bind fields that are missing, and only to upstream keys that are likely relevant.
 * - We emit mapping metadata so runtime can optionally activate intent routing.
 *
 * Empty-until-runtime: Input field values are NOT filled here. They stay empty so that
 * only at runtime (after the previous node has run) does the executor fill them using
 * actual previous output via AI Input Resolver + guarantee layer.
 */

import { WorkflowNode } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import type { EffectiveOutputSchema } from '../../core/types/unified-node-contract';
import { LLMAdapter } from '../../shared/llm-adapter';

interface Workflow {
  nodes: WorkflowNode[];
  edges: any[];
}

export class IntelligentConfigFiller {
  private llmAdapter = new LLMAdapter();

  /**
   * Optional build-time LLM suggestion for (targetField -> upstreamKey) bindings.
   * When BUILD_TIME_LLM_KEY_SUGGESTION=true, calls LLM with prompt + upstream keys + target fields;
   * returns a map of fieldName -> upstreamKey or null if disabled/failed. Runtime still does intent-based filtering.
   */
  private async getLLMSuggestedBindings(
    prompt: string,
    upstreamKeys: string[],
    targetFieldNames: string[]
  ): Promise<Record<string, string> | null> {
    if (process.env.BUILD_TIME_LLM_KEY_SUGGESTION !== 'true' || upstreamKeys.length === 0 || targetFieldNames.length === 0) {
      return null;
    }
    try {
      const upStr = upstreamKeys.join(', ');
      const fieldsStr = targetFieldNames.join(', ');
      const userContent = `User intent/prompt: ${prompt.slice(0, 800)}

Upstream output keys (choose from these): ${upStr}
Target node input fields (map to these): ${fieldsStr}

Return a JSON object mapping each target field to exactly one upstream key. Example: {"field_a": "upstream_key_a", "field_b": "upstream_key_b"}. Use only keys from the upstream list. Output nothing but the JSON.`;
      const response = await this.llmAdapter.chat('gemini', [
        { role: 'system', content: 'You suggest which upstream JSON keys should feed which target input fields. Reply with only valid JSON.' },
        { role: 'user', content: userContent },
      ], {
        model: 'gemini-2.5-flash',
        apiKey: process.env.GEMINI_API_KEY,
        temperature: 0.2,
      });
      let jsonStr = response.content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
      }
      const parsed = JSON.parse(jsonStr) as Record<string, string>;
      const out: Record<string, string> = {};
      const upSet = new Set(upstreamKeys.map((k) => k.toLowerCase()));
      for (const [field, key] of Object.entries(parsed)) {
        if (typeof key === 'string' && targetFieldNames.includes(field) && upSet.has(key.toLowerCase())) {
          const exact = upstreamKeys.find((k) => k.toLowerCase() === key.toLowerCase());
          if (exact) out[field] = exact;
        }
      }
      return Object.keys(out).length > 0 ? out : null;
    } catch {
      return null;
    }
  }

  /**
   * Fill node configurations from prompt and data-flow (upstream output schema).
   * Processes nodes in topological order so downstream nodes see filled upstream config.
   */
  async fillConfigurationsFromPrompt(
    workflow: Workflow,
    enhancedPrompt: string,
    originalPrompt: string
  ): Promise<Workflow> {
    const order = this.getTopologicalOrder(workflow);
    const nodeMap = new Map<string, WorkflowNode>(workflow.nodes.map((n) => [n.id, n]));
    const updatedMap = new Map<string, WorkflowNode>();

    for (const nodeId of order) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const nodeType = node.data?.type || node.type;
      if (!nodeType || nodeType === 'custom') {
        updatedMap.set(nodeId, node);
        continue;
      }

      const schema = nodeLibrary.getSchema(nodeType);
      if (!schema) {
        updatedMap.set(nodeId, node);
        continue;
      }

      // Sequential fill: downstream config depends only on upstream. updatedMap holds already-filled nodes so getUpstreamOutputSchema sees only prior nodes.
      const upstreamSchema = this.getUpstreamOutputSchema(workflow, nodeId, updatedMap);

      const intelligentConfig = await this.analyzeAndFillConfig(
        node,
        nodeType,
        schema,
        enhancedPrompt,
        originalPrompt,
        workflow,
        upstreamSchema
      );

      const existingConfig = node.data?.config || {};
      const mergedConfig = { ...existingConfig, ...intelligentConfig };

      updatedMap.set(nodeId, {
        ...node,
        data: { ...node.data, config: mergedConfig },
      });
    }

    const updatedNodes = workflow.nodes.map((n) => updatedMap.get(n.id) ?? n);
    return { ...workflow, nodes: updatedNodes };
  }

  /** Topological order of node ids (sources before targets). */
  private getTopologicalOrder(workflow: Workflow): string[] {
    const ids = new Set<string>(workflow.nodes.map((n) => n.id));
    const inDegree: Record<string, number> = {};
    ids.forEach((id) => (inDegree[id] = 0));
    for (const e of workflow.edges || []) {
      const src = e.source ?? e.sourceHandle;
      const tgt = e.target ?? e.targetHandle;
      if (ids.has(src) && ids.has(tgt) && src !== tgt) inDegree[tgt] = (inDegree[tgt] || 0) + 1;
    }
    const queue = [...ids].filter((id) => inDegree[id] === 0);
    const order: string[] = [];
    while (queue.length) {
      const u = queue.shift()!;
      order.push(u);
      for (const e of workflow.edges || []) {
        if ((e.source ?? e.sourceHandle) !== u) continue;
        const t = e.target ?? e.targetHandle;
        if (!ids.has(t)) continue;
        inDegree[t]--;
        if (inDegree[t] === 0) queue.push(t);
      }
    }
    // Any remaining (e.g. cycles) append at end
    ids.forEach((id) => {
      if (!order.includes(id)) order.push(id);
    });
    return order;
  }

  /**
   * Effective output schema of the node(s) that feed into this node (main edge).
   * Uses already-filled node configs when provided (for topological fill). Enforces sequential fill: we never use config/schema from a node that has not yet been processed.
   */
  private getUpstreamOutputSchema(
    workflow: Workflow,
    nodeId: string,
    filledNodes?: Map<string, WorkflowNode>
  ): EffectiveOutputSchema | undefined {
    const edges = (workflow.edges || []).filter(
      (e: any) => (e.target ?? e.targetHandle) === nodeId && (e.type === 'main' || !e.type)
    );
    const nodeById = filledNodes ?? new Map(workflow.nodes.map((n) => [n.id, n]));
    const srcId = edges[0]?.source ?? edges[0]?.sourceHandle;
    if (!srcId) return undefined;
    const src = nodeById.get(srcId);
    if (!src) return undefined;
    const type = src.data?.type || src.type;
    const config = src.data?.config ?? {};
    return unifiedNodeRegistry.getEffectiveOutputSchema(type, config);
  }

  /**
   * Analyze prompt and upstream output schema to fill configuration for a specific node.
   *
   * fillMode gate (redesigned per spec task 2):
   * - SKIP manual_static fields unconditionally
   * - SKIP ownership === 'credential' fields unconditionally
   * - ONLY fill buildtime_ai_once fields
   *
   * After filling, writes _fieldModes metadata into `filled` by iterating inputSchema
   * and recording field.fillMode?.default ?? 'manual_static' for every field.
   */
  private async analyzeAndFillConfig(
    node: WorkflowNode,
    nodeType: string,
    schema: any,
    enhancedPrompt: string,
    originalPrompt: string,
    workflow: Workflow,
    upstreamSchema?: EffectiveOutputSchema
  ): Promise<Record<string, any>> {
    const existingConfig = node.data?.config || {};

    // ✅ Registry is single source of truth for "responsibility" (inputs).
    const def = unifiedNodeRegistry.get(nodeType);
    const inputSchema = def?.inputSchema ?? {};
    const requiredInputs = def?.requiredInputs ?? [];

    // No schema known → do nothing (avoid inventing fields).
    if (!def) return {};

    const prompt = `${enhancedPrompt || ''}\n\n${originalPrompt || ''}`.trim();

    // Branch-aware context: when this node is on a specific branch of an if_else,
    // append branch context to the prompt so the LLM can suggest branch-specific values.
    const branchTag: string | undefined = (node.data as any)?.meta?.branchTag;
    const branchAwarePrompt = branchTag
      ? `${prompt}\n\nBranch context: This node is on the ${branchTag} branch of an if_else condition.`
      : prompt;
    const upstreamKeys = Object.keys(upstreamSchema?.properties ?? {});

    // Use branch-aware prompt for LLM suggestions when branchTag is present
    const effectivePrompt = branchAwarePrompt;

    const mappingMetadata: Record<
      string,
      {
        selectedUpstreamKey?: string;
        candidateUpstreamKeys: string[];
        strategy: 'exact' | 'keyword' | 'prompt' | 'fallback' | 'none';
        confidence: number;
      }
    > = {};

    const filled: Record<string, any> = {};
    const expectedInputKeys: string[] = [];

    // Only attempt to bind fields that are missing/empty in existing config.
    const shouldFillField = (fieldName: string): boolean => {
      const v = (existingConfig as any)[fieldName];
      if (v === undefined || v === null) return true;
      if (typeof v === 'string' && v.trim() === '') return true;
      if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return true;
      return false;
    };

    // Choose upstream key for a given field using deterministic scoring.
    const chooseUpstreamKey = (fieldName: string): { key?: string; strategy: typeof mappingMetadata[string]['strategy']; confidence: number; candidates: string[] } => {
      if (upstreamKeys.length === 0) {
        return { key: undefined, strategy: 'none', confidence: 0, candidates: [] };
      }

      const fieldLower = fieldName.toLowerCase();
      const promptLower = effectivePrompt.toLowerCase();

      // 1) Exact match
      const exact = upstreamKeys.find((k) => k.toLowerCase() === fieldLower);
      if (exact) return { key: exact, strategy: 'exact', confidence: 0.98, candidates: [exact] };

      // 2) Universal name overlap: score by substring containment (no hardcoded field names).
      const overlapMatches: Array<{ k: string; score: number }> = [];
      for (const k of upstreamKeys) {
        const kl = k.toLowerCase();
        if (fieldLower.includes(kl) || kl.includes(fieldLower)) {
          const score = fieldLower === kl ? 0.95 : kl.length >= 2 && fieldLower.length >= 2 ? 0.85 : 0.6;
          overlapMatches.push({ k, score });
        }
      }
      if (overlapMatches.length > 0) {
        overlapMatches.sort((a, b) => b.score - a.score);
        const best = overlapMatches[0]!;
        const candidates = overlapMatches.slice(0, 5).map((m) => m.k);
        return { key: best.k, strategy: 'keyword', confidence: Math.min(0.92, best.score), candidates };
      }

      // 3) Prompt-based hint: prefer keys mentioned in the prompt (real-time prompt, any keys)
      const promptMentioned = upstreamKeys.filter((k) => promptLower.includes(k.toLowerCase()));
      if (promptMentioned.length > 0) {
        return { key: promptMentioned[0], strategy: 'prompt', confidence: 0.7, candidates: promptMentioned.slice(0, 5) };
      }

      // 4) Fallback: first available key
      return { key: upstreamKeys[0], strategy: 'fallback', confidence: 0.35, candidates: upstreamKeys.slice(0, 5) };
    };

    // Prefer required inputs, but also consider optional inputs if they look bindable.
    const candidateFields = [
      ...new Set([
        ...requiredInputs,
        ...Object.keys(inputSchema || {}),
      ]),
    ];

    // Optional: build-time LLM suggestion for field -> upstream key bindings (schema-only; runtime does intent filtering).
    const llmBindings = await this.getLLMSuggestedBindings(effectivePrompt, upstreamKeys, candidateFields);

    for (const fieldName of candidateFields) {
      const fieldDef = (inputSchema as Record<string, any>)[fieldName];
      const fillMode: string = fieldDef?.fillMode?.default ?? 'manual_static';
      const ownership: string | undefined = fieldDef?.ownership;

      // ── fillMode gate (spec task 2) ──────────────────────────────────────
      // Hard skip: manual_static and credential fields are never AI-filled at build time.
      if (fillMode === 'manual_static' || ownership === 'credential') continue;
      // Only fill buildtime_ai_once fields.
      if (fillMode !== 'buildtime_ai_once') continue;
      // ─────────────────────────────────────────────────────────────────────

      if (!shouldFillField(fieldName)) continue;

      const pick = llmBindings?.[fieldName]
        ? { key: llmBindings[fieldName], strategy: 'keyword' as const, confidence: 0.9, candidates: [llmBindings[fieldName]] }
        : chooseUpstreamKey(fieldName);
      mappingMetadata[fieldName] = {
        selectedUpstreamKey: pick.key,
        candidateUpstreamKeys: pick.candidates,
        strategy: pick.strategy,
        confidence: pick.confidence,
      };

      if (!pick.key) continue;

      // Empty-until-runtime: do NOT write template values into input fields here.
      // Fields stay empty; runtime fills them from actual previous node output (AI + guarantee).
      expectedInputKeys.push(pick.key);
    }

    // Attach metadata for downstream runtime (guarantee layer uses _mappingMetadata).
    if (Object.keys(mappingMetadata).length > 0) {
      filled._mappingMetadata = mappingMetadata;
    }
    if (expectedInputKeys.length > 0) {
      filled._expectedInputKeys = [...new Set(expectedInputKeys)];
    }

    // ── Write _fillMode metadata ──────────────────────────────────────────
    // Stamp _fillMode[fieldName] for every field so the UI toggle reflects the
    // correct mode. This is the canonical key read by PropertiesPanel.tsx.
    // Preserve any entries already written by a prior stage (e.g. property-population-stage.ts
    // which stamps 'buildtime_ai_once' for fields it fills, or user-set entries from the UI).
    // Priority: existingConfig._fillMode (prior stage) > filled._fillMode > registry default.
    const priorFillMode =
      typeof (existingConfig as any)._fillMode === 'object' && (existingConfig as any)._fillMode !== null
        ? { ...(existingConfig as any)._fillMode as Record<string, string> }
        : {} as Record<string, string>;
    const inFlightFillMode =
      typeof (filled as any)._fillMode === 'object' && (filled as any)._fillMode !== null
        ? { ...(filled as any)._fillMode as Record<string, string> }
        : {} as Record<string, string>;
    // Merge: start from registry defaults, then apply in-flight stamps, then prior stamps (highest priority)
    const existingFillMode: Record<string, string> = {};
    for (const [name, field] of Object.entries(inputSchema as Record<string, any>)) {
      existingFillMode[name] = (field as any)?.fillMode?.default ?? 'manual_static';
    }
    // In-flight stamps (from this run) override registry defaults
    for (const [name, mode] of Object.entries(inFlightFillMode)) {
      existingFillMode[name] = mode;
    }
    // Prior stage stamps (highest priority) override everything
    for (const [name, mode] of Object.entries(priorFillMode)) {
      existingFillMode[name] = mode;
    }
    filled._fillMode = existingFillMode;
    // Remove legacy key — UI reads _fillMode, not _fieldModes
    delete (filled as any)._fieldModes;
    // ─────────────────────────────────────────────────────────────────────

    return filled;
  }
}

export const intelligentConfigFiller = new IntelligentConfigFiller();
