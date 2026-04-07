/**
 * Node type normalization for planner/intent/structure layers.
 * Combines fixed abstract user-facing names with pattern-based resolution (node-type-normalizer).
 */

import { nodeLibrary } from '../nodes/node-library';
import { normalizeNodeType as resolveNodeTypeFromPatterns } from './node-type-normalizer';
import type { StructuredIntent } from './intent-structurer';
import type { WorkflowStructure } from './workflow-structure-builder';
import type { Workflow } from '../../core/types/ai-types';

export type NormalizeNodeTypeMethod = 'abstract_mapping' | 'pattern' | 'exact';

export interface NormalizeNodeTypeResult {
  valid: boolean;
  normalized: string;
  method?: NormalizeNodeTypeMethod;
}

export interface TypeReplacement {
  original: string;
  normalized: string;
  context?: string;
}

export interface NormalizeStructuredIntentResult {
  success: boolean;
  normalizedIntent?: StructuredIntent;
  replacements: TypeReplacement[];
  errors: string[];
}

export interface NormalizeWorkflowStructureResult {
  success: boolean;
  normalizedStructure?: WorkflowStructure;
  errors: string[];
}

export interface NormalizeWorkflowResult {
  success: boolean;
  normalizedWorkflow?: Workflow;
  errors: string[];
}

/** User-facing / planner synonyms → canonical registered types */
const ABSTRACT_TYPE_MAP: Record<string, string> = {
  ai_summary: 'text_summarizer',
  ai_summarization: 'text_summarizer',
  ai_email: 'google_gmail',
  spreadsheet: 'google_sheets',
};

class NodeTypeNormalizationService {
  normalizeNodeType(raw: string): NormalizeNodeTypeResult {
    const trimmed = (raw || '').trim();
    if (!trimmed) {
      return { valid: false, normalized: '' };
    }

    const lower = trimmed.toLowerCase();
    const abstractTarget = ABSTRACT_TYPE_MAP[lower];
    if (abstractTarget) {
      const valid = nodeLibrary.isNodeTypeRegistered(abstractTarget);
      return { valid, normalized: abstractTarget, method: 'abstract_mapping' };
    }

    const resolved = resolveNodeTypeFromPatterns(trimmed);
    const valid = nodeLibrary.isNodeTypeRegistered(resolved);
    const method: NormalizeNodeTypeMethod | undefined =
      valid && resolved.toLowerCase() === lower ? 'exact' : valid ? 'pattern' : undefined;
    return { valid, normalized: resolved, method };
  }

  normalizeStructuredIntent(intent: StructuredIntent): NormalizeStructuredIntentResult {
    const replacements: TypeReplacement[] = [];
    const errors: string[] = [];

    const triggerResult = this.normalizeNodeType(intent.trigger);
    let trigger = intent.trigger;
    if (!triggerResult.valid) {
      errors.push(`Invalid trigger type: "${intent.trigger}"`);
    } else {
      if (triggerResult.normalized !== intent.trigger) {
        replacements.push({
          original: intent.trigger,
          normalized: triggerResult.normalized,
          context: 'trigger',
        });
      }
      trigger = triggerResult.normalized;
    }

    const actions = intent.actions.map((action, index) => {
      const r = this.normalizeNodeType(action.type);
      if (!r.valid) {
        errors.push(`Invalid action type at [${index}]: "${action.type}"`);
        return action;
      }
      if (r.normalized !== action.type) {
        replacements.push({
          original: action.type,
          normalized: r.normalized,
          context: `actions[${index}]`,
        });
      }
      return { ...action, type: r.normalized };
    });

    if (errors.length > 0) {
      return { success: false, replacements, errors };
    }

    const normalizedIntent: StructuredIntent = {
      ...intent,
      trigger,
      actions,
    };

    return { success: true, normalizedIntent, replacements, errors: [] };
  }

  normalizeWorkflowStructure(structure: WorkflowStructure): NormalizeWorkflowStructureResult {
    const errors: string[] = [];
    const nodes = structure.nodes.map((node, index) => {
      const r = this.normalizeNodeType(node.type);
      if (!r.valid) {
        errors.push(`Invalid node type at nodes[${index}] (id=${node.id}): "${node.type}"`);
        return node;
      }
      return { ...node, type: r.normalized };
    });

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return {
      success: true,
      normalizedStructure: { ...structure, nodes },
      errors: [],
    };
  }

  normalizeWorkflow(workflow: Workflow): NormalizeWorkflowResult {
    const errors: string[] = [];
    const nodes = workflow.nodes.map((node, index) => {
      const logicalType = node.data?.type || node.type;
      const r = this.normalizeNodeType(logicalType);
      if (!r.valid) {
        errors.push(`Invalid node type at nodes[${index}] (id=${node.id}): "${logicalType}"`);
        return node;
      }
      if (r.normalized === logicalType) {
        return node;
      }
      return {
        ...node,
        data: {
          ...node.data,
          type: r.normalized,
        },
      };
    });

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return {
      success: true,
      normalizedWorkflow: { ...workflow, nodes },
      errors: [],
    };
  }

  validateAndNormalizeIntent(intent: StructuredIntent): StructuredIntent {
    const r = this.normalizeStructuredIntent(intent);
    if (!r.success || !r.normalizedIntent) {
      throw new Error(r.errors.join('; ') || 'Intent normalization failed');
    }
    return r.normalizedIntent;
  }

  validateAndNormalizeStructure(structure: WorkflowStructure): WorkflowStructure {
    const r = this.normalizeWorkflowStructure(structure);
    if (!r.success || !r.normalizedStructure) {
      throw new Error(r.errors.join('; ') || 'Structure normalization failed');
    }
    return r.normalizedStructure;
  }

  validateAndNormalizeWorkflow(workflow: Workflow): Workflow {
    const r = this.normalizeWorkflow(workflow);
    if (!r.success || !r.normalizedWorkflow) {
      throw new Error(r.errors.join('; ') || 'Workflow normalization failed');
    }
    return r.normalizedWorkflow;
  }
}

export const nodeTypeNormalizationService = new NodeTypeNormalizationService();
