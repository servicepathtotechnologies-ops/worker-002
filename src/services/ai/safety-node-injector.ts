/**
 * Safety Node Injector
 *
 * Injects deterministic safety/utility nodes into an already-generated workflow graph.
 *
 * Current focus (high-signal, production-safe):
 * - Auto-insert `limit` between array-producing data sources (e.g., google_sheets) and AI nodes
 *   to reduce token-overflow risk and runaway costs.
 *
 * This runs AFTER minimal-workflow-policy, so injected nodes won't be pruned.
 */

import { randomUUID } from 'crypto';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { normalizeNodeType } from '../../core/utils/node-type-normalizer';
import { resolveCompatibleHandles } from './schema-driven-connection-resolver';

export interface SafetyInjectionResult {
  workflow: Workflow;
  injectedNodeTypes: string[];
  warnings: string[];
}

function getType(node: WorkflowNode): string {
  return normalizeNodeType(node) || node.data?.type || node.type || '';
}

function createNode(nodeType: string, label: string, config: Record<string, unknown>): WorkflowNode {
  const schema = nodeLibrary.getSchema(nodeType);
  return {
    id: randomUUID(),
    type: nodeType,
    position: { x: 0, y: 0 },
    data: {
      type: nodeType,
      label: schema?.label || label,
      category: schema?.category || 'logic',
      config,
    },
  };
}

function createEdge(source: WorkflowNode, target: WorkflowNode): WorkflowEdge {
  const res = resolveCompatibleHandles(source, target);
  return {
    id: randomUUID(),
    source: source.id,
    target: target.id,
    ...(res.success && res.sourceHandle ? { sourceHandle: res.sourceHandle } : {}),
    ...(res.success && res.targetHandle ? { targetHandle: res.targetHandle } : {}),
  };
}

/**
 * Inject safety nodes into the workflow graph.
 */
export function injectSafetyNodes(
  workflow: Workflow,
  userPrompt: string
): SafetyInjectionResult {
  const warnings: string[] = [];
  const injectedNodeTypes: string[] = [];

  const nodes = [...(workflow.nodes || [])];
  const edges = [...(workflow.edges || [])];

  const hasAutoLimit = nodes.some(n => getType(n) === 'limit' && (n.data?.config as any)?._autoInjected);
  const hasAutoEmptyCheck = nodes.some(n => getType(n) === 'if_else' && (n.data?.config as any)?._autoInjected);

  const aiNodes = nodes.filter(n => {
    const t = getType(n);
    return t === 'ai_chat_model' || t === 'ai_agent' || t === 'text_summarizer';
  });

  if (aiNodes.length === 0) {
    return { workflow, injectedNodeTypes, warnings };
  }

  // Find any direct edge * -> ai (data source to AI)
  const candidateEdges = edges.filter(e => {
    const src = nodes.find(n => n.id === e.source);
    const tgt = nodes.find(n => n.id === e.target);
    if (!src || !tgt) return false;
    const tt = getType(tgt);
    const isAI = tt === 'ai_chat_model' || tt === 'ai_agent' || tt === 'text_summarizer';
    if (!isAI) return false;
    // Don't inject when source is already a safety node
    const st = getType(src);
    if (['limit', 'if_else', 'aggregate', 'sort', 'wait', 'stop_and_error'].includes(st)) return false;
    return true;
  });

  let edgeToSplit = candidateEdges[0];
  if (!edgeToSplit) {
    // No direct edge; don't guess rewiring across multiple hops.
    warnings.push('Safety injector: found AI node(s), but no direct upstream edge to inject safety nodes.');
    return { workflow, injectedNodeTypes, warnings };
  }

  const sourceNode = nodes.find(n => n.id === edgeToSplit.source);
  const targetNode = nodes.find(n => n.id === edgeToSplit.target);
  if (!sourceNode || !targetNode) {
    return { workflow, injectedNodeTypes, warnings };
  }

  // Remove old edge; we'll rebuild below
  let newEdges = edges.filter(e => e.id !== edgeToSplit.id);
  let upstreamNode: WorkflowNode = sourceNode;

  const promptLower = (userPrompt || '').toLowerCase();
  const wantsSort = /\b(sort|order by|descending|ascending)\b/i.test(promptLower);
  // CRITICAL FIX: prevent false positives like "summarize" containing "sum"
  const wantsAggregate =
    /\baggregate\b/i.test(promptLower) ||
    /\bgroup\s+by\b/i.test(promptLower) ||
    /\btotal\b/i.test(promptLower) ||
    /\bsum\b/i.test(promptLower) ||
    /\bavg\b/i.test(promptLower) ||
    /\baverage\b/i.test(promptLower) ||
    /\bcount\b/i.test(promptLower);

  const hasAutoSort = nodes.some(n => getType(n) === 'sort' && (n.data?.config as any)?._autoInjected);
  const hasAutoAggregate = nodes.some(n => getType(n) === 'aggregate' && (n.data?.config as any)?._autoInjected);

  // 1) Inject empty-check If/Else + Stop node unless already auto-injected
  // CRITICAL: must run BEFORE any transformations so condition checks raw rows/items from Google Sheets
  if (!hasAutoEmptyCheck) {
    const ifNode = createNode('if_else', 'If items exist?', {
      // Use canonical JSON conditions format expected by backend schema/executor
      conditions: [{ expression: '{{$json.items.length}} > 0' }],
      combineOperation: 'AND',
      reason: 'Auto-inserted empty-check before AI',
      _autoInjected: true,
    });
    const stopNode = createNode('stop_and_error', 'Stop (No data)', {
      errorMessage: 'No rows found in Google Sheets.',
      errorCode: 'EMPTY_INPUT',
      _autoInjected: true,
    });

    // upstream -> if_else
    newEdges.push(createEdge(upstreamNode, ifNode));

    // Build TRUE path safety chain: if_else(true) -> [limit] -> [sort?] -> [aggregate?] -> AI
    let trueUpstream: WorkflowNode = ifNode;

    // 1.1) Inject limit node (token safety) unless already auto-injected
    if (!hasAutoLimit) {
      const limitNode = createNode('limit', 'Limit', {
        limit: 50,
        reason: 'Auto-inserted safety limit before AI to prevent token overflow',
        _autoInjected: true,
      });
      {
        const res = resolveCompatibleHandles(ifNode, limitNode);
        newEdges.push({
          id: randomUUID(),
          source: ifNode.id,
          target: limitNode.id,
          sourceHandle: 'true',
          ...(res.success && res.targetHandle ? { targetHandle: res.targetHandle } : {}),
        });
      }
      trueUpstream = limitNode;
      nodes.push(limitNode);
      injectedNodeTypes.push('limit');
    } else {
      // if_else true -> target (AI) will be connected later from trueUpstream
    }

    // 1.2) Optional sort before AI if prompt implies ordering
    if (wantsSort && !hasAutoSort) {
      const sortNode = createNode('sort', 'Sort', {
        field: '',
        direction: 'asc',
        type: 'auto',
        reason: 'Auto-inserted sort before AI due to prompt intent',
        _autoInjected: true,
      });
      newEdges.push(createEdge(trueUpstream, sortNode));
      trueUpstream = sortNode;
      nodes.push(sortNode);
      injectedNodeTypes.push('sort');
    }

    // 1.3) Optional aggregate (join) before AI if prompt implies aggregation of items into text
    if (wantsAggregate && !hasAutoAggregate) {
      const aggregateNode = createNode('aggregate', 'Aggregate', {
        operation: 'join',
        field: '',
        delimiter: '\n',
        reason: 'Auto-inserted aggregate before AI due to prompt intent',
        _autoInjected: true,
      });
      newEdges.push(createEdge(trueUpstream, aggregateNode));
      trueUpstream = aggregateNode;
      nodes.push(aggregateNode);
      injectedNodeTypes.push('aggregate');
    }

    // trueUpstream -> AI
    newEdges.push(createEdge(trueUpstream, targetNode));

    // if_else false -> stop_and_error
    {
      const res = resolveCompatibleHandles(ifNode, stopNode);
      newEdges.push({
        id: randomUUID(),
        source: ifNode.id,
        target: stopNode.id,
        sourceHandle: 'false',
        ...(res.success && res.targetHandle ? { targetHandle: res.targetHandle } : {}),
      });
    }

    nodes.push(ifNode, stopNode);
    injectedNodeTypes.push('if_else', 'stop_and_error');
  } else {
    // If empty-check already exists, connect upstream directly to target.
    newEdges.push(createEdge(upstreamNode, targetNode));
  }

  // --------------------------------------------
  // AI SUMMARIZATION → GMAIL AUTO-MAPPING (STRICT)
  // --------------------------------------------
  // If the AI node is ai_chat_model, enforce a fully-defined JSON prompt and response format.
  if (getType(targetNode) === 'ai_chat_model') {
    const cfg = (targetNode.data?.config || {}) as any;
    const needsPrompt = !cfg.prompt || String(cfg.prompt).trim() === '';
    if (needsPrompt) {
      cfg.systemPrompt = `You are an intelligent email content generator that analyzes data and creates well-structured, informative email content.`;
      cfg.prompt =
`Analyze the following spreadsheet data and generate a comprehensive, well-structured email response.

Data:\n{{google_sheets.items}}\n\nReturn output strictly in this JSON format:\n{\n  \"subject\": \"concise, informative email subject line\",\n  \"body\": \"professional email body with clear paragraphs and formatting\",\n  \"summary\": \"brief executive summary of the data\",\n  \"keyPoints\": [\"key point 1\", \"key point 2\", \"key point 3\"],\n  \"insights\": \"important insights or patterns discovered in the data\",\n  \"actionItems\": [\"action item 1\", \"action item 2\"],\n  \"metadata\": {\n    \"dataSource\": \"Google Sheets\",\n    \"rowCount\": number_of_rows,\n    \"analysisDate\": \"current date\"\n  }\n}\n\nRules:\n- Subject: Must be concise (max 60 characters), informative, and action-oriented\n- Body: Must be well-formatted with paragraphs, use professional tone, include all important information\n- Summary: Brief 2-3 sentence overview of the data\n- KeyPoints: Array of 3-5 most important points extracted from the data\n- Insights: Detailed analysis of patterns, trends, or notable findings\n- ActionItems: Array of recommended next steps or actions (if applicable)\n- Metadata: Additional context about the data source and analysis\n- All fields are required - provide meaningful content for each\n- Output ONLY valid JSON - no explanations, no markdown, no code blocks`;
      cfg.responseFormat = 'json';
      // Use low temp for determinism
      if (cfg.temperature === undefined) cfg.temperature = 0.2;
      targetNode.data.config = cfg;
      injectedNodeTypes.push('ai_prompt');
    }
  }

  // If there is a Gmail node directly downstream of this AI node, map subject/body from AI JSON response.
  // Keep "to" empty so it remains a user-provided configuration input (NOT a credential).
  const aiToGmailEdge = newEdges.find(e => e.source === targetNode.id && nodes.some(n => n.id === e.target && getType(n) === 'google_gmail'));
  if (aiToGmailEdge) {
    const gmailNode = nodes.find(n => n.id === aiToGmailEdge.target) || null;
    if (gmailNode) {
      const gcfg = (gmailNode.data?.config || {}) as any;
      if (!gcfg.subject) gcfg.subject = '{{input.response.subject}}';
      if (!gcfg.body) gcfg.body = '{{input.response.body}}';
      // Ensure operation is send (UI uses send/list/get/search; backend supports send semantics)
      if (!gcfg.operation) gcfg.operation = 'send';
      gmailNode.data.config = gcfg;
      injectedNodeTypes.push('gmail_mapping');
    }
  }

  return {
    workflow: {
      ...workflow,
      nodes,
      edges: newEdges,
    },
    injectedNodeTypes,
    warnings,
  };
}

