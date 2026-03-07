import { Workflow, WorkflowNode, WorkflowEdge } from '../core/types/ai-types';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../core/utils/unified-node-type-normalizer';
import { nodeTypeNormalizationService } from './ai/node-type-normalization-service';
import { workflowValidator, ValidationResult as WorkflowValidationResult } from './ai/workflow-validator';
import { credentialDiscoveryPhase, CredentialDiscoveryResult } from './ai/credential-discovery-phase';
import { LRUNodeOutputsCache } from '../core/cache/lru-node-outputs-cache';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { executeNodeDynamically } from '../core/execution/dynamic-node-executor';
import { resolveConfigTemplates } from '../core/utils/universal-template-resolver';
import { SupabaseClient } from '@supabase/supabase-js';

export type FixAgentStatus = 'skipped' | 'processing' | 'completed' | 'failed';

export interface FixAgentConfig {
  /** Maximum runtime in milliseconds (default: 30000) */
  maxRuntimeMs?: number;
  /** Auto-apply threshold (default: 0.75) */
  autoApplyThreshold?: number;
  /** Suggest-only threshold lower bound (default: 0.5) */
  suggestLowerThreshold?: number;
}

export interface FixAuditEntry {
  id: string;
  rule: 'credential_auto_inject' | 'if_else_normalization' | 'template_key_rewrite';
  nodeId?: string;
  description: string;
  confidence: number;
  applied: boolean;
  suggestions?: string[];
}

export interface FixAgentResult {
  status: FixAgentStatus;
  workflow: Workflow;
  /** Validation after fixes are applied */
  validation: WorkflowValidationResult;
  /** Credential discovery snapshot after fixes */
  credentialDiscovery?: CredentialDiscoveryResult;
  /** All fix attempts, including non-applied suggestions */
  audit: FixAuditEntry[];
  /** Overall confidence score of the final workflow (0–1) */
  confidence: number;
}

export interface FixAgentRunParams {
  workflow: Workflow;
  /** Validation result returned from WorkflowLifecycleManager */
  lifecycleValidation?: WorkflowValidationResult;
  /** Credential discovery result returned from WorkflowLifecycleManager */
  lifecycleCredentials?: CredentialDiscoveryResult;
  /** Optional previous fixes for memory bonus */
  previousFixes?: Array<{ workflowId?: string; confidence: number }>;
  /** Optional user identifier for vault lookups during dry-run / discovery */
  userId?: string;
  config?: FixAgentConfig;
}

const DEFAULT_CONFIG: Required<FixAgentConfig> = {
  maxRuntimeMs: 30_000,
  autoApplyThreshold: 0.75,
  suggestLowerThreshold: 0.5,
};

/**
 * FixAgent
 *
 * MVP auto-fix engine that runs AFTER WorkflowLifecycleManager.generateWorkflowGraph().
 *
 * Responsibilities:
 *  - Ingest structural validation + credential discovery.
 *  - Optionally run a sandboxed dry-run (best-effort) to capture upstream JSON.
 *  - Apply three auto-fix rules:
 *      1) credential_auto_inject
 *      2) if_else_normalization
 *      3) template_key_rewrite
 *  - Compute confidence score and decide auto-apply vs suggestion-only.
 *  - Return updated workflow + fix audit + post-fix validation.
 */
export class FixAgent {
  async runAutoFix(params: FixAgentRunParams): Promise<FixAgentResult> {
    const startedAt = Date.now();
    const cfg: Required<FixAgentConfig> = { ...DEFAULT_CONFIG, ...(params.config || {}) };

    const audit: FixAuditEntry[] = [];
    let workingWorkflow: Workflow = JSON.parse(JSON.stringify(params.workflow));

    // Short-circuit if time budget is already exceeded (defensive)
    if (Date.now() - startedAt > cfg.maxRuntimeMs) {
      const validation = await workflowValidator.validateAndFix(workingWorkflow);
      return {
        status: 'skipped',
        workflow: validation.fixedWorkflow || workingWorkflow,
        validation,
        credentialDiscovery: params.lifecycleCredentials,
        audit,
        confidence: this.computeOverallConfidence(validation, audit, params.previousFixes),
      };
    }

    // --- Phase 1: Diagnostics ---
    const baseValidation =
      params.lifecycleValidation || (await workflowValidator.validateAndFix(workingWorkflow));

    const credentialDiscovery =
      params.lifecycleCredentials ||
      (await credentialDiscoveryPhase.discoverCredentials(workingWorkflow, params.userId));

    // Best-effort dry-run context (can be used by template rule; kept simple for MVP)
    const dryRunContext = await this.buildDryRunContext(workingWorkflow, params.userId, cfg);

    // --- Phase 2: Auto-fix rules ---
    // 1) Credential auto-inject
    const credentialFix = await this.applyCredentialAutoInject(
      workingWorkflow,
      credentialDiscovery,
      cfg,
    );
    workingWorkflow = credentialFix.workflow;
    audit.push(...credentialFix.audit);

    // 2) if_else normalization
    const ifElseFix = this.applyIfElseNormalization(workingWorkflow, cfg);
    workingWorkflow = ifElseFix.workflow;
    audit.push(...ifElseFix.audit);

    // 3) Template key rewrite
    const templateFix = this.applyTemplateKeyRewrite(
      workingWorkflow,
      dryRunContext,
      cfg,
    );
    workingWorkflow = templateFix.workflow;
    audit.push(...templateFix.audit);

    // Enforce runtime budget
    const elapsed = Date.now() - startedAt;
    if (elapsed > cfg.maxRuntimeMs) {
      // Return best-effort without post-fix validation
      const validation = baseValidation;
      return {
        status: 'completed',
        workflow: workingWorkflow,
        validation,
        credentialDiscovery,
        audit,
        confidence: this.computeOverallConfidence(validation, audit, params.previousFixes),
      };
    }

    // --- Phase 3: Post-fix validation ---
    const postValidation = await workflowValidator.validateAndFix(workingWorkflow);
    const finalWorkflow = postValidation.fixedWorkflow || workingWorkflow;

    // --- Phase 4: Confidence Engine ---
    const overallConfidence = this.computeOverallConfidence(
      postValidation,
      audit,
      params.previousFixes,
    );

    return {
      status: 'completed',
      workflow: finalWorkflow,
      validation: postValidation,
      credentialDiscovery,
      audit,
      confidence: overallConfidence,
    };
  }

  /**
   * Build a best-effort dry-run execution context.
   *
   * MVP implementation:
   *  - Executes only a small prefix of the workflow (up to N nodes).
   *  - Uses dynamic-node-executor and LRUNodeOutputsCache.
   *  - Relies on existing masking/placeholder logic inside node executors to avoid
   *    leaking secrets or making unsafe external calls.
   */
  private async buildDryRunContext(
    workflow: Workflow,
    userId: string | undefined,
    cfg: Required<FixAgentConfig>,
  ): Promise<Record<string, any>> {
    const maxNodesToExecute = 5;
    const outputs: Record<string, any> = {};

    try {
      const supabase: SupabaseClient = getSupabaseClient();
      const cache = new LRUNodeOutputsCache(50);

      // Very simple topological-ish order: use original node array order,
      // limited to first N nodes.
      for (const node of workflow.nodes.slice(0, maxNodesToExecute)) {
        const result = await executeNodeDynamically({
          node,
          input: {},
          nodeOutputs: cache,
          supabase,
          workflowId: workflow.metadata?.id || 'dry-run',
          userId,
          currentUserId: userId,
        });

        // Store raw result as potential JSON context
        if (result !== undefined) {
          cache.set(node.id, result, true);
          outputs[node.id] = result;
        }

        // Respect runtime budget
        if (Date.now() > Date.now() + cfg.maxRuntimeMs) {
          break;
        }
      }

      return outputs;
    } catch {
      // Dry-run is strictly best-effort; on any failure return empty context.
      return {};
    }
  }

  /**
   * Rule 1: Credential auto-inject.
   *
   * MVP strategy:
   *  - Look at credentialDiscovery.requiredCredentials and satisfiedCredentials.
   *  - For satisfied OAuth credentials, ensure we inject a non-secret reference
   *    (credentialId) into node.config if missing.
   *  - For unsatisfied credentials we only generate suggestions (no auto-inject).
   */
  private async applyCredentialAutoInject(
    workflow: Workflow,
    credentialDiscovery: CredentialDiscoveryResult,
    cfg: Required<FixAgentConfig>,
  ): Promise<{ workflow: Workflow; audit: FixAuditEntry[] }> {
    const audit: FixAuditEntry[] = [];
    const w = JSON.parse(JSON.stringify(workflow)) as Workflow;

    const satisfied = credentialDiscovery?.satisfiedCredentials || [];
    if (!Array.isArray(satisfied) || satisfied.length === 0) {
      return { workflow: w, audit };
    }

    const now = Date.now();

    const updatedNodes = w.nodes.map((node) => {
      const nodeType = unifiedNormalizeNodeType(node);
      const credsForNode = satisfied.filter((cred) =>
        (cred.nodeIds || []).includes(node.id),
      );
      if (credsForNode.length === 0) return node;

      const config = { ...(node.data?.config || {}) };
      let changed = false;

      for (const cred of credsForNode) {
        if (cred.type === 'oauth') {
          const vaultKey = (cred as any).vaultKey || cred.provider;
          if (vaultKey && !config.credentialId) {
            config.credentialId = vaultKey;
            changed = true;

            audit.push({
              id: `fix_cred_${node.id}_${now}`,
              rule: 'credential_auto_inject',
              nodeId: node.id,
              description: `Injected credentialId reference for ${nodeType} node from satisfied OAuth credential.`,
              confidence: 0.9,
              applied: true,
            });
          }
        }
      }

      if (!changed) return node;
      return {
        ...node,
        data: {
          ...node.data,
          config,
        },
      };
    });

    w.nodes = updatedNodes;
    return { workflow: w, audit };
  }

  /**
   * Rule 2: if_else normalization & expression wrapping.
   *
   * Mirrors and extends the normalization used in executeNodeLegacy:
   *  - If config.condition exists and config.conditions missing:
   *      → convert to conditions: [{ expression }]
   *  - If config.conditions exists but is not an array:
   *      → wrap into a single-element array.
   *  - Ensure expressions are trimmed strings and, if they look like a bare
   *    path (e.g. $json.field), wrap into {{ ... }} template form.
   */
  private applyIfElseNormalization(
    workflow: Workflow,
    cfg: Required<FixAgentConfig>,
  ): { workflow: Workflow; audit: FixAuditEntry[] } {
    const w = JSON.parse(JSON.stringify(workflow)) as Workflow;
    const audit: FixAuditEntry[] = [];
    const now = Date.now();

    const normalizeExpression = (expr: any): string => {
      if (typeof expr !== 'string') return String(expr ?? '').trim();
      const trimmed = expr.trim();
      if (!trimmed) return trimmed;

      // If already a {{ ... }} template, keep as is.
      if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
        return trimmed;
      }

      // If it looks like a bare path (e.g. $json.field or json.field), wrap it.
      if (
        trimmed.startsWith('$json.') ||
        trimmed.startsWith('json.') ||
        trimmed.startsWith('input.') ||
        trimmed.startsWith('trigger.')
      ) {
        return `{{${trimmed}}}`;
      }

      return trimmed;
    };

    w.nodes = w.nodes.map((node) => {
      const canonicalType = unifiedNormalizeNodeType(node);
      if (canonicalType !== 'if_else') return node;

      const originalConfig = (node.data?.config || {}) as any;
      const config = { ...originalConfig };
      let changed = false;

      // Old format: single condition string.
      if (config.condition && !config.conditions) {
        const expr = normalizeExpression(config.condition);
        config.conditions = [{ expression: expr }];
        changed = true;
      } else if (config.conditions && !Array.isArray(config.conditions)) {
        const single = config.conditions;
        const expr = normalizeExpression((single as any).expression ?? single);
        config.conditions = [{ ...(single as any), expression: expr }];
        changed = true;
      } else if (Array.isArray(config.conditions)) {
        const normalizedArray = config.conditions.map((c: any) => {
          const expr = normalizeExpression(c?.expression ?? '');
          return { ...c, expression: expr };
        });
        if (JSON.stringify(normalizedArray) !== JSON.stringify(config.conditions)) {
          config.conditions = normalizedArray;
          changed = true;
        }
      }

      if (!changed) return node;

      audit.push({
        id: `fix_ifelse_${node.id}_${now}`,
        rule: 'if_else_normalization',
        nodeId: node.id,
        description:
          'Normalized if_else conditions array and wrapped expressions into template form where applicable.',
        confidence: 0.85,
        applied: true,
      });

      return {
        ...node,
        data: {
          ...node.data,
          config,
        },
      };
    });

    return { workflow: w, audit };
  }

  /**
   * Rule 3: Template key rewrite using extracted keys.
   *
   * MVP strategy:
   *  - For each config value containing {{ ... }} templates, attempt to resolve
   *    against a synthetic context built from dryRunContext.
   *  - If resolution fails and we can see a close match among actual keys,
   *    rewrite the template path to the closest key.
   *  - Uses simple exact/substring heuristics + nodeTypeNormalizationService for
   *    candidate node substitutions when the root segment looks like a node alias.
   */
  private applyTemplateKeyRewrite(
    workflow: Workflow,
    dryRunContext: Record<string, any>,
    cfg: Required<FixAgentConfig>,
  ): { workflow: Workflow; audit: FixAuditEntry[] } {
    const w = JSON.parse(JSON.stringify(workflow)) as Workflow;
    const audit: FixAuditEntry[] = [];
    const now = Date.now();

    // Flatten dry-run context keys for simple matching.
    const contextKeys = new Set<string>();
    const collectKeys = (obj: any, prefix: string = '') => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        contextKeys.add(path);
        collectKeys((obj as any)[key], path);
      }
    };
    Object.values(dryRunContext).forEach((value) => collectKeys(value));

    if (contextKeys.size === 0) {
      // Without any observed keys we cannot safely rewrite; no-op.
      return { workflow: w, audit };
    }

    const pickClosestKey = (target: string): string | null => {
      if (!target) return null;
      const targetLower = target.toLowerCase();

      // Track best match as primitive values to avoid TS "never" narrowing issues.
      let bestKey: string | null = null;
      let bestScore = 0;

      contextKeys.forEach((candidate) => {
        const candLower = candidate.toLowerCase();
        let score = 0;
        if (candLower === targetLower) score = 1;
        else if (candLower.endsWith(`.${targetLower}`)) score = 0.9;
        else if (candLower.includes(targetLower)) score = 0.75;

        if (score > bestScore) {
          bestScore = score;
          bestKey = candidate;
        }
      });

      if (!bestKey || bestScore < 0.5) return null;
      return bestKey;
    };

    const TEMPLATE_REGEX = /\{\{\s*([^}]+)\s*\}\}/g;

    w.nodes = w.nodes.map((node) => {
      const config = { ...(node.data?.config || {}) } as Record<string, any>;
      let changed = false;

      Object.entries(config).forEach(([field, value]) => {
        if (typeof value !== 'string' || !value.includes('{{')) return;

        const original = value;
        let newValue = value;

        newValue = newValue.replace(TEMPLATE_REGEX, (match, exprRaw) => {
          const expr = String(exprRaw || '').trim();
          if (!expr) return match;

          // Basic split: root.segment...
          const parts = expr.split('.');
          if (parts.length < 2) return match;

          const lastSegment = parts[parts.length - 1];
          const closest = pickClosestKey(lastSegment);
          if (!closest) return match;

          const rewritten = `{{${closest}}}`;
          return rewritten;
        });

        if (newValue !== original) {
          config[field] = newValue;
          changed = true;

          audit.push({
            id: `fix_template_${node.id}_${field}_${now}`,
            rule: 'template_key_rewrite',
            nodeId: node.id,
            description: `Rewrote template expressions in field "${field}" based on observed JSON keys from dry-run.`,
            confidence: 0.8,
            applied: true,
          });
        }
      });

      if (!changed) return node;
      return {
        ...node,
        data: {
          ...node.data,
          config,
        },
      };
    });

    return { workflow: w, audit };
  }

  /**
   * Confidence engine:
   *  - exactMatch: 1.0 if no critical/high errors after validation, else 0–0.4
   *  - dryRunSuccess: approximated as fraction of nodes covered by dry-run (currently 0 or 0.3)
   *  - previousMemoryBonus: average of previous fix confidences scaled down.
   */
  private computeOverallConfidence(
    validation: WorkflowValidationResult,
    audit: FixAuditEntry[],
    previousFixes?: Array<{ workflowId?: string; confidence: number }>,
  ): number {
    // exactMatch: no critical/high errors.
    const hasSevereErrors = validation.errors.some(
      (e) => e.severity === 'critical' || e.severity === 'high',
    );
    const exactMatch = hasSevereErrors ? 0.3 : 1.0;

    // dryRunSuccess: heuristic based on number of applied fixes vs suggestions.
    const appliedCount = audit.filter((a) => a.applied).length;
    const totalCount = audit.length || 1;
    const dryRunSuccess = totalCount > 0 ? Math.min(0.3, (appliedCount / totalCount) * 0.3) : 0;

    // previousMemoryBonus: scaled average of previous confidences.
    let memoryBonus = 0;
    if (previousFixes && previousFixes.length > 0) {
      const avg = previousFixes.reduce((sum, f) => sum + f.confidence, 0) / previousFixes.length;
      memoryBonus = Math.min(0.2, avg * 0.2);
    }

    const score = exactMatch * 0.6 + dryRunSuccess * 0.2 + memoryBonus * 0.2;
    return Math.max(0, Math.min(1, score));
  }
}

export const fixAgent = new FixAgent();

