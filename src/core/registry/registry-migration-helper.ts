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
import type { Workflow } from '../types/ai-types';
import { normalizeWorkflowFormFieldIdentities } from '../utils/form-field-identity';
import { repairIfElseConditionsFromUpstreamForm } from '../orchestration/repair-ifelse-form-conditions';

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

export function migrateWorkflowFormFieldIdentities(workflow: Workflow): {
  workflow: Workflow;
  changed: boolean;
} {
  const before = JSON.stringify((workflow as any).nodes || []);
  let migrated = normalizeWorkflowFormFieldIdentities(workflow);
  migrated = repairIfElseConditionsFromUpstreamForm(migrated);
  const after = JSON.stringify((migrated as any).nodes || []);
  return { workflow: migrated, changed: before !== after };
}

export interface FormIdentityMigrationItem {
  id: string;
  workflow: Workflow;
}

export interface FormIdentityMigrationResult {
  id: string;
  changed: boolean;
  error?: string;
  workflow?: Workflow;
}

export interface FormIdentityMigrationReport {
  total: number;
  changed: number;
  unchanged: number;
  failed: number;
  results: FormIdentityMigrationResult[];
}

export function dryRunFormIdentityMigration(
  items: FormIdentityMigrationItem[]
): FormIdentityMigrationReport {
  const results: FormIdentityMigrationResult[] = [];
  for (const item of items) {
    try {
      const migration = migrateWorkflowFormFieldIdentities(item.workflow);
      results.push({
        id: item.id,
        changed: migration.changed,
      });
    } catch (error: any) {
      results.push({
        id: item.id,
        changed: false,
        error: error?.message || 'migration_failed',
      });
    }
  }
  const changed = results.filter((r) => r.changed).length;
  const failed = results.filter((r) => !!r.error).length;
  return {
    total: results.length,
    changed,
    unchanged: results.length - changed - failed,
    failed,
    results,
  };
}

export function applyFormIdentityMigration(
  items: FormIdentityMigrationItem[]
): FormIdentityMigrationReport {
  const results: FormIdentityMigrationResult[] = [];
  for (const item of items) {
    try {
      const migration = migrateWorkflowFormFieldIdentities(item.workflow);
      results.push({
        id: item.id,
        changed: migration.changed,
        workflow: migration.workflow,
      });
    } catch (error: any) {
      results.push({
        id: item.id,
        changed: false,
        error: error?.message || 'migration_failed',
      });
    }
  }
  const changed = results.filter((r) => r.changed).length;
  const failed = results.filter((r) => !!r.error).length;
  return {
    total: results.length,
    changed,
    unchanged: results.length - changed - failed,
    failed,
    results,
  };
}
