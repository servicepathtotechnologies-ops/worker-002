/**
 * Capability-Based Node Selection Flow — Shared Type Contracts
 *
 * All interfaces shared across the capability selection pipeline stages:
 * Intent_Analyzer, Capability_Grouper, and Structural_Prompt_Generator.
 *
 * Requirements: 1.3, 2.2, 2.8, 4.3
 */

import type { Workflow } from '../../../core/types/ai-types';

// ─── Re-export Workflow for convenience ──────────────────────────────────────

export type { Workflow };

// ─── LLM Call Metadata ───────────────────────────────────────────────────────

export interface LlmCallMeta {
  model: string;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

// ─── Use-Case Unit ────────────────────────────────────────────────────────────

export interface UseCaseUnit {
  /** Stable UUID for this unit within the pipeline run. */
  unitId: string;
  /** Human-readable label, e.g. "Trigger: new email received". */
  label: string;
  /** Semantic role of this unit in the workflow. */
  semanticRole: 'trigger' | 'data_source' | 'communication' | 'transformation' | 'output' | 'logic';
  /** Natural language description of what this unit must accomplish. */
  description: string;
  /** Zero-based position in the ordered list produced by the Intent_Analyzer. */
  orderIndex: number;
}

// ─── Intent Analysis ─────────────────────────────────────────────────────────

export interface IntentAnalysisResult {
  ok: true;
  units: UseCaseUnit[];
  /** SHA-256 of the input prompt (for structured logging). */
  promptHash: string;
  durationMs: number;
  llmCall: LlmCallMeta;
}

export interface IntentAnalysisError {
  ok: false;
  code: 'EMPTY_UNIT_LIST' | 'INVALID_LLM_RESPONSE' | 'LLM_CALL_FAILED';
  message: string;
  durationMs: number;
}

export type IntentAnalysisOutput = IntentAnalysisResult | IntentAnalysisError;

// ─── Capability Grouping ──────────────────────────────────────────────────────

export interface CandidateNode {
  /** Registry key, e.g. "google_gmail". */
  nodeType: string;
  /** From unifiedNodeRegistry.get(nodeType).label */
  label: string;
  /** From unifiedNodeRegistry.get(nodeType).description */
  description: string;
  /** From unifiedNodeRegistry.getRequiredCredentials(nodeType) */
  credentialRequirements: string[];
  /** Derived from credential vault check at request time. */
  hasCredentials: boolean;
}

export interface CapabilityContainer {
  /** Stable UUID for this container. */
  containerId: string;
  /** Human-readable label, e.g. "Send Email". */
  label: string;
  useCaseUnit: UseCaseUnit;
  /** Ordered list of candidates; no pre-selection. */
  candidates: CandidateNode[];
}

export interface CapabilityGroupingResult {
  ok: true;
  /** One container per Use_Case_Unit, in the same order as the input list. */
  containers: CapabilityContainer[];
  durationMs: number;
}

export interface CapabilityGroupingError {
  ok: false;
  code: 'EMPTY_CONTAINER' | 'INVALID_LLM_RESPONSE' | 'LLM_CALL_FAILED';
  /** The unitId of the Use_Case_Unit that caused the failure. */
  failedUnitId: string;
  message: string;
  durationMs: number;
}

// ─── Node Selection ───────────────────────────────────────────────────────────

export interface NodeSelection {
  containerId: string;
  useCaseUnit: UseCaseUnit;
  selectedNodeType: string;
}

/** containerId → selected nodeType */
export type NodeSelectionMap = Record<string, string>;

// ─── Structural Prompt Generation ─────────────────────────────────────────────

export interface StructuralPromptGenerationInput {
  userPrompt: string;
  /** Ordered by Use_Case_Unit.orderIndex. */
  orderedSelections: NodeSelection[];
  /** NodeCatalogText assembled by buildNodeCatalogText(). */
  nodeCatalog: string;
  correlationId?: string;
}

export interface StructuralPromptGenerationResult {
  ok: true;
  structuralPrompt: string;
  /** Preview-only workflow — nodes hydrated from registry, edges empty. Real graph built in confirm.ts. */
  workflow: Workflow;
  selectedNodeTypes: string[];
  nodeCount: number;
  edgeCount: number;
  durationMs: number;
  llmCall: LlmCallMeta;
}

export interface StructuralPromptGenerationError {
  ok: false;
  code: 'INVALID_LLM_RESPONSE' | 'ORCHESTRATOR_VALIDATION_FAILED' | 'LLM_CALL_FAILED';
  message: string;
  durationMs: number;
}
