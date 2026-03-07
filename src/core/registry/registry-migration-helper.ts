/**
 * ✅ REGISTRY MIGRATION HELPER
 * 
 * Utilities to help migrate hardcoded node logic to UnifiedNodeRegistry.
 * 
 * Features:
 * - Check if node is migrated
 * - Get migration status
 * - Generate migration reports
 * - Validate registry coverage
 */

import { unifiedNodeRegistry } from './unified-node-registry';
import { getNodeExecutionStub, hasExecutionStub, getUnmigratedNodeTypes } from './node-execution-stubs';
import { CANONICAL_NODE_TYPES } from '../../services/nodes/node-library';

export interface MigrationStatus {
  nodeType: string;
  inRegistry: boolean;
  hasStub: boolean;
  migrationStatus: 'complete' | 'pending' | 'in_progress';
  legacyLocation?: { file: string; line: number };
}

/**
 * Get migration status for a node type
 */
export function getMigrationStatus(nodeType: string): MigrationStatus {
  const inRegistry = unifiedNodeRegistry.get(nodeType) !== undefined;
  const stub = getNodeExecutionStub(nodeType);
  
  return {
    nodeType,
    inRegistry,
    hasStub: !!stub,
    migrationStatus: inRegistry ? 'complete' : (stub?.migrationStatus || 'pending'),
    legacyLocation: stub?.legacyLocation,
  };
}

/**
 * Get migration report for all node types
 */
export function getMigrationReport(): {
  total: number;
  migrated: number;
  unmigrated: number;
  statuses: MigrationStatus[];
} {
  const statuses = CANONICAL_NODE_TYPES.map(type => getMigrationStatus(type));
  
  return {
    total: CANONICAL_NODE_TYPES.length,
    migrated: statuses.filter(s => s.inRegistry).length,
    unmigrated: statuses.filter(s => !s.inRegistry).length,
    statuses,
  };
}

/**
 * Check if a node type is fully migrated
 */
export function isNodeMigrated(nodeType: string): boolean {
  const status = getMigrationStatus(nodeType);
  return status.inRegistry && status.migrationStatus === 'complete';
}

/**
 * Get list of nodes that need migration
 */
export function getNodesNeedingMigration(): string[] {
  return getUnmigratedNodeTypes();
}

/**
 * Validate registry coverage
 */
export function validateRegistryCoverage(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check: All canonical types should be in registry
  for (const nodeType of CANONICAL_NODE_TYPES) {
    const status = getMigrationStatus(nodeType);
    
    if (!status.inRegistry) {
      if (status.hasStub) {
        warnings.push(`Node type "${nodeType}" has stub but not in registry`);
      } else {
        errors.push(`Node type "${nodeType}" not in registry and no stub found`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
