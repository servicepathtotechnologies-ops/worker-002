/**
 * ✅ NODE EXECUTION STUBS - Migration Placeholders
 * 
 * This file contains execution stubs for nodes that are still in the legacy switch statement.
 * These stubs reference the original legacy implementation and should be migrated gradually.
 * 
 * Migration Status:
 * - ✅ Nodes in UnifiedNodeRegistry: Use registry.execute()
 * - ⚠️ Nodes in this file: Still use legacy executor (fallback)
 * - 🔄 TODO: Migrate each stub to unified-node-registry-overrides.ts
 * 
 * Architecture:
 * - Each stub references the original file and line number
 * - Stubs throw "unimplemented" error to force migration
 * - Legacy executor handles these nodes until migration complete
 */

import { NodeExecutionContext } from '../types/unified-node-contract';

/**
 * Node execution stubs for unmigrated nodes
 * 
 * These are placeholders that reference the legacy implementation.
 * When migrating, move the actual logic to unified-node-registry-overrides.ts
 */
export const NODE_EXECUTION_STUBS: Record<string, {
  canonicalType: string;
  execute: (ctx: NodeExecutionContext) => Promise<unknown>;
  legacyLocation: { file: string; line: number };
  migrationStatus: 'pending' | 'in_progress' | 'complete';
}> = {
  // ============================================
  // TRIGGER NODES
  // ============================================
  
  manual_trigger: {
    canonicalType: 'manual_trigger',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/manual-trigger.ts
      throw new Error('[STUB] manual_trigger execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 510 },
    migrationStatus: 'complete',
  },
  
  chat_trigger: {
    canonicalType: 'chat_trigger',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/chat-trigger.ts
      throw new Error('[STUB] chat_trigger execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 517 },
    migrationStatus: 'complete',
  },
  
  webhook: {
    canonicalType: 'webhook',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/webhook.ts
      throw new Error('[STUB] webhook execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 532 },
    migrationStatus: 'complete',
  },
  
  // ============================================
  // LOGIC NODES
  // ============================================
  
  if_else: {
    canonicalType: 'if_else',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts (if_else case)
      // Legacy: Evaluates conditions and returns true/false path
      throw new Error('[STUB] if_else execution not migrated. See execute-workflow.ts');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 0 },
    migrationStatus: 'pending',
  },
  
  switch: {
    canonicalType: 'switch',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/switch.ts (uses legacy executor adapter)
      throw new Error('[STUB] switch execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 10297 },
    migrationStatus: 'complete',
  },
  
  // ============================================
  // DATA TRANSFORMATION NODES
  // ============================================
  
  set_variable: {
    canonicalType: 'set_variable',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/set-variable.ts (uses legacy executor adapter)
      throw new Error('[STUB] set_variable execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 572 },
    migrationStatus: 'complete',
  },
  
  math: {
    canonicalType: 'math',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/math.ts (uses legacy executor adapter)
      throw new Error('[STUB] math execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 619 },
    migrationStatus: 'complete',
  },
  
  sort: {
    canonicalType: 'sort',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/sort.ts (uses legacy executor adapter)
      throw new Error('[STUB] sort execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 736 },
    migrationStatus: 'complete',
  },
  
  limit: {
    canonicalType: 'limit',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/limit.ts (uses legacy executor adapter)
      throw new Error('[STUB] limit execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 811 },
    migrationStatus: 'complete',
  },
  
  aggregate: {
    canonicalType: 'aggregate',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/aggregate.ts (uses legacy executor adapter)
      throw new Error('[STUB] aggregate execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 926 },
    migrationStatus: 'complete',
  },
  
  // ============================================
  // FLOW CONTROL NODES
  // ============================================
  
  wait: {
    canonicalType: 'wait',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/wait.ts (uses legacy executor adapter)
      throw new Error('[STUB] wait execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1006 },
    migrationStatus: 'complete',
  },
  
  delay: {
    canonicalType: 'delay',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/delay.ts (uses legacy executor adapter)
      throw new Error('[STUB] delay execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1048 },
    migrationStatus: 'complete',
  },
  
  timeout: {
    canonicalType: 'timeout',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/timeout.ts (already exists)
      throw new Error('[STUB] timeout execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1096 },
    migrationStatus: 'complete',
  },
  
  return: {
    canonicalType: 'return',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/return.ts (uses legacy executor adapter)
      throw new Error('[STUB] return execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1113 },
    migrationStatus: 'complete',
  },
  
  // ============================================
  // ADVANCED NODES
  // ============================================
  
  execute_workflow: {
    canonicalType: 'execute_workflow',
    execute: async (ctx) => {
      // ✅ MIGRATED: See overrides/execute-workflow.ts (uses legacy executor adapter)
      throw new Error('[STUB] execute_workflow execution migrated to registry override');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1141 },
    migrationStatus: 'complete',
  },
  
  try_catch: {
    canonicalType: 'try_catch',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts:1271-1280
      throw new Error('[STUB] try_catch execution not migrated. See execute-workflow.ts:1271');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1271 },
    migrationStatus: 'pending',
  },
  
  retry: {
    canonicalType: 'retry',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts:1281-1298
      throw new Error('[STUB] retry execution not migrated. See execute-workflow.ts:1281');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1281 },
    migrationStatus: 'pending',
  },
  
  parallel: {
    canonicalType: 'parallel',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts:1299-1312
      throw new Error('[STUB] parallel execution not migrated. See execute-workflow.ts:1299');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1299 },
    migrationStatus: 'pending',
  },
  
  // ============================================
  // QUEUE NODES
  // ============================================
  
  queue_push: {
    canonicalType: 'queue_push',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts:1313-1392
      throw new Error('[STUB] queue_push execution not migrated. See execute-workflow.ts:1313');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1313 },
    migrationStatus: 'pending',
  },
  
  queue_consume: {
    canonicalType: 'queue_consume',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts:1393-1514
      throw new Error('[STUB] queue_consume execution not migrated. See execute-workflow.ts:1393');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1393 },
    migrationStatus: 'pending',
  },
  
  // ============================================
  // CACHE NODES
  // ============================================
  
  cache_get: {
    canonicalType: 'cache_get',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts:1515-1610
      throw new Error('[STUB] cache_get execution not migrated. See execute-workflow.ts:1515');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1515 },
    migrationStatus: 'pending',
  },
  
  cache_set: {
    canonicalType: 'cache_set',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts:1611-1700
      throw new Error('[STUB] cache_set execution not migrated. See execute-workflow.ts:1611');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1611 },
    migrationStatus: 'pending',
  },
  
  // ============================================
  // AUTH NODES
  // ============================================
  
  oauth2_auth: {
    canonicalType: 'oauth2_auth',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts:1701-1839
      throw new Error('[STUB] oauth2_auth execution not migrated. See execute-workflow.ts:1701');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1701 },
    migrationStatus: 'pending',
  },
  
  api_key_auth: {
    canonicalType: 'api_key_auth',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts:1840-1971
      throw new Error('[STUB] api_key_auth execution not migrated. See execute-workflow.ts:1840');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1840 },
    migrationStatus: 'pending',
  },
  
  // ============================================
  // FILE NODES
  // ============================================
  
  read_binary_file: {
    canonicalType: 'read_binary_file',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts:1972-1998
      throw new Error('[STUB] read_binary_file execution not migrated. See execute-workflow.ts:1972');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1972 },
    migrationStatus: 'pending',
  },
  
  write_binary_file: {
    canonicalType: 'write_binary_file',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts:1999-2029
      throw new Error('[STUB] write_binary_file execution not migrated. See execute-workflow.ts:1999');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 1999 },
    migrationStatus: 'pending',
  },
  
  // ============================================
  // DATABASE NODES
  // ============================================
  
  database_read: {
    canonicalType: 'database_read',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts:2030+
      throw new Error('[STUB] database_read execution not migrated. See execute-workflow.ts:2030');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 2030 },
    migrationStatus: 'pending',
  },
  
  database_write: {
    canonicalType: 'database_write',
    execute: async (ctx) => {
      // TODO: Migrate from execute-workflow.ts (database_write case)
      throw new Error('[STUB] database_write execution not migrated. See execute-workflow.ts');
    },
    legacyLocation: { file: 'worker/src/api/execute-workflow.ts', line: 0 },
    migrationStatus: 'pending',
  },
};

/**
 * Get execution stub for a node type
 */
export function getNodeExecutionStub(nodeType: string): typeof NODE_EXECUTION_STUBS[string] | undefined {
  return NODE_EXECUTION_STUBS[nodeType];
}

/**
 * Check if a node type has a stub (needs migration)
 */
export function hasExecutionStub(nodeType: string): boolean {
  return nodeType in NODE_EXECUTION_STUBS;
}

/**
 * Get all node types that need migration
 */
export function getUnmigratedNodeTypes(): string[] {
  return Object.keys(NODE_EXECUTION_STUBS).filter(
    type => NODE_EXECUTION_STUBS[type].migrationStatus !== 'complete'
  );
}
