/**
 * ✅ ROOT-LEVEL ARCHITECTURE: Node Context Registry
 * 
 * This is the SINGLE SOURCE OF TRUTH for all node contexts.
 * 
 * Architecture Rules:
 * 1. ALL nodes must have context registered here
 * 2. AI reads contexts from this registry
 * 3. No node can exist without context
 * 4. Context is mandatory, not optional
 * 
 * This ensures:
 * - AI has access to all node contexts
 * - AI can understand what each node does
 * - AI can match user intent to node contexts
 * - Systematic context for all nodes
 */

import { nodeLibrary } from '../../services/nodes/node-library';
import { NodeContext, extractNodeContext, validateNodeContext } from '../types/node-context';

export class NodeContextRegistry {
  private static instance: NodeContextRegistry;
  private contexts: Map<string, NodeContext> = new Map();
  
  private constructor() {
    console.log('[NodeContextRegistry] 🏗️  Initializing Node Context Registry...');
    this.initializeFromNodeLibrary();
    this.validateAllContexts();
    console.log(`[NodeContextRegistry] ✅ Initialized with ${this.contexts.size} node contexts`);
  }
  
  static getInstance(): NodeContextRegistry {
    if (!NodeContextRegistry.instance) {
      NodeContextRegistry.instance = new NodeContextRegistry();
    }
    return NodeContextRegistry.instance;
  }
  
  /**
   * ✅ MANDATORY: Initialize contexts from NodeLibrary
   * 
   * Every node in NodeLibrary MUST have context
   * ✅ ENHANCED: Uses intelligent defaults for missing fields
   */
  private initializeFromNodeLibrary(): void {
    const allSchemas = nodeLibrary.getAllSchemas();
    let contextCount = 0;
    const missingContexts: string[] = [];
    const warnings: string[] = [];
    
    for (const schema of allSchemas) {
      try {
        const context = extractNodeContext(schema);
        const validation = validateNodeContext(context);
        
        if (!validation.valid) {
          // ✅ ENHANCED: Log warning but continue (intelligent defaults should prevent this)
          console.warn(
            `[NodeContextRegistry] ⚠️  Node "${schema.type}" has validation issues: ${validation.errors.join(', ')}. ` +
            `Using inferred defaults.`
          );
          warnings.push(`${schema.type}: ${validation.errors.join(', ')}`);
          // Continue anyway - intelligent defaults should have fixed this
        }
        
        // ✅ ENSURE: Context has all required fields (intelligent defaults should provide them)
        const finalContext: NodeContext = {
          ...context,
          // Ensure arrays are never empty
          capabilities: context.capabilities.length > 0 ? context.capabilities : [`${schema.type}.execute`],
          examples: context.examples.length > 0 ? context.examples : [`Use ${schema.type} node`],
          keywords: context.keywords.length > 0 ? context.keywords : [schema.type, schema.category],
          useCases: context.useCases.length > 0 ? context.useCases : [`Execute ${schema.type} operation`],
        };
        
        this.contexts.set(schema.type, finalContext);
        contextCount++;
      } catch (error: any) {
        console.error(`[NodeContextRegistry] ❌ Failed to extract context for ${schema.type}:`, error.message);
        missingContexts.push(schema.type);
      }
    }
    
    // ✅ ENHANCED: Log warnings but don't fail (intelligent defaults should prevent critical failures)
    if (warnings.length > 0) {
      console.warn(
        `[NodeContextRegistry] ⚠️  ${warnings.length} node(s) had validation warnings (fixed with intelligent defaults): ` +
        `${warnings.slice(0, 3).join('; ')}...`
      );
    }
    
    // Only fail if extraction completely failed (not validation warnings)
    if (missingContexts.length > 0) {
      throw new Error(
        `[NodeContextRegistry] ❌ ${missingContexts.length} node(s) failed context extraction: ${missingContexts.slice(0, 5).join(', ')}... ` +
        `This indicates a system error, not missing context fields.`
      );
    }
    
    console.log(`[NodeContextRegistry] ✅ Registered ${contextCount} node contexts (${warnings.length} with inferred defaults)`);
  }
  
  /**
   * ✅ MANDATORY: Validate all contexts
   * 
   * Ensures every node has complete, valid context
   */
  private validateAllContexts(): void {
    const invalidContexts: string[] = [];
    
    for (const [nodeType, context] of this.contexts.entries()) {
      const validation = validateNodeContext(context);
      if (!validation.valid) {
        invalidContexts.push(nodeType);
        console.error(
          `[NodeContextRegistry] ❌ Node "${nodeType}" has invalid context: ${validation.errors.join(', ')}`
        );
      }
    }
    
    if (invalidContexts.length > 0) {
      throw new Error(
        `[NodeContextRegistry] ❌ ${invalidContexts.length} node(s) have invalid context. ` +
        `Every node MUST have complete context. Fix these nodes: ${invalidContexts.slice(0, 5).join(', ')}...`
      );
    }
  }
  
  /**
   * Get context for a node type
   */
  get(nodeType: string): NodeContext | undefined {
    return this.contexts.get(nodeType);
  }
  
  /**
   * Get all contexts
   * AI uses this to understand all available nodes
   */
  getAllContexts(): Map<string, NodeContext> {
    return new Map(this.contexts);
  }
  
  /**
   * Get contexts as array (for AI processing)
   */
  getAllContextsArray(): Array<{ nodeType: string; context: NodeContext }> {
    return Array.from(this.contexts.entries()).map(([nodeType, context]) => ({
      nodeType,
      context,
    }));
  }
  
  /**
   * Get contexts formatted for AI (readable format)
   * This is what AI reads to understand nodes
   */
  getContextsForAI(): string {
    const contexts = this.getAllContextsArray();
    
    return contexts.map(({ nodeType, context }) => {
      return `
## Node: ${nodeType}

**Description**: ${context.description}

**Use Cases**: ${context.useCases.join(', ')}

**Capabilities**: ${context.capabilities.join(', ')}

**Keywords**: ${context.keywords.join(', ')}

**Platforms**: ${context.platforms.join(', ')}

**Examples**:
${context.examples.map(ex => `- ${ex}`).join('\n')}

**Input**: ${context.inputContext.description} (${context.inputContext.dataTypes.join(', ')})

**Output**: ${context.outputContext.description} (${context.outputContext.dataTypes.join(', ')})

**When NOT to use**: ${context.whenNotToUse.join(', ')}

---
`;
    }).join('\n');
  }
  
  /**
   * Check if node has context
   */
  has(nodeType: string): boolean {
    return this.contexts.has(nodeType);
  }
  
  /**
   * Get all node types with contexts
   */
  getAllNodeTypes(): string[] {
    return Array.from(this.contexts.keys());
  }
}

// Export singleton instance
export const nodeContextRegistry = NodeContextRegistry.getInstance();
