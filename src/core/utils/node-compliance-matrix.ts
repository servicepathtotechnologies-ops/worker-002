/**
 * Node compliance matrix: one row per (nodeType × input field) from UnifiedNodeRegistry.
 * Used for audits, spreadsheets, and CI gates (credentials, runtime AI, overrides).
 */

import { unifiedNodeRegistry } from '../registry/unified-node-registry';
import {
  getNodeTypesWithExecuteOverrides,
  hasRegistryExecuteOverride,
} from '../registry/unified-node-registry-overrides';
import type { UnifiedNodeDefinition } from '../types/unified-node-contract';

export interface NodeComplianceFieldRow {
  nodeType: string;
  nodeLabel: string;
  nodeCategory: string;
  nodeVersion: string;
  isBranching: boolean;
  incomingPorts: string;
  outgoingPorts: string;
  fieldName: string;
  fieldType: string;
  schemaRequired: boolean;
  requiredInputsMember: boolean;
  essentialForExecution: boolean;
  fillModeDefault: string;
  supportsRuntimeAI: boolean;
  supportsBuildtimeAI: boolean;
  role: string;
  helpCategory: string;
  uiOptionsCount: number;
  uiWidget?: string;
  credentialFieldListed: boolean;
  credentialRequirementsCount: number;
  credentialProviders: string;
  executeImplementation: 'registry_override' | 'default_legacy_delegate';
}

export interface NodeComplianceSummary {
  generatedAt: string;
  nodeCount: number;
  fieldRowCount: number;
  overrideTypeCount: number;
  nodes: Array<{
    nodeType: string;
    label: string;
    category: string;
    requiredInputs: string[];
    executeImplementation: NodeComplianceFieldRow['executeImplementation'];
  }>;
  fields: NodeComplianceFieldRow[];
}

function summarizeCredentials(def: UnifiedNodeDefinition): {
  count: number;
  providers: string;
  fieldSet: Set<string>;
} {
  const cs = def.credentialSchema;
  if (!cs) {
    return { count: 0, providers: '', fieldSet: new Set() };
  }
  const providers = [...new Set((cs.requirements || []).map((r) => r.provider).filter(Boolean))].sort().join('|');
  return {
    count: cs.requirements?.length ?? 0,
    providers,
    fieldSet: new Set(cs.credentialFields || []),
  };
}

export function buildNodeComplianceMatrix(): NodeComplianceSummary {
  const types = unifiedNodeRegistry.getAllTypes().sort();
  const overrideTypes = new Set(getNodeTypesWithExecuteOverrides());
  const fields: NodeComplianceFieldRow[] = [];
  const nodes: NodeComplianceSummary['nodes'] = [];

  for (const nodeType of types) {
    const def = unifiedNodeRegistry.get(nodeType);
    if (!def) continue;

    const cred = summarizeCredentials(def);
    const requiredSet = new Set(def.requiredInputs || []);
    const execImpl: NodeComplianceFieldRow['executeImplementation'] = hasRegistryExecuteOverride(nodeType)
      ? 'registry_override'
      : 'default_legacy_delegate';

    nodes.push({
      nodeType,
      label: def.label,
      category: def.category,
      requiredInputs: [...requiredSet],
      executeImplementation: execImpl,
    });

    for (const [fieldName, field] of Object.entries(def.inputSchema || {})) {
      const fm = field.fillMode;
      fields.push({
        nodeType,
        nodeLabel: def.label,
        nodeCategory: def.category,
        nodeVersion: def.version,
        isBranching: !!def.isBranching,
        incomingPorts: (def.incomingPorts || []).join('|'),
        outgoingPorts: (def.outgoingPorts || []).join('|'),
        fieldName,
        fieldType: field.type,
        schemaRequired: !!field.required,
        requiredInputsMember: requiredSet.has(fieldName),
        essentialForExecution: field.essentialForExecution === true,
        fillModeDefault: fm?.default ?? '',
        supportsRuntimeAI: fm ? fm.supportsRuntimeAI !== false : false,
        supportsBuildtimeAI: fm?.supportsBuildtimeAI === true,
        role: field.role ?? '',
        helpCategory: field.helpCategory ?? '',
        uiOptionsCount: field.ui?.options?.length ?? 0,
        uiWidget: field.ui?.widget,
        credentialFieldListed: cred.fieldSet.has(fieldName),
        credentialRequirementsCount: cred.count,
        credentialProviders: cred.providers,
        executeImplementation: execImpl,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    nodeCount: nodes.length,
    fieldRowCount: fields.length,
    overrideTypeCount: overrideTypes.size,
    nodes,
    fields,
  };
}

/** CSV with header; safe for Excel / Google Sheets. */
export function complianceMatrixToCsv(matrix: NodeComplianceSummary): string {
  if (matrix.fields.length === 0) {
    return 'nodeType,fieldName\n';
  }
  const headers = Object.keys(matrix.fields[0]) as (keyof NodeComplianceFieldRow)[];
  const esc = (v: unknown): string => {
    if (v === undefined || v === null) return '';
    const s = String(v);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of matrix.fields) {
    lines.push(headers.map((h) => esc(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}
