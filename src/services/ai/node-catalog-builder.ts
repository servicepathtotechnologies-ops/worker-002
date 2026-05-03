import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

// ─── AI-First: Compact catalog types ────────────────────────────────────────

export type NodeCategory =
  | 'trigger'
  | 'logic'
  | 'data'
  | 'ai'
  | 'communication'
  | 'transformation'
  | 'utility'
  | string;

export interface NodeCatalogOptions {
  /** Max characters for the serialized catalog (approx tokens * 4). Default: 32000 */
  tokenBudget?: number;
  /** Category priority order — first = highest priority. Default: trigger → logic → data → ai → communication → transformation → utility */
  priorityOrder?: NodeCategory[];
}

/** Compact per-node entry included in the LLM system prompt */
export interface CompactNodeEntry {
  type: string;
  label: string;
  category: string;
  description: string;
  inputSummary: string[];
  outputSummary: string[];
  credentials: string[];
  isTrigger: boolean;
  isBranching: boolean;
  operations?: string[];
  tags?: string[];
  capabilities?: string[];
  aiKeywords?: string[];
  useCases?: string[];
}

export type NodeCatalogText = string;

const DEFAULT_PRIORITY_ORDER: NodeCategory[] = [
  'trigger',
  'logic',
  'data',
  'ai',
  'communication',
  'transformation',
  'utility',
];

const DEFAULT_TOKEN_BUDGET = 32000; // ~8k tokens

/**
 * Build a compact, token-budget-aware node catalog string for LLM system prompts.
 *
 * - Reads ALL node definitions from UnifiedNodeRegistry at call time (no hardcoding).
 * - Sorts by priorityOrder so trigger/logic nodes are never dropped first.
 * - Serializes to compact JSON and accumulates until tokenBudget is reached.
 * - Adding a new node to the registry automatically includes it here — zero code changes needed.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */
export function buildNodeCatalogText(options: NodeCatalogOptions = {}): NodeCatalogText {
  const budget = options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const priorityOrder = options.priorityOrder ?? DEFAULT_PRIORITY_ORDER;

  const types = unifiedNodeRegistry.getAllTypes();

  // Build compact entries from registry (no hardcoded node names)
  const entries: CompactNodeEntry[] = [];
  for (const type of types) {
    const def = unifiedNodeRegistry.get(type);
    if (!def) continue;

    const inputSchema = def.inputSchema || {};
    const outputSchema = def.outputSchema || {};
    const credSchema = def.credentialSchema;

    const inputSummary = Object.keys(inputSchema).slice(0, 8); // top 8 fields
    const outputSummary = Object.keys(outputSchema).slice(0, 4);

    const credentials: string[] = [];
    if (credSchema?.requirements) {
      for (const req of credSchema.requirements) {
        if (req.category) credentials.push(req.category);
      }
    }

    // Extract operations from inputSchema if present
    const opField = inputSchema['operation'] as any;
    let operations: string[] | undefined;
    if (opField?.enum) operations = opField.enum;
    else if (opField?.oneOf) operations = opField.oneOf.map((o: any) => o.const ?? o.enum?.[0]).filter(Boolean);

    const entry: CompactNodeEntry = {
      type,
      label: def.label || type,
      category: def.category || 'utility',
      description: (def.description || '').slice(0, 120),
      inputSummary,
      outputSummary,
      credentials,
      isTrigger: def.category === 'trigger',
      isBranching: !!(def as any).isBranching,
    };
    if (operations?.length) entry.operations = operations;
    if (def.tags?.length) entry.tags = def.tags.slice(0, 8);
    if (def.capabilities?.length) entry.capabilities = def.capabilities.slice(0, 8);
    if (def.aiSelectionCriteria?.keywords?.length) {
      entry.aiKeywords = def.aiSelectionCriteria.keywords.slice(0, 8);
    }
    if (def.aiSelectionCriteria?.useCases?.length) {
      entry.useCases = def.aiSelectionCriteria.useCases.slice(0, 4);
    }

    entries.push(entry);
  }

  // Sort by priority order (lower index = higher priority = kept first when truncating)
  entries.sort((a, b) => {
    const ai = priorityOrder.indexOf(a.category);
    const bi = priorityOrder.indexOf(b.category);
    const aNorm = ai === -1 ? priorityOrder.length : ai;
    const bNorm = bi === -1 ? priorityOrder.length : bi;
    return aNorm - bNorm;
  });

  // Accumulate until budget is reached
  const included: CompactNodeEntry[] = [];
  let accumulated = 0;
  for (const entry of entries) {
    const serialized = JSON.stringify(entry);
    if (accumulated + serialized.length > budget && included.length > 0) break;
    included.push(entry);
    accumulated += serialized.length + 1; // +1 for comma/newline
  }

  return JSON.stringify(included);
}

export interface NodeCatalogEntry {
  type: string;
  name: string;
  category: string;
  description: string;
  capabilities: string[];
  inputs: Array<{ name: string; type: string; required: boolean }>;
  outputs: Array<{ name: string; type: string }>;
  examples: string[];
  // ✅ AI-FIRST: Operation information for multi-capability nodes
  operations?: string[]; // Available operations (e.g., ["read", "write", "send", "get"])
  operationCapabilities?: Record<string, string[]>; // Operation-specific capabilities
}

/**
 * Build a compact node catalog for Gemini planning.
 * Uses UnifiedNodeRegistry as the single source of truth.
 */
export function buildNodeCatalog(): NodeCatalogEntry[] {
  const types = unifiedNodeRegistry.getAllTypes();
  const catalog: NodeCatalogEntry[] = [];

  for (const type of types) {
    const def = unifiedNodeRegistry.get(type);
    if (!def) continue;

    const name = def.label || type;
    const category = def.category || 'action';
    const description = def.description || '';
    const capabilityTags = Array.isArray(def.tags) ? def.tags : [];

    const inputs: Array<{ name: string; type: string; required: boolean }> = [];
    const outputs: Array<{ name: string; type: string }> = [];

    const inputSchema = def.inputSchema || {};
    let operations: string[] = [];
    const operationCapabilities: Record<string, string[]> = {};
    
    for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
      inputs.push({
        name: fieldName,
        type: (fieldDef as any).type || 'string',
        required: !!(fieldDef as any).required,
      });
      
      // ✅ AI-FIRST: Extract operation information from inputSchema
      if (fieldName.toLowerCase() === 'operation') {
        const fieldType = (fieldDef as any).type;
        // Check for enum/oneOf operations
        if ((fieldDef as any).enum && Array.isArray((fieldDef as any).enum)) {
          operations = (fieldDef as any).enum;
        } else if ((fieldDef as any).oneOf && Array.isArray((fieldDef as any).oneOf)) {
          operations = (fieldDef as any).oneOf.map((item: any) => item.const || item.enum?.[0]).filter(Boolean);
        }
        
        // ✅ AI-FIRST: Map operations to capabilities for role assignment
        // Reading operations → data_source capability
        const readOps = ['read', 'get', 'list', 'search', 'fetch', 'query', 'retrieve'];
        // Writing operations → output capability
        const writeOps = ['write', 'send', 'create', 'update', 'delete', 'append', 'post', 'publish'];
        
        for (const op of operations) {
          const opLower = op.toLowerCase();
          const opCaps: string[] = [];
          
          if (readOps.some(ro => opLower.includes(ro))) {
            opCaps.push('data_source', 'read');
          }
          if (writeOps.some(wo => opLower.includes(wo))) {
            opCaps.push('output', 'write');
          }
          if (opLower.includes('transform') || opLower.includes('process') || opLower.includes('analyze')) {
            opCaps.push('transformation');
          }
          
          if (opCaps.length > 0) {
            operationCapabilities[op] = opCaps;
          }
        }
      }
    }

    const outputSchema = def.outputSchema || {};
    const defaultPort = (outputSchema as any).default;
    if (defaultPort?.schema) {
      outputs.push({
        name: defaultPort.name || 'default',
        type: defaultPort.schema.type || 'object',
      });
    }

    const examples: string[] = [];
    if (Array.isArray((def as any).examples)) {
      examples.push(...(def as any).examples);
    }

    const catalogEntry: NodeCatalogEntry = {
      type,
      name,
      category,
      description,
      capabilities: capabilityTags,
      inputs,
      outputs,
      examples,
    };
    
    // ✅ AI-FIRST: Add operation information if available
    if (operations.length > 0) {
      catalogEntry.operations = operations;
      if (Object.keys(operationCapabilities).length > 0) {
        catalogEntry.operationCapabilities = operationCapabilities;
      }
    }

    catalog.push(catalogEntry);
  }

  return catalog;
}
