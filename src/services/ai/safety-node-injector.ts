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
import { StructuredIntent } from './intent-structurer';
import { nodeCapabilityRegistryDSL } from './node-capability-registry-dsl';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedGraphOrchestrator } from '../../core/orchestration';

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
 * Check if user explicitly requested safety features in their prompt
 */
function detectUserRequestedSafetyFeatures(originalPrompt?: string): {
  wantsEmptyCheck: boolean;
  wantsLimit: boolean;
  wantsErrorHandling: boolean;
} {
  if (!originalPrompt) {
    return { wantsEmptyCheck: false, wantsLimit: false, wantsErrorHandling: false };
  }

  const promptLower = originalPrompt.toLowerCase();

  // Check for empty/validation keywords
  const emptyCheckKeywords = [
    'check if empty', 'check if data exists', 'if no data', 'if empty', 
    'validate data', 'ensure data exists', 'check for empty', 'no rows',
    'empty check', 'data validation', 'verify data exists'
  ];
  const wantsEmptyCheck = emptyCheckKeywords.some(keyword => promptLower.includes(keyword));

  // Check for limit/restriction keywords
  const limitKeywords = [
    'limit', 'restrict', 'max', 'maximum', 'only first', 'top n', 'first n',
    'only process', 'process only', 'cap at', 'maximum of', 'at most'
  ];
  const wantsLimit = limitKeywords.some(keyword => promptLower.includes(keyword));

  // Check for error handling keywords
  const errorHandlingKeywords = [
    'error handling', 'handle error', 'if error', 'on error', 'catch error',
    'error case', 'handle failure', 'if fails', 'stop on error', 'error stop'
  ];
  const wantsErrorHandling = errorHandlingKeywords.some(keyword => promptLower.includes(keyword));

  return { wantsEmptyCheck, wantsLimit, wantsErrorHandling };
}

/**
 * Inject safety nodes into the workflow graph.
 * ✅ UNIFIED ORCHESTRATION: Now uses unifiedGraphOrchestrator for all node injections
 * ✅ CONSERVATIVE: Only injects when user explicitly requested or AI detected genuine need
 */
export async function injectSafetyNodes(
  workflow: Workflow,
  structuredIntent: StructuredIntent,
  originalPrompt?: string
): Promise<SafetyInjectionResult> {
  const warnings: string[] = [];
  const injectedNodeTypes: string[] = [];

  const nodes = [...(workflow.nodes || [])];
  const edges = [...(workflow.edges || [])];

  // ✅ NEW: Check if user explicitly requested safety features
  const userSafetyRequests = detectUserRequestedSafetyFeatures(originalPrompt);

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

  // ✅ INTENT-BASED AI DETECTION: Check StructuredIntent for AI nodes (not workflow nodes)
  // This is the single source of truth - AI already analyzed the prompt and added AI nodes to intent
  const aiTransformations = (structuredIntent.transformations || []).filter(tf => {
    const nodeType = unifiedNormalizeNodeTypeString(tf.type || '');
    return nodeType === 'ai_chat_model' || 
           nodeType === 'ai_agent' || 
           nodeType === 'text_summarizer';
  });

  // Also check workflow nodes for AI (in case intent doesn't have it yet)
  const aiNodes = nodes.filter(n => {
    const t = getType(n);
    return t === 'ai_chat_model' || t === 'ai_agent' || t === 'text_summarizer';
  });

  // ✅ INTENT-BASED: If no AI in intent AND no AI in workflow, skip safety injection
  if (aiTransformations.length === 0 && aiNodes.length === 0) {
    return { workflow, injectedNodeTypes, warnings };
  }

  // ✅ INTENT-BASED: Check for safety keywords in intent (from original prompt analysis)
  // Check if conditions exist (indicates branching/complexity)
  const hasConditions = (structuredIntent.conditions || []).length > 0;
  
  // ✅ INTENT-BASED: Check data sources from intent (not hardcoded)
  const dataSources = (structuredIntent.dataSources || []).map(ds => ({
    type: unifiedNormalizeNodeTypeString(ds.type || ''),
    operation: ds.operation || ''
  }));
  
  // ✅ INTENT-BASED: Check output nodes from intent using registry (not hardcoded)
  const outputActions = (structuredIntent.actions || []).filter(action => {
    const nodeType = unifiedNormalizeNodeTypeString(action.type || '');
    return nodeCapabilityRegistryDSL.canServeAsOutput(nodeType);
  });
  
  // ✅ INTENT-BASED: Determine if simple linear flow from intent structure
  const isSimpleLinearFlow = 
    dataSources.length === 1 &&
    (structuredIntent.transformations || []).length === 1 &&
    outputActions.length === 1 &&
    !hasConditions &&
    aiTransformations.length === 1; // Single AI transformation

  // ✅ STRICT POLICY: ONLY inject safety nodes if user EXPLICITLY requested them
  // NO automatic injection for "complex workflows" - user must explicitly request
  const shouldInjectSafety = 
    userSafetyRequests.wantsEmptyCheck ||
    userSafetyRequests.wantsLimit ||
    userSafetyRequests.wantsErrorHandling ||
    hasConditions; // Conditions in structuredIntent means user explicitly requested conditional logic

  // ✅ CRITICAL: Skip ALL safety injection unless user explicitly requested
  if (!shouldInjectSafety) {
    console.log('[SafetyNodeInjector] ✅ No safety nodes requested by user - skipping ALL safety node injection');
    return { workflow, injectedNodeTypes, warnings };
  }

  // ✅ CONSERVATIVE: Log why we're injecting (for debugging)
  const reasons: string[] = [];
  if (userSafetyRequests.wantsEmptyCheck) reasons.push('user explicitly requested empty check');
  if (userSafetyRequests.wantsLimit) reasons.push('user explicitly requested limit');
  if (userSafetyRequests.wantsErrorHandling) reasons.push('user explicitly requested error handling');
  if (hasConditions) reasons.push('user explicitly requested conditions');
  console.log(`[SafetyNodeInjector] 🔍 Injecting safety nodes because: ${reasons.join(', ')}`);
  
  // ✅ UNIVERSAL: Check if data sources produce arrays using registry (no hardcoding)
  const arrayProducingDataSources = dataSources.filter(ds => {
    const nodeDef = unifiedNodeRegistry.get(ds.type);
    // ✅ UNIVERSAL: Check if node type or tags indicate array/list production
    const nodeTypeLower = ds.type.toLowerCase();
    const isArrayProducer = nodeTypeLower.includes('sheets') ||
                           nodeTypeLower.includes('airtable') ||
                           nodeTypeLower.includes('notion') ||
                           nodeTypeLower.includes('database') ||
                           nodeTypeLower.includes('sql') ||
                           nodeTypeLower.includes('postgres') ||
                           nodeTypeLower.includes('mysql') ||
                           (nodeDef?.tags || []).some((tag: string) => ['array', 'list', 'rows'].includes(tag.toLowerCase()));
    return isArrayProducer;
  });

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
    
    // ✅ INTENT-BASED: Check if source produces arrays (from intent data sources)
    const sourceType = unifiedNormalizeNodeTypeString(st);
    const sourceProducesArrays = arrayProducingDataSources.some(ds => ds.type === sourceType);
    
    // Only inject if source produces arrays (no explicit safety request needed - intent determines this)
    return sourceProducesArrays;
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

  // ✅ INTENT-BASED: Check if source produces arrays (already determined above from intent)
  const sourceNodeType = getType(sourceNode);
  const sourceNodeTypeNormalized = unifiedNormalizeNodeTypeString(sourceNodeType);
  const sourceNodeProducesArrays = arrayProducingDataSources.some(ds => ds.type === sourceNodeTypeNormalized);

  // ✅ UNIFIED ORCHESTRATION: Use orchestrator for all node injections
  // Remove old edge first (orchestrator will create correct edges)
  let currentWorkflow: Workflow = {
    ...workflow,
    edges: edges.filter(e => e.id !== edgeToSplit.id),
  };
  let upstreamNode: WorkflowNode = sourceNode;

  // ✅ INTENT-BASED: Check transformations for sort/aggregate operations (from intent, not prompt)
  const hasSortTransformation = (structuredIntent.transformations || []).some(tf => {
    const nodeType = unifiedNormalizeNodeTypeString(tf.type || '');
    return nodeType === 'sort';
  });
  
  const hasAggregateTransformation = (structuredIntent.transformations || []).some(tf => {
    const nodeType = unifiedNormalizeNodeTypeString(tf.type || '');
    return nodeType === 'aggregate';
  });
  
  const wantsSort = hasSortTransformation;
  const wantsAggregate = hasAggregateTransformation;

  // ✅ ROOT-LEVEL UNIVERSAL FIX: Use standardized metadata system
  const hasAutoSort = nodes.some(n => {
    const metadata = NodeMetadataHelper.getMetadata(n);
    return getType(n) === 'sort' && metadata?.injection?.autoInjected === true;
  });
  const hasAutoAggregate = nodes.some(n => {
    const metadata = NodeMetadataHelper.getMetadata(n);
    return getType(n) === 'aggregate' && metadata?.injection?.autoInjected === true;
  });

  // ✅ INTENT-BASED: Only inject empty-check if data source produces arrays
  // Check from intent data sources, not hardcoded list
  const sourceType = getType(sourceNode);
  const sourceTypeNormalized = unifiedNormalizeNodeTypeString(sourceType);
  const sourceProducesArrays = arrayProducingDataSources.some(ds => ds.type === sourceTypeNormalized);
  
  // ✅ STRICT: Only inject empty-check if user EXPLICITLY requested it
  // NO automatic injection - user must explicitly request empty check or conditions
  const shouldInjectEmptyCheck = 
    !hasAutoEmptyCheck && 
    sourceProducesArrays && 
    (userSafetyRequests.wantsEmptyCheck || hasConditions);

  // ✅ ROOT-LEVEL FIX: Only inject empty-check if data source produces arrays AND user requested or complex workflow
  // CRITICAL: must run BEFORE any transformations so condition checks raw rows/items from Google Sheets
  if (shouldInjectEmptyCheck) {
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

    // ✅ UNIFIED ORCHESTRATION: Inject if_else node using orchestrator
    const ifNodeResult = await unifiedGraphOrchestrator.injectNode(
      currentWorkflow,
      ifNode,
      {
        type: 'safety',
        position: 'after',
        referenceNodeId: upstreamNode.id,
        reason: 'Auto-inserted empty-check before AI',
      }
    );
    currentWorkflow = ifNodeResult.workflow;
    if (ifNodeResult.errors.length > 0) {
      warnings.push(...ifNodeResult.errors);
    }

    // ✅ UNIFIED ORCHESTRATION: Inject stop node for false path
    const stopNodeResult = await unifiedGraphOrchestrator.injectNode(
      currentWorkflow,
      stopNode,
      {
        type: 'safety',
        position: 'after',
        referenceNodeId: ifNode.id,
        reason: 'Auto-inserted stop node for empty data',
      }
    );
    currentWorkflow = stopNodeResult.workflow;
    if (stopNodeResult.errors.length > 0) {
      warnings.push(...stopNodeResult.errors);
    }

    // Build TRUE path safety chain: if_else(true) -> [limit] -> [sort?] -> [aggregate?] -> AI
    let trueUpstream: WorkflowNode = ifNode;

    // ✅ STRICT: Only inject limit if user EXPLICITLY requested it
    // NO automatic injection - user must explicitly request limit
    const shouldInjectLimit = 
      !hasAutoLimit && 
      userSafetyRequests.wantsLimit;

    // 1.1) Inject limit node (token safety) unless already auto-injected AND user requested or complex workflow
    if (shouldInjectLimit) {
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
      
      // ✅ UNIFIED ORCHESTRATION: Inject limit node using orchestrator
      const limitResult = await unifiedGraphOrchestrator.injectNode(
        currentWorkflow,
        limitNode,
        {
          type: 'safety',
          position: 'after',
          referenceNodeId: ifNode.id,
          reason: 'Auto-inserted safety limit before AI to prevent token overflow',
        }
      );
      currentWorkflow = limitResult.workflow;
      if (limitResult.errors.length > 0) {
        warnings.push(...limitResult.errors);
      }
      
      trueUpstream = limitNode;
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
      
      // ✅ UNIFIED ORCHESTRATION: Inject sort node using orchestrator
      const sortResult = await unifiedGraphOrchestrator.injectNode(
        currentWorkflow,
        sortNode,
        {
          type: 'safety',
          position: 'after',
          referenceNodeId: trueUpstream.id,
          reason: 'Auto-inserted sort before AI due to prompt intent',
        }
      );
      currentWorkflow = sortResult.workflow;
      if (sortResult.errors.length > 0) {
        warnings.push(...sortResult.errors);
      }
      
      trueUpstream = sortNode;
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
      
      // ✅ UNIFIED ORCHESTRATION: Inject aggregate node using orchestrator
      const aggregateResult = await unifiedGraphOrchestrator.injectNode(
        currentWorkflow,
        aggregateNode,
        {
          type: 'safety',
          position: 'after',
          referenceNodeId: trueUpstream.id,
          reason: 'Auto-inserted aggregate before AI due to prompt intent',
        }
      );
      currentWorkflow = aggregateResult.workflow;
      if (aggregateResult.errors.length > 0) {
        warnings.push(...aggregateResult.errors);
      }
      
      trueUpstream = aggregateNode;
      injectedNodeTypes.push('aggregate');
    }

    // ✅ UNIFIED ORCHESTRATION: Final reconciliation to ensure all edges are correct
    const finalReconciliation = unifiedGraphOrchestrator.reconcileWorkflow(currentWorkflow);
    currentWorkflow = finalReconciliation.workflow;
    if (finalReconciliation.errors.length > 0) {
      warnings.push(...finalReconciliation.errors);
    }

    injectedNodeTypes.push('if_else', 'stop_and_error');
  } else {
    // If empty-check already exists, orchestrator will handle connection automatically
    const reconciliation = unifiedGraphOrchestrator.reconcileWorkflow(currentWorkflow);
    currentWorkflow = reconciliation.workflow;
    if (reconciliation.errors.length > 0) {
      warnings.push(...reconciliation.errors);
    }
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
  const aiToGmailEdge = currentWorkflow.edges.find(e => e.source === targetNode.id && currentWorkflow.nodes.some(n => n.id === e.target && getType(n) === 'google_gmail'));
  if (aiToGmailEdge) {
    const gmailNode = currentWorkflow.nodes.find(n => n.id === aiToGmailEdge.target) || null;
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
    workflow: currentWorkflow,
    injectedNodeTypes,
    warnings,
  };
}

