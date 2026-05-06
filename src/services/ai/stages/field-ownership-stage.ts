/**
 * Field Ownership Stage — AI-First Pipeline (Stage 10)
 *
 * Walks workflow.nodes, reads each node's inputSchema from the registry,
 * and extracts fillMode.default per field to build a fieldOwnershipMap.
 *
 * This stage never fails — worst case returns an empty map.
 *
 * Requirements: 2.7
 */

import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import { logger } from '../../../core/logger';
import type { Workflow } from '../../../core/types/ai-types';
import type { FieldFillMode } from '../../../core/types/unified-node-contract';

// ─── Types ───────────────────────────────────────────────────────────────────

/** nodeId → fieldName → FieldFillMode */
export type FieldOwnershipMap = Record<string, Record<string, FieldFillMode>>;

export interface FieldOwnershipStageResult {
  ok: true;
  fieldOwnershipMap: FieldOwnershipMap;
  durationMs: number;
}

// ─── Field Ownership Stage ────────────────────────────────────────────────────

export async function runFieldOwnershipStage(
  workflow: Workflow,
  correlationId?: string,
): Promise<FieldOwnershipStageResult> {
  const startedAt = Date.now();
  logger.info({
    event: 'ai_pipeline_stage_start',
    stage: 'field_ownership',
    correlationId,
    inputSummary: `nodes=${workflow.nodes.length}`,
  });

  const fieldOwnershipMap: FieldOwnershipMap = {};

  for (const node of workflow.nodes) {
    const nodeType = (node.data as any)?.type || node.type;
    const def = unifiedNodeRegistry.get(nodeType);
    const inputSchema = def?.inputSchema;

    if (!inputSchema) continue;

    const nodeFields: Record<string, FieldFillMode> = {};
    for (const [fieldName, fieldDef] of Object.entries(inputSchema)) {
      const fillMode: FieldFillMode = (fieldDef as any)?.fillMode?.default ?? 'manual_static';
      nodeFields[fieldName] = fillMode;
    }

    if (Object.keys(nodeFields).length > 0) {
      fieldOwnershipMap[node.id] = nodeFields;
    }
  }

  // ── Sync _fillMode into node configs ─────────────────────────────────────
  // Write registry-derived fill modes into each node's config._fillMode so the
  // UI toggle reflects the correct mode for every field. Preserves any entries
  // already stamped by property-population-stage.ts or plan-driven-workflow-builder.ts.
  for (const node of workflow.nodes) {
    const nodeId = node.id;
    const nodeFields = fieldOwnershipMap[nodeId];
    if (!nodeFields) continue;

    const config =
      node.data?.config && typeof node.data.config === 'object'
        ? (node.data.config as Record<string, any>)
        : {};

    const existing: Record<string, string> =
      typeof config._fillMode === 'object' && config._fillMode !== null
        ? { ...(config._fillMode as Record<string, string>) }
        : {};

    for (const [fieldName, fillMode] of Object.entries(nodeFields)) {
      // Only stamp when not already set by a prior stage — prior stage wins
      if (existing[fieldName] === undefined) {
        existing[fieldName] = fillMode;
      }
    }

    node.data.config = { ...config, _fillMode: existing };
  }
  // ─────────────────────────────────────────────────────────────────────────

  const durationMs = Date.now() - startedAt;
  const totalFields = Object.values(fieldOwnershipMap).reduce((sum, fields) => sum + Object.keys(fields).length, 0);

  logger.info({
    event: 'ai_pipeline_stage_end',
    stage: 'field_ownership',
    correlationId,
    outputSummary: `nodes=${Object.keys(fieldOwnershipMap).length}, fields=${totalFields}`,
    durationMs,
  });

  return { ok: true, fieldOwnershipMap, durationMs };
}
