/**
 * Universal Handle Resolver
 * 
 * ✅ CRITICAL: Prevents Error #1 - Invalid source handle for branching nodes
 * 
 * This resolver ensures:
 * 1. Always uses registry as single source of truth
 * 2. Prioritizes explicit handles when provided
 * 3. Validates handles exist in node's port definitions
 * 4. Never creates invalid handles (e.g., 'output' for if_else)
 * 
 * Architecture Rule:
 * - ALL handle resolution MUST use this resolver
 * - NO hardcoded handle logic allowed
 * - Registry is the ONLY source of truth for valid handles
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { unifiedNormalizeNodeTypeString } from './unified-node-type-normalizer';

export interface HandleResolutionResult {
  handle: string;
  valid: boolean;
  reason?: string;
}

export class UniversalHandleResolver {
  private static instance: UniversalHandleResolver;
  
  private constructor() {}
  
  static getInstance(): UniversalHandleResolver {
    if (!UniversalHandleResolver.instance) {
      UniversalHandleResolver.instance = new UniversalHandleResolver();
    }
    return UniversalHandleResolver.instance;
  }
  
  /**
   * Resolve source handle dynamically using registry
   * PRIORITY: explicit handle > connection type > registry default
   * 
   * Prevents Error #1: Invalid source handle for if_else
   * 
   * @param nodeType - Node type (e.g., 'if_else', 'google_gmail')
   * @param explicitHandle - Explicit handle from structure (highest priority)
   * @param connectionType - Connection type ('true', 'false', 'main', etc.)
   * @returns Resolved handle that exists in registry
   */
  resolveSourceHandle(
    nodeType: string,
    explicitHandle?: string,
    connectionType?: 'true' | 'false' | 'main' | 'case_1' | 'case_2' | string
  ): HandleResolutionResult {
    const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
    const nodeDef = unifiedNodeRegistry.get(normalizedType);
    
    if (!nodeDef) {
      return {
        handle: 'output', // Fallback
        valid: false,
        reason: `Node type ${nodeType} not found in registry`
      };
    }
    
    const validPorts = nodeDef.outgoingPorts || [];
    
    // ✅ PRIORITY 1: Use explicit handle if provided and valid
    if (explicitHandle && validPorts.includes(explicitHandle)) {
      return {
        handle: explicitHandle,
        valid: true,
        reason: `Using explicit handle from structure: ${explicitHandle}`
      };
    }
    
    // ✅ PRIORITY 2: Use connection type if provided and valid
    if (connectionType && validPorts.includes(connectionType)) {
      return {
        handle: connectionType,
        valid: true,
        reason: `Using connection type: ${connectionType}`
      };
    }
    
    // ✅ PRIORITY 3: Use registry default (first available port)
    if (validPorts.length > 0) {
      // ✅ UNIVERSAL: For branching nodes (detected via registry), prefer boolean handles if available
      // This works for ANY branching node type, not just if_else
      if (nodeDef.isBranching && validPorts.length > 1) {
        // Prefer 'true' if available (common for conditional nodes)
        if (validPorts.includes('true')) {
          return {
            handle: 'true',
            valid: true,
            reason: `Using default 'true' handle for branching node (detected via registry.isBranching)`
          };
        }
        // Prefer 'false' if available (common for conditional nodes)
        if (validPorts.includes('false')) {
          return {
            handle: 'false',
            valid: true,
            reason: `Using default 'false' handle for branching node (detected via registry.isBranching)`
          };
        }
      }
      
      // Use first available port
      return {
        handle: validPorts[0],
        valid: true,
        reason: `Using first available port from registry: ${validPorts[0]}`
      };
    }
    
    // ✅ PRIORITY 4: Fallback to 'output' (should never happen for registered nodes)
    return {
      handle: 'output',
      valid: false,
      reason: `No valid outgoing ports found in registry for ${nodeType}, using fallback 'output'`
    };
  }
  
  /**
   * Resolve target handle dynamically using registry
   * PRIORITY: explicit handle > registry default
   * 
   * @param nodeType - Node type
   * @param explicitHandle - Explicit handle from structure
   * @returns Resolved handle that exists in registry
   */
  resolveTargetHandle(
    nodeType: string,
    explicitHandle?: string
  ): HandleResolutionResult {
    const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
    const nodeDef = unifiedNodeRegistry.get(normalizedType);
    
    if (!nodeDef) {
      return {
        handle: 'input', // Fallback
        valid: false,
        reason: `Node type ${nodeType} not found in registry`
      };
    }
    
    const validPorts = nodeDef.incomingPorts || [];
    
    // ✅ PRIORITY 1: Use explicit handle if provided and valid
    if (explicitHandle && validPorts.includes(explicitHandle)) {
      return {
        handle: explicitHandle,
        valid: true,
        reason: `Using explicit handle from structure: ${explicitHandle}`
      };
    }
    
    // ✅ PRIORITY 2: Use registry default (first available port)
    if (validPorts.length > 0) {
      return {
        handle: validPorts[0],
        valid: true,
        reason: `Using first available port from registry: ${validPorts[0]}`
      };
    }
    
    // ✅ PRIORITY 3: Fallback to 'input' (should never happen for registered nodes)
    return {
      handle: 'input',
      valid: false,
      reason: `No valid incoming ports found in registry for ${nodeType}, using fallback 'input'`
    };
  }
  
  /**
   * Validate handle compatibility between source and target nodes
   * 
   * @param sourceNodeType - Source node type
   * @param sourceHandle - Source handle
   * @param targetNodeType - Target node type
   * @param targetHandle - Target handle
   * @returns true if handles are compatible
   */
  validateHandleCompatibility(
    sourceNodeType: string,
    sourceHandle: string,
    targetNodeType: string,
    targetHandle: string
  ): boolean {
    const sourceDef = unifiedNodeRegistry.get(unifiedNormalizeNodeTypeString(sourceNodeType));
    const targetDef = unifiedNodeRegistry.get(unifiedNormalizeNodeTypeString(targetNodeType));
    
    if (!sourceDef || !targetDef) {
      return false;
    }
    
    // Check if source handle exists in source node's outgoing ports
    const sourceValid = sourceDef.outgoingPorts.includes(sourceHandle);
    
    // Check if target handle exists in target node's incoming ports
    const targetValid = targetDef.incomingPorts.includes(targetHandle);
    
    return sourceValid && targetValid;
  }
  
  /**
   * Get all valid source handles for a node type
   */
  getValidSourceHandles(nodeType: string): string[] {
    const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
    const nodeDef = unifiedNodeRegistry.get(normalizedType);
    return nodeDef?.outgoingPorts || [];
  }
  
  /**
   * Get all valid target handles for a node type
   */
  getValidTargetHandles(nodeType: string): string[] {
    const normalizedType = unifiedNormalizeNodeTypeString(nodeType);
    const nodeDef = unifiedNodeRegistry.get(normalizedType);
    return nodeDef?.incomingPorts || [];
  }
}

// Export singleton instance
export const universalHandleResolver = UniversalHandleResolver.getInstance();
