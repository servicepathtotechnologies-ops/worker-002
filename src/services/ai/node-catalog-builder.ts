import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

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

