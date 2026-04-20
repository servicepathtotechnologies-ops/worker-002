import { WorkflowNode } from '../core/types/ai-types';
import { unifiedNormalizeNodeType as normalizeNodeFromObject } from '../core/utils/unified-node-type-normalizer';
import { resolveNodeType as resolveNodeTypeString } from '../core/utils/node-type-resolver-util';

export type NodeCategory =
  | 'trigger'
  | 'producer'
  | 'transformer'
  | 'condition'
  | 'output';

export interface ResolvedNodeTypeMetadata {
  sourceField: 'type' | 'data.type' | 'data.nodeType' | 'unknown';
  resolverPath: 'core_normalizer' | 'string_resolver' | 'raw';
  isLLM?: boolean;
  isDataSource?: boolean;
  isTerminalSink?: boolean;
}

export interface ResolvedNodeType {
  canonical: string;
  category: NodeCategory;
  metadata: ResolvedNodeTypeMetadata;
}

/**
 * Feature flag to control whether we use the canonical resolver pipeline.
 *
 * Default: true (unless explicitly disabled via env).
 */
const ENABLE_CANONICAL_RESOLVER =
  process.env.ENABLE_CANONICAL_RESOLVER !== 'false';

/**
 * Resolve a WorkflowNode (or node-like object) to its canonical type and
 * high-level execution category.
 *
 * This is the single entry point that validators, type systems, and
 * auto-repair logic should use when they need to understand "what kind of
 * node is this?" in an execution-agnostic way.
 */
export function resolveNodeType(node: WorkflowNode | any): ResolvedNodeType {
  // 1. Extract raw type + where it came from
  let rawType: string | undefined;
  let sourceField: ResolvedNodeTypeMetadata['sourceField'] = 'unknown';

  if (node?.data?.type) {
    rawType = String(node.data.type);
    sourceField = 'data.type';
  } else if (node?.data?.nodeType) {
    rawType = String(node.data.nodeType);
    sourceField = 'data.nodeType';
  } else if (node?.type) {
    rawType = String(node.type);
    sourceField = 'type';
  }

  let canonical = (rawType || '').trim();
  let resolverPath: ResolvedNodeTypeMetadata['resolverPath'] = 'raw';

  // 2. Use object-aware normalizer first (handles type: "custom" + data.type)
  if (ENABLE_CANONICAL_RESOLVER) {
    const normalizedFromObject = normalizeNodeFromObject(node);
    if (normalizedFromObject && typeof normalizedFromObject === 'string') {
      canonical = normalizedFromObject;
      resolverPath = 'core_normalizer';
    }
  }

  // 3. Run through string-based resolver (aliases like gmail → google_gmail)
  if (canonical) {
    const resolved = resolveNodeTypeString(canonical, false);
    if (resolved && resolved !== canonical) {
      canonical = resolved;
      resolverPath = 'string_resolver';
    }
  }

  const canonicalLower = (canonical || '').toLowerCase().trim();

  // 4. Derive high-level category using generic heuristics only.
  const category = deriveCategory(canonicalLower);

  // 5. Build metadata
  const isLLM = isLLMNode(canonicalLower);
  const isDataSource = category === 'producer';
  const isTerminalSink = isTerminalProducer(canonicalLower);

  return {
    canonical: canonicalLower,
    category,
    metadata: {
      sourceField,
      resolverPath,
      isLLM,
      isDataSource,
      isTerminalSink,
    },
  };
}

function deriveCategory(canonicalLower: string): NodeCategory {
  if (!canonicalLower) {
    return 'transformer';
  }

  // Triggers
  if (
    canonicalLower === 'manual_trigger' ||
    canonicalLower === 'schedule' ||
    canonicalLower === 'webhook' ||
    canonicalLower === 'chat_trigger' ||
    canonicalLower === 'interval' ||
    canonicalLower === 'error_trigger' ||
    canonicalLower === 'workflow_trigger' ||
    canonicalLower.includes('trigger')
  ) {
    return 'trigger';
  }

  // Conditions / flow control
  if (
    canonicalLower === 'if_else' ||
    canonicalLower === 'switch' ||
    canonicalLower === 'loop' ||
    canonicalLower.includes('condition')
  ) {
    return 'condition';
  }

  // Outputs: notifications / sends / email / messaging / webhooks responses
  if (
    canonicalLower.includes('gmail') ||
    canonicalLower.includes('email') ||
    canonicalLower.includes('slack') ||
    canonicalLower.includes('discord') ||
    canonicalLower.includes('telegram') ||
    canonicalLower.includes('notification') ||
    canonicalLower.includes('log_output') ||
    canonicalLower.includes('webhook_response')
  ) {
    return 'output';
  }

  // Producers: HTTP, DB, sheets, CRMs, generic storage
  if (
    canonicalLower.includes('http') ||
    canonicalLower.includes('api') ||
    canonicalLower.includes('sheets') ||
    canonicalLower.includes('database') ||
    canonicalLower.includes('postgres') ||
    canonicalLower.includes('mysql') ||
    canonicalLower.includes('mongo') ||
    canonicalLower.includes('airtable') ||
    canonicalLower.includes('notion') ||
    canonicalLower.includes('read') ||
    canonicalLower.includes('fetch')
  ) {
    return 'producer';
  }

  // Transformers: AI / text / generic transformations
  if (isLLMNode(canonicalLower)) {
    return 'transformer';
  }

  if (
    canonicalLower.includes('summarize') ||
    canonicalLower.includes('summariser') ||
    canonicalLower.includes('summary') ||
    canonicalLower.includes('analyze') ||
    canonicalLower.includes('analyse') ||
    canonicalLower.includes('transform') ||
    canonicalLower.includes('process') ||
    canonicalLower.includes('formatter')
  ) {
    return 'transformer';
  }

  // Default: treat unknown nodes that are not clearly triggers/conditions
  // as transformers rather than producers to keep data moving forward.
  return 'transformer';
}

function isLLMNode(canonicalLower: string): boolean {
  return (
    canonicalLower === 'ai_chat_model' ||
    canonicalLower === 'ai_service' ||
    canonicalLower === 'ai_agent' ||
    canonicalLower === 'ollama' ||
    canonicalLower === 'openai_gpt' ||
    canonicalLower === 'anthropic_claude' ||
    canonicalLower === 'google_gemini' ||
    canonicalLower.includes('llm') ||
    canonicalLower.includes('gpt') ||
    canonicalLower.includes('claude') ||
    canonicalLower.includes('gemini')
  );
}

function isTerminalProducer(canonicalLower: string): boolean {
  // Treat common storage/CRM/database nodes as valid terminal sinks.
  return (
    canonicalLower.includes('airtable') ||
    canonicalLower.includes('database_write') ||
    canonicalLower.includes('postgres') ||
    canonicalLower.includes('mysql') ||
    canonicalLower.includes('mongodb') ||
    canonicalLower.includes('redis') ||
    canonicalLower.includes('s3') ||
    canonicalLower.includes('storage')
  );
}

