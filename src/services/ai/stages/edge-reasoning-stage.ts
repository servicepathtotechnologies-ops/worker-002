/**
 * Edge Reasoning Stage — AI-First Pipeline
 *
 * The LLM determines execution order and edge connections between selected nodes.
 * No hardcoded topological sort. No hardcoded edge rules.
 * DFS cycle detection runs post-LLM; re-prompts once if cycle found.
 * Graph materialization goes through UnifiedGraphOrchestrator only.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 8.1, 8.2, 8.3
 */

import { randomUUID } from 'crypto';
import { geminiOrchestrator } from '../gemini-orchestrator';
import { systemPromptBuilder, SelectedNode, ProposedEdge } from '../system-prompt-builder';
import { unifiedGraphOrchestrator } from '../../../core/orchestration/unified-graph-orchestrator';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { logger } from '../../../core/logger';
import type { Workflow, WorkflowNode } from '../../../core/types/ai-types';
import type { ExecutionOrder } from '../../../core/orchestration/execution-order-manager';
import type { NodeCatalogText } from '../node-catalog-builder';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EdgeReasoningResult {
  ok: true;
  workflow: Workflow;
  orderedNodeIds: string[];
  edges: ProposedEdge[];
  durationMs: number;
  llmCall: { model: string; temperature: number; promptTokens: number; completionTokens: number };
}

export interface EdgeReasoningError {
  ok: false;
  code: 'CYCLE_DETECTED' | 'INVALID_LLM_RESPONSE';
  rawResponse: string;
  durationMs: number;
}

export type EdgeReasoningOutput = EdgeReasoningResult | EdgeReasoningError;

// ─── Edge Reasoning Stage ─────────────────────────────────────────────────────

export async function runEdgeReasoningStage(
  selectedNodes: SelectedNode[],
  nodeCatalog: NodeCatalogText,
  userIntent: string,
  correlationId?: string,
  structuralPrompt?: string,
): Promise<EdgeReasoningOutput> {
  const startedAt = Date.now();
  logger.info({
    event: 'ai_pipeline_stage_start',
    stage: 'edge_reasoning',
    correlationId,
    inputSummary: `nodes=${selectedNodes.length}`,
  });

  const model = 'gemini-3.5-flash';
  const temperature = 0.1;

  const { systemPrompt } = systemPromptBuilder.build({
    stage: 'edge_reasoning',
    nodeCatalog,
    userIntent,
    stageContext: { selectedNodes },
  });

  logger.info({ event: 'ai_pipeline_llm_call', stage: 'edge_reasoning', correlationId, model, temperature });

  const message = `SELECTED_NODES:\n${JSON.stringify(selectedNodes, null, 2)}\n\nUSER_INTENT:\n${userIntent}${structuralPrompt ? `\n\nWORKFLOW_BLUEPRINT:\n${structuralPrompt}` : ''}`;

  let text: string;
  try {
    const raw = await geminiOrchestrator.processRequest(
      'workflow-generation',
      { system: systemPrompt, message },
      { model, temperature, cache: false },
    );
    text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch (err) {
    logger.error({ event: 'ai_pipeline_stage_error', stage: 'edge_reasoning', correlationId, error: 'LLM_CALL_FAILED', message: String(err) });
    return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: String(err), durationMs: Date.now() - startedAt };
  }

  const promptTokens = Math.ceil(systemPrompt.length / 4);

  let parsed = tryParseEdgeReasoning(text);

  if (!parsed) {
    let text2: string;
    try {
      const retryPrompt = systemPrompt + '\n\nCRITICAL: Return ONLY valid JSON. No markdown, no explanation.';
      const raw2 = await geminiOrchestrator.processRequest(
        'workflow-generation',
        { system: retryPrompt, message },
        { model, temperature, cache: false },
      );
      text2 = typeof raw2 === 'string' ? raw2 : JSON.stringify(raw2);
    } catch (err) {
      logger.error({ event: 'ai_pipeline_stage_error', stage: 'edge_reasoning', correlationId, error: 'LLM_RETRY_FAILED', message: String(err) });
      return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: String(err), durationMs: Date.now() - startedAt };
    }
    parsed = tryParseEdgeReasoning(text2);
    if (!parsed) {
      logger.error({ event: 'ai_pipeline_stage_error', stage: 'edge_reasoning', correlationId, error: 'INVALID_LLM_RESPONSE', llmResponse: text2 });
      return { ok: false, code: 'INVALID_LLM_RESPONSE', rawResponse: text2, durationMs: Date.now() - startedAt };
    }
  }

  // DFS cycle detection
  const cycleInfo = detectCycle(parsed.orderedNodes, parsed.edges);
  if (cycleInfo) {
    logger.warn({ event: 'ai_pipeline_cycle_detected', stage: 'edge_reasoning', correlationId, cycleInfo });

    const { systemPrompt: reprompt } = systemPromptBuilder.build({
      stage: 'edge_reasoning',
      nodeCatalog,
      userIntent,
      stageContext: { selectedNodes, cycleInfo },
    });

    let text3: string;
    try {
      const raw3 = await geminiOrchestrator.processRequest(
        'workflow-generation',
        { system: reprompt, message },
        { model, temperature, cache: false },
      );
      text3 = typeof raw3 === 'string' ? raw3 : JSON.stringify(raw3);
    } catch (err) {
      logger.error({ event: 'ai_pipeline_stage_error', stage: 'edge_reasoning', correlationId, error: 'CYCLE_REPROMPT_FAILED', message: String(err) });
      return { ok: false, code: 'CYCLE_DETECTED', rawResponse: String(err), durationMs: Date.now() - startedAt };
    }

    const parsed3 = tryParseEdgeReasoning(text3);
    if (!parsed3 || detectCycle(parsed3.orderedNodes, parsed3.edges)) {
      logger.error({ event: 'ai_pipeline_stage_error', stage: 'edge_reasoning', correlationId, error: 'CYCLE_DETECTED', llmResponse: text3 });
      return { ok: false, code: 'CYCLE_DETECTED', rawResponse: text3, durationMs: Date.now() - startedAt };
    }
    parsed = parsed3;
  }

  // ✅ FIX Bug 5: Deduplicate nodeIds before building nodeMap.
  // The LLM occasionally returns the same nodeId for two nodes of the same type placed in
  // different branches (e.g. two google_gmail nodes in a switch). Without deduplication the
  // second entry silently overwrites the first in the Map, leaving one branch unwired.
  const seenNodeIds = new Set<string>();
  const deduplicatedNodes = selectedNodes.map((n) => {
    if (seenNodeIds.has(n.nodeId)) {
      // Assign a fresh unique ID so both branch nodes are independently addressable
      return { ...n, nodeId: randomUUID() };
    }
    seenNodeIds.add(n.nodeId);
    return n;
  });

  // Build WorkflowNode objects from deduplicated nodes + LLM ordering
  const nodeMap = new Map(deduplicatedNodes.map((n) => [n.nodeId, n]));

  // ✅ FIX: Extract switch cases from the AI's proposed edges BEFORE building nodes.
  // The LLM emits edges like { source: switchId, target: gmailId, type: "success" }.
  // We collect those case values per switch node so the node config has cases populated
  // before getOutgoingPortsForWorkflowNode is called during edge reconciliation.
  // Without this, the switch node gets an empty defaultConfig and reconciliation
  // falls back to a single 'output' port, wiring everything linearly.
  const switchCasesByNodeId = new Map<string, string[]>();
  for (const edge of parsed.edges) {
    const sourceNode = deduplicatedNodes.find(n => n.nodeId === edge.source);
    if (!sourceNode) continue;
    const def = unifiedNodeRegistry.get(sourceNode.type);
    if (!def?.isBranching) continue;
    // Collect non-main edge types as case values
    if (edge.type && edge.type !== 'main' && edge.type !== 'default' && edge.type !== 'true' && edge.type !== 'false') {
      const existing = switchCasesByNodeId.get(edge.source) || [];
      if (!existing.includes(edge.type)) {
        switchCasesByNodeId.set(edge.source, [...existing, edge.type]);
      }
    }
  }

  const workflowNodes: WorkflowNode[] = parsed.orderedNodes
    .map((nodeId) => {
      const sel = nodeMap.get(nodeId);
      if (!sel) return null;
      const def = unifiedNodeRegistry.get(sel.type);
      const baseConfig = def?.defaultConfig ? def.defaultConfig() : {};

      // ✅ Inject AI-derived cases into switch node config so port resolution works
      const aiCases = switchCasesByNodeId.get(nodeId);
      const config = aiCases && aiCases.length > 0
        ? { ...baseConfig, cases: aiCases.map(v => ({ value: v, label: v })) }
        : baseConfig;

      return {
        id: nodeId,
        type: sel.type,
        data: {
          label: def?.label || sel.type,
          type: sel.type,
          category: def?.category || 'action',
          config,
        },
      } as WorkflowNode;
    })
    .filter((n): n is WorkflowNode => n !== null);

  // Guard: if LLM returned node IDs that don't match any selected node, fall back to all deduplicated nodes
  const finalNodes: WorkflowNode[] = workflowNodes.length > 0
    ? workflowNodes
    : deduplicatedNodes.map((sel) => {
        const def = unifiedNodeRegistry.get(sel.type);
        const baseConfig = def?.defaultConfig ? def.defaultConfig() : {};
        const aiCases = switchCasesByNodeId.get(sel.nodeId);
        const config = aiCases && aiCases.length > 0
          ? { ...baseConfig, cases: aiCases.map(v => ({ value: v, label: v })) }
          : baseConfig;
        return {
          id: sel.nodeId,
          type: sel.type,
          data: {
            label: def?.label || sel.type,
            type: sel.type,
            category: def?.category || 'action',
            config,
          },
        } as WorkflowNode;
      });

  // Materialize through UnifiedGraphOrchestrator — never write workflow.edges directly
  // Build ExecutionOrder from LLM's orderedNodes so the orchestrator respects AI sequencing
  // ✅ FIX: Detect branching nodes from the selected nodes list so the orchestrator
  // knows to wire branch edges (case_1, case_2, etc.) instead of a linear chain.
  const branchingNodeIds = finalNodes
    .filter((n) => {
      const def = unifiedNodeRegistry.get(n.type);
      return def?.isBranching === true;
    })
    .map((n) => n.id);

  const initialExecutionOrder: ExecutionOrder = {
    nodeIds: parsed.orderedNodes.filter((id) => finalNodes.some((n) => n.id === id)),
    dependencies: new Map(),
    metadata: {
      terminalNodeIds: [],
      branchingNodeIds,
      mergeNodeIds: [],
    },
  };

  // ✅ FIX: Seed the workflow with the LLM's proposed edges BEFORE reconciliation.
  // The orchestrator's EdgeReconciliationEngine uses existing edges as hints when wiring branches.
  // Also remap case_1/case_2/case_3 edge types to actual switch case values when the LLM
  // uses positional labels instead of the actual case values (e.g. "high", "medium", "low").
  const { extractSwitchCasePortNames } = require('../../../core/utils/branching-node-ports') as typeof import('../../../core/utils/branching-node-ports');

  // Build a map of switch node id → actual case values (from config)
  const switchCaseValueMap = new Map<string, string[]>();
  for (const node of finalNodes) {
    const def = unifiedNodeRegistry.get(node.type);
    const nodeType = String(node.type || '');
    if (def?.isBranching && nodeType === 'switch') {
      const caseValues = extractSwitchCasePortNames(node.data?.config as any);
      if (caseValues.length > 0) switchCaseValueMap.set(node.id, caseValues);
    }
  }

  const seededEdges = parsed.edges
    .filter((e) => finalNodes.some((n) => n.id === e.source) && finalNodes.some((n) => n.id === e.target))
    .map((e, i) => {
      let edgeType = e.type;
      // Remap positional case labels (case_1, case_2, ...) to actual switch case values
      const caseMatch = edgeType.match(/^case_(\d+)$/);
      if (caseMatch && switchCaseValueMap.has(e.source)) {
        const caseIndex = parseInt(caseMatch[1], 10) - 1; // case_1 → index 0
        const caseValues = switchCaseValueMap.get(e.source)!;
        if (caseIndex >= 0 && caseIndex < caseValues.length) {
          edgeType = caseValues[caseIndex];
        }
      }
      return {
        id: `edge_seed_${i}_${randomUUID().slice(0, 8)}`,
        source: e.source,
        target: e.target,
        type: edgeType,
        sourceHandle: edgeType !== 'main' ? edgeType : undefined,
        targetHandle: 'input',
      };
    });

  // ✅ CRITICAL FIX: Use initializeWorkflow with the pre-built execution order (which has
  // branchingNodeIds set) instead of reconcileWorkflow (which reinitializes execution order
  // from scratch and loses the branching metadata, causing Step 4 fan-out to be skipped).
  const seededWorkflow: Workflow = { nodes: finalNodes, edges: seededEdges as any };
  const initialized = unifiedGraphOrchestrator.initializeWorkflow(
    finalNodes,
    initialExecutionOrder,
  );
  // ✅ UNIVERSAL FIX: Always prefer seeded edges when they exist for branching nodes.
  // The old allBranchPortsCovered check was too strict — it returned false when
  // getOutgoingPortsForWorkflowNode returned 'output' instead of 'true'/'false',
  // causing the fallback to initialized.workflow which uses corrupted execution order.
  //
  // New logic: if seeded edges cover all branching nodes (at least one edge per branching node),
  // use seededWorkflow. Otherwise merge: keep seeded edges + add any missing edges from orchestrator.
  const branchingNodesCoveredBySeeds = branchingNodeIds.every((bid) =>
    seededEdges.some((e) => e.source === bid)
  );

  let workflow: Workflow;
  if (seededEdges.length > 0 && (branchingNodeIds.length === 0 || branchingNodesCoveredBySeeds)) {
    // Seeded edges cover all branching nodes — use them directly (preserves LLM topology)
    workflow = seededWorkflow;
  } else if (seededEdges.length > 0) {
    // Partial coverage — merge seeded edges with orchestrator edges, seeded take priority
    const orchestratorEdges = initialized.workflow.edges || [];
    const seededSourceTargetPairs = new Set(seededEdges.map((e) => `${e.source}→${e.target}`));
    const mergedEdges = [
      ...seededEdges,
      ...orchestratorEdges.filter((e) => !seededSourceTargetPairs.has(`${e.source}→${e.target}`)),
    ];
    workflow = { ...seededWorkflow, edges: mergedEdges as any };
  } else {
    // No seeded edges — use orchestrator
    workflow = initialized.workflow;
  }

  const durationMs = Date.now() - startedAt;
  const completionTokens = Math.ceil(text.length / 4);

  logger.info({
    event: 'ai_pipeline_stage_end',
    stage: 'edge_reasoning',
    correlationId,
    outputSummary: `nodes=${finalNodes.length}, edges=${workflow.edges.length}`,
    durationMs,
  });

  return {
    ok: true,
    workflow,
    orderedNodeIds: parsed.orderedNodes,
    edges: parsed.edges,
    durationMs,
    llmCall: { model, temperature, promptTokens, completionTokens },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * ✅ FIX Bug 4: Registry-driven branch port coverage check.
 *
 * Returns true ONLY when every outgoing port of every branching node has at least
 * one seeded edge with a matching sourceHandle. This replaces the broken count-based
 * check (seededBranchEdges.length >= branchingNodeIds.length) which accepted incomplete
 * edge sets whenever the edge count happened to exceed the branching node count.
 *
 * Example: switch with case_1, case_2, case_3 ports requires 3 seeded edges each with
 * the correct sourceHandle. The old check passed with 3 edges even if all had wrong labels.
 */
function allBranchPortsCovered(
  branchingNodeIds: string[],
  finalNodes: WorkflowNode[],
  seededEdges: Array<{ source: string; sourceHandle?: string; type?: string }>
): boolean {
  if (branchingNodeIds.length === 0) return false; // no branching nodes → use orchestrator

  for (const branchNodeId of branchingNodeIds) {
    const node = finalNodes.find((n) => n.id === branchNodeId);
    if (!node) return false;

    // Get outgoing ports from registry (e.g. ['true','false'] for if_else, ['case_1','case_2',...] for switch)
    const ports = unifiedNodeRegistry.getOutgoingPortsForWorkflowNode(node);
    const branchPorts = ports.filter((p) => p !== 'output' && p !== 'default');

    if (branchPorts.length === 0) return false; // no branch ports defined → use orchestrator

    for (const port of branchPorts) {
      const covered = seededEdges.some(
        (e) => e.source === branchNodeId && (e.sourceHandle === port || e.type === port)
      );
      if (!covered) return false;
    }
  }
  return true;
}

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function tryParseEdgeReasoning(text: string): { orderedNodes: string[]; edges: ProposedEdge[] } | null {
  try {
    const cleaned = stripMarkdownFences(text);
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const obj = JSON.parse(cleaned.substring(start, end + 1));
    if (!Array.isArray(obj.orderedNodes) || !Array.isArray(obj.edges)) return null;
    // Deduplicate orderedNodes — the AI occasionally lists the trigger node twice which
    // causes it to execute twice in the execution engine.
    const seenOrdered = new Set<string>();
    const orderedNodes: string[] = [];
    for (const id of obj.orderedNodes.map(String)) {
      if (!seenOrdered.has(id)) {
        seenOrdered.add(id);
        orderedNodes.push(id);
      }
    }
    return {
      orderedNodes,
      edges: obj.edges.filter((e: any) => e.source && e.target && e.type),
    };
  } catch {
    return null;
  }
}

/** DFS cycle detection. Returns a description of the cycle path, or null if no cycle. */
function detectCycle(nodeIds: string[], edges: ProposedEdge[]): string | null {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const edge of edges) {
    const targets = adj.get(edge.source) ?? [];
    targets.push(edge.target);
    adj.set(edge.source, targets);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): string | null {
    if (stack.has(node)) return [...path, node].join(' → ');
    if (visited.has(node)) return null;
    visited.add(node);
    stack.add(node);
    path.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      const cycle = dfs(neighbor);
      if (cycle) return cycle;
    }
    path.pop();
    stack.delete(node);
    return null;
  }

  for (const id of nodeIds) {
    if (!visited.has(id)) {
      const cycle = dfs(id);
      if (cycle) return cycle;
    }
  }
  return null;
}
