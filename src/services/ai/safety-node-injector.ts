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
import { NodeMetadataHelper } from '../../core/types/node-metadata';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { resolveCompatibleHandles } from './schema-driven-connection-resolver';

export interface SafetyInjectionResult {
  workflow: Workflow;
  injectedNodeTypes: string[];
  warnings: string[];
}

function getType(node: WorkflowNode): string {
  return unifiedNormalizeNodeType(node) || node.data?.type || node.type || '';
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

/**
 * ✅ UNIVERSAL: Create edge using Universal Edge Creation Service
 * This ensures all edge creation follows consistent rules.
 */
function createEdge(
  source: WorkflowNode,
  target: WorkflowNode,
  existingEdges: WorkflowEdge[] = [],
  allNodes: WorkflowNode[] = [],
  edgeType?: string,
  sourceHandle?: string
): WorkflowEdge | null {
  const { universalEdgeCreationService } = require('../edges/universal-edge-creation-service');
  
  const result = universalEdgeCreationService.createEdge({
    sourceNode: source,
    targetNode: target,
    sourceHandle,
    edgeType,
    existingEdges,
    allNodes: allNodes.length > 0 ? allNodes : [source, target],
  });
  
  if (result.success && result.edge) {
    return result.edge;
  } else {
    console.warn(`[SafetyNodeInjector] ⚠️  Failed to create edge: ${result.error || result.reason}`);
    return null;
  }
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

  // ✅ ROOT-LEVEL UNIVERSAL FIX: Use standardized metadata system
  const hasAutoLimit = nodes.some(n => {
    const metadata = NodeMetadataHelper.getMetadata(n);
    return getType(n) === 'limit' && metadata?.injection?.autoInjected === true;
  });
  const hasAutoEmptyCheck = nodes.some(n => {
    const metadata = NodeMetadataHelper.getMetadata(n);
    return getType(n) === 'if_else' && metadata?.injection?.autoInjected === true;
  });

  // ✅ FIX 2: DSL-AWARE CHECK - Check if safety nodes already exist from DSL before injecting
  // This prevents duplicate injection when DSL compiler already created safety nodes
  const hasIfElseFromDSL = nodes.some(n => {
    const metadata = NodeMetadataHelper.getMetadata(n);
    return getType(n) === 'if_else' && metadata?.dsl?.dslId; // From DSL, not injection
  });

  const hasLimitFromDSL = nodes.some(n => {
    const metadata = NodeMetadataHelper.getMetadata(n);
    return getType(n) === 'limit' && metadata?.dsl?.dslId; // From DSL, not injection
  });

  // ✅ FIX 2: Skip injection if safety nodes already exist from DSL
  // DSL compiler now creates safety nodes in correct order, so we don't need to inject again
  if (hasIfElseFromDSL && hasLimitFromDSL) {
    console.log('[SafetyNodeInjector] ✅ Safety nodes (if_else, limit) already exist from DSL - skipping injection to prevent duplicates');
    return { workflow, injectedNodeTypes, warnings };
  }

  const aiNodes = nodes.filter(n => {
    const t = getType(n);
    return t === 'ai_chat_model' || t === 'ai_agent' || t === 'text_summarizer';
  });

  if (aiNodes.length === 0) {
    return { workflow, injectedNodeTypes, warnings };
  }

  // ✅ ROOT-LEVEL FIX: Only inject safety nodes if truly necessary
  // Check if user explicitly wants safety nodes or if data source produces arrays
  const promptLower = (userPrompt || '').toLowerCase();
  const wantsSafetyNodes = /\b(limit|safety|prevent|protect|max|top|first|empty check|validate)\b/i.test(promptLower);
  
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
    
    // ✅ CRITICAL FIX: Only inject if source produces arrays (google_sheets, database, etc.)
    // Don't inject for simple data sources that don't produce arrays
    const arrayProducingSources = ['google_sheets', 'airtable', 'notion', 'database', 'sql', 'postgres', 'mysql'];
    const sourceProducesArrays = arrayProducingSources.some(type => st.includes(type));
    
    // Only inject if source produces arrays OR user explicitly wants safety nodes
    return sourceProducesArrays || wantsSafetyNodes;
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

  // ✅ ROOT-LEVEL FIX: Check if source produces arrays before injecting safety nodes
  const sourceType = getType(sourceNode);
  const arrayProducingSources = ['google_sheets', 'airtable', 'notion', 'database', 'sql', 'postgres', 'mysql'];
  const sourceProducesArrays = arrayProducingSources.some(type => sourceType.includes(type));

  // Remove old edge; we'll rebuild below
  let newEdges = edges.filter(e => e.id !== edgeToSplit.id);
  let upstreamNode: WorkflowNode = sourceNode;

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

  // ✅ ROOT-LEVEL UNIVERSAL FIX: Use standardized metadata system
  const hasAutoSort = nodes.some(n => {
    const metadata = NodeMetadataHelper.getMetadata(n);
    return getType(n) === 'sort' && metadata?.injection?.autoInjected === true;
  });
  const hasAutoAggregate = nodes.some(n => {
    const metadata = NodeMetadataHelper.getMetadata(n);
    return getType(n) === 'aggregate' && metadata?.injection?.autoInjected === true;
  });

  // ✅ ROOT-LEVEL FIX: Only inject empty-check if user explicitly wants it or data source produces arrays
  // 1) Inject empty-check If/Else + Stop node unless already auto-injected
  // CRITICAL: must run BEFORE any transformations so condition checks raw rows/items from Google Sheets
  if (!hasAutoEmptyCheck && (wantsSafetyNodes || sourceProducesArrays)) {
    // ✅ ROOT-LEVEL UNIVERSAL FIX: Use standardized metadata system
    const ifNode = createNode('if_else', 'If items exist?', {
      // Use canonical JSON conditions format expected by backend schema/executor
      conditions: [{ expression: '{{$json.items.length}} > 0' }],
      combineOperation: 'AND',
      reason: 'Auto-inserted empty-check before AI',
    });
    NodeMetadataHelper.setMetadata(ifNode, {
      origin: {
        source: 'system',
        approach: 'safety_injection',
        stage: 'safety_injection',
      },
      injection: {
        autoInjected: true,
        reason: 'Auto-inserted empty-check before AI',
        priority: 1,
      },
    });
    
    const stopNode = createNode('stop_and_error', 'Stop (No data)', {
      errorMessage: 'No rows found in Google Sheets.',
      errorCode: 'EMPTY_INPUT',
    });
    NodeMetadataHelper.setMetadata(stopNode, {
      origin: {
        source: 'system',
        approach: 'safety_injection',
        stage: 'safety_injection',
      },
      injection: {
        autoInjected: true,
        reason: 'Auto-inserted stop node for empty data',
        priority: 1,
      },
    });

    // upstream -> if_else
    const edge1 = createEdge(upstreamNode, ifNode, workflow.edges, workflow.nodes);
    if (edge1) newEdges.push(edge1);

    // Build TRUE path safety chain: if_else(true) -> [limit] -> [sort?] -> [aggregate?] -> AI
    let trueUpstream: WorkflowNode = ifNode;

    // 1.1) Inject limit node (token safety) unless already auto-injected
    if (!hasAutoLimit) {
      const limitNode = createNode('limit', 'Limit', {
        limit: 50,
        reason: 'Auto-inserted safety limit before AI to prevent token overflow',
      });
      NodeMetadataHelper.setMetadata(limitNode, {
        origin: {
          source: 'system',
          approach: 'safety_injection',
          stage: 'safety_injection',
        },
        injection: {
          autoInjected: true,
          reason: 'Auto-inserted safety limit before AI to prevent token overflow',
          priority: 2,
        },
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
      });
      NodeMetadataHelper.setMetadata(sortNode, {
        origin: {
          source: 'system',
          approach: 'safety_injection',
          stage: 'safety_injection',
        },
        injection: {
          autoInjected: true,
          reason: 'Auto-inserted sort before AI due to prompt intent',
          priority: 3,
        },
      });
      const edge2 = createEdge(trueUpstream, sortNode, [...workflow.edges, ...newEdges], [...workflow.nodes, ...nodes]);
      if (edge2) newEdges.push(edge2);
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
      });
      NodeMetadataHelper.setMetadata(aggregateNode, {
        origin: {
          source: 'system',
          approach: 'safety_injection',
          stage: 'safety_injection',
        },
        injection: {
          autoInjected: true,
          reason: 'Auto-inserted aggregate before AI due to prompt intent',
          priority: 4,
        },
      });
      const edge3 = createEdge(trueUpstream, aggregateNode, [...workflow.edges, ...newEdges], [...workflow.nodes, ...nodes]);
      if (edge3) newEdges.push(edge3);
      trueUpstream = aggregateNode;
      nodes.push(aggregateNode);
      injectedNodeTypes.push('aggregate');
    }

    // trueUpstream -> AI
    const edge4 = createEdge(trueUpstream, targetNode, [...workflow.edges, ...newEdges], [...workflow.nodes, ...nodes]);
    if (edge4) newEdges.push(edge4);

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
    const edge5 = createEdge(upstreamNode, targetNode, [...workflow.edges, ...newEdges], [...workflow.nodes, ...nodes]);
    if (edge5) newEdges.push(edge5);
  }

  // --------------------------------------------
  // AI SUMMARIZATION → GMAIL AUTO-MAPPING (STRICT)
  // --------------------------------------------
  // ✅ UNIVERSAL FIX: AI Input Resolver will generate prompts dynamically at runtime
  // NO hardcoded prompts - AI will analyze previous node output and user intent
  // If the AI node is ai_chat_model, leave prompt empty - AI Input Resolver will fill it
  if (getType(targetNode) === 'ai_chat_model') {
    const cfg = (targetNode.data?.config || {}) as any;
    const needsPrompt = !cfg.prompt || String(cfg.prompt).trim() === '';
    if (needsPrompt) {
      // ✅ UNIVERSAL: Leave prompt empty - AI Input Resolver will generate it dynamically
      // based on previous node output (whatever it is - HTTP Request, Database, Webhook, etc.)
      // and user intent. No hardcoded assumptions about Google Sheets or any specific node.
      cfg.prompt = ''; // AI Input Resolver will fill this at runtime
      cfg.responseFormat = 'text'; // Default, can be overridden by AI Input Resolver
      // Use low temp for determinism
      if (cfg.temperature === undefined) cfg.temperature = 0.2;
      targetNode.data.config = cfg;
      injectedNodeTypes.push('ai_prompt');
      console.log(`[SafetyNodeInjector] ✅ AI Chat Model prompt will be generated dynamically by AI Input Resolver at runtime`);
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

