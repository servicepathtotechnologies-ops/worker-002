/**
 * Builds a unified snapshot of registry fields + credential wizard questions (single-node workflow per type).
 * Used by dump script and tests.
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import { generateComprehensiveNodeQuestions } from '../../services/ai/comprehensive-node-questions-generator';
import type { Workflow } from '../types/ai-types';
import { isCredentialQuestionCategory } from './field-help-metadata';

export interface RegistryFieldRow {
  nodeType: string;
  nodeCategory: string;
  fieldName: string;
  fieldType: string;
  required?: boolean;
  role?: string;
  fillModeDefault?: string;
  helpCategory?: string;
  docsUrl?: string;
  exampleValue?: string;
  credentialFieldListed: boolean;
  credentialQuestionCategory: boolean;
}

export interface CredentialQuestionRow {
  nodeType: string;
  fieldName?: string;
  category: string;
  questionType?: string;
  askOrder?: number;
  required?: boolean;
}

export interface UnifiedFieldRow extends RegistryFieldRow {
  willAskCredentialQuestion: boolean;
  credentialQuestionMatches: CredentialQuestionRow[];
}

export interface FieldGuidanceInventoryPayload {
  generatedAt: string;
  nodeCount: number;
  fieldRowCount: number;
  credentialQuestionCount: number;
  fields: RegistryFieldRow[];
  credentialQuestions: CredentialQuestionRow[];
  unifiedFields: UnifiedFieldRow[];
}

function singleNodeWorkflow(nodeType: string, category: string): Workflow {
  return {
    nodes: [
      {
        id: `node_${nodeType}`,
        type: nodeType,
        data: {
          label: nodeType,
          type: nodeType,
          category,
          config: {},
        },
      },
    ],
    edges: [],
  };
}

export function buildFieldGuidanceInventoryPayload(): FieldGuidanceInventoryPayload {
  const types = unifiedNodeRegistry.getAllTypes().sort();
  const fields: RegistryFieldRow[] = [];
  const credentialQuestions: CredentialQuestionRow[] = [];

  for (const nodeType of types) {
    const def = unifiedNodeRegistry.get(nodeType);
    if (!def) continue;
    const credSet = new Set(def.credentialSchema?.credentialFields || []);
    const category = def.category;

    for (const [fieldName, field] of Object.entries(def.inputSchema || {})) {
      const helpCategory = field.helpCategory;
      fields.push({
        nodeType,
        nodeCategory: category,
        fieldName,
        fieldType: field.type,
        required: field.required,
        role: field.role,
        fillModeDefault: field.fillMode?.default,
        helpCategory,
        docsUrl: field.docsUrl,
        exampleValue: field.exampleValue,
        credentialFieldListed: credSet.has(fieldName),
        credentialQuestionCategory: isCredentialQuestionCategory(helpCategory),
      });
    }
  }

  for (const nodeType of types) {
    const def = unifiedNodeRegistry.get(nodeType);
    if (!def) continue;
    const wf = singleNodeWorkflow(nodeType, def.category);
    const { questions } = generateComprehensiveNodeQuestions(wf, {}, { categories: ['credential'] });
    for (const q of questions) {
      credentialQuestions.push({
        nodeType: q.nodeType,
        fieldName: q.fieldName,
        category: q.category,
        questionType: q.type,
        askOrder: q.askOrder,
        required: q.required,
      });
    }
  }

  const qByNodeField = new Map<string, CredentialQuestionRow[]>();
  for (const q of credentialQuestions) {
    const key = `${q.nodeType}::${q.fieldName ?? ''}`;
    if (!qByNodeField.has(key)) qByNodeField.set(key, []);
    qByNodeField.get(key)!.push(q);
  }

  const unifiedFields: UnifiedFieldRow[] = fields.map((row) => {
    const key = `${row.nodeType}::${row.fieldName}`;
    const matches = qByNodeField.get(key) ?? [];
    return {
      ...row,
      willAskCredentialQuestion: matches.length > 0,
      credentialQuestionMatches: matches,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    nodeCount: types.length,
    fieldRowCount: fields.length,
    credentialQuestionCount: credentialQuestions.length,
    fields,
    credentialQuestions,
    unifiedFields,
  };
}
