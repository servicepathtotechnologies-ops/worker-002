/* eslint-disable no-console */
/**
 * Node Operation Contract Audit
 *
 * Verifies every registered node against the product contract:
 * registry definition -> schema/UI surface -> credential metadata -> execution path.
 *
 * This is intentionally static/code-level. It does not call third-party APIs or
 * claim live credential validation. It answers: "does this node/operation have
 * the code contract needed to be usable when credentials are present?"
 */

import fs from 'fs';
import path from 'path';

type AnyRecord = Record<string, any>;

type OperationAuditRow = {
  nodeType: string;
  label: string;
  category: string;
  executionKind: 'registry_direct' | 'legacy_delegate' | 'missing_execute';
  hasLegacyCase: boolean;
  legacyCaseAliases: string[];
  inputFieldCount: number;
  requiredInputs: string[];
  requiredInputsMissingFromSchema: string[];
  operationOptions: string[];
  resourceOptions: string[];
  operationCoverage: Array<{
    operation: string;
    status: 'explicit' | 'generic_operation_dispatch' | 'registry_direct_unproven' | 'missing_legacy_case' | 'not_referenced';
  }>;
  credentialProviders: string[];
  credentialFields: string[];
  uiStaticFallbackPresent: boolean;
  issues: Array<{ severity: 'critical' | 'warning'; message: string }>;
};

type AuditSummary = {
  generatedAt: string;
  nodeCount: number;
  criticalNodeCount: number;
  warningNodeCount: number;
  executableNodeCount: number;
  legacyDelegateCount: number;
  registryDirectCount: number;
  nodesWithOperations: number;
  operationCount: number;
  frontendStaticFallbackCount: number;
};

function readText(absPath: string): string {
  return fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : '';
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function fieldOptions(field: AnyRecord | undefined): string[] {
  if (!field || typeof field !== 'object') return [];
  const values: string[] = [];

  const uiOptions = field.ui?.options;
  if (Array.isArray(uiOptions)) {
    for (const opt of uiOptions) {
      if (typeof opt === 'string') values.push(opt);
      else if (opt && typeof opt.value === 'string') values.push(opt.value);
    }
  }

  if (Array.isArray(field.options)) {
    for (const opt of field.options) {
      if (typeof opt === 'string') values.push(opt);
      else if (opt && typeof opt.value === 'string') values.push(opt.value);
    }
  }

  if (Array.isArray(field.enum)) {
    values.push(...field.enum.filter((v: unknown): v is string => typeof v === 'string'));
  }

  if (Array.isArray(field.examples)) {
    values.push(...field.examples.filter((v: unknown): v is string => typeof v === 'string'));
  }

  if (typeof field.default === 'string') values.push(field.default);
  return uniq(values);
}

function extractFrontendStaticNodeTypes(repoRoot: string): Set<string> {
  const frontendNodeTypesPath = path.join(repoRoot, 'ctrl_checks', 'src', 'components', 'workflow', 'nodeTypes.ts');
  const source = readText(frontendNodeTypesPath);
  const types = new Set<string>();
  const re = /\{\s*type:\s*['"]([a-zA-Z0-9_]+)['"]\s*,\s*label:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    types.add(m[1]);
  }
  return types;
}

function hasSchemaDrivenFrontend(repoRoot: string): boolean {
  return fs.existsSync(path.join(repoRoot, 'ctrl_checks', 'src', 'services', 'nodeSchemaService.ts'));
}

function extractTopLevelLegacyCases(executeWorkflowSource: string): Array<{ type: string; index: number }> {
  const legacyStart = executeWorkflowSource.indexOf('export async function executeNodeLegacy');
  const source = legacyStart >= 0 ? executeWorkflowSource.slice(legacyStart) : executeWorkflowSource;
  const switchStart = source.indexOf('switch (type)');
  const switchSource = switchStart >= 0 ? source.slice(switchStart) : source;
  const cases: Array<{ type: string; index: number }> = [];
  const re = /^    case\s+'([^']+)'\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(switchSource))) {
    cases.push({ type: m[1], index: m.index });
  }
  return cases;
}

function legacyCaseBlock(
  executeWorkflowSource: string,
  cases: Array<{ type: string; index: number }>,
  candidateTypes: string[],
): { found: boolean; aliases: string[]; block: string } {
  const legacyStart = executeWorkflowSource.indexOf('export async function executeNodeLegacy');
  const source = legacyStart >= 0 ? executeWorkflowSource.slice(legacyStart) : executeWorkflowSource;
  const switchStart = source.indexOf('switch (type)');
  const switchSource = switchStart >= 0 ? source.slice(switchStart) : source;

  const matches = cases.filter((c) => candidateTypes.includes(c.type));
  if (matches.length === 0) return { found: false, aliases: [], block: '' };

  const first = matches[0];
  const startIndex = first.index;
  let nextIndex = cases.find((c) => c.index > startIndex)?.index ?? switchSource.length;
  let block = switchSource.slice(startIndex, nextIndex);

  // Handle shared cases such as:
  // case 'database_read':
  // case 'database_write': { ... }
  let guard = 0;
  while (!/[{]|return\s|break\s*;/.test(block) && guard < 50) {
    const next = cases.find((c) => c.index >= nextIndex);
    if (!next) break;
    const afterNext = cases.find((c) => c.index > next.index)?.index ?? switchSource.length;
    block += switchSource.slice(next.index, afterNext);
    nextIndex = afterNext;
    guard += 1;
  }

  return {
    found: true,
    aliases: matches.map((m) => m.type),
    block,
  };
}

function operationCoverageForNode(args: {
  executionKind: OperationAuditRow['executionKind'];
  hasLegacyCase: boolean;
  legacyBlock: string;
  operations: string[];
}): OperationAuditRow['operationCoverage'] {
  const { executionKind, hasLegacyCase, legacyBlock, operations } = args;
  return operations.map((operation) => {
    if (executionKind === 'registry_direct') {
      return { operation, status: 'registry_direct_unproven' };
    }
    if (!hasLegacyCase) {
      return { operation, status: 'missing_legacy_case' };
    }
    const escaped = operation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const explicit = new RegExp(`['"\`]${escaped}['"\`]`).test(legacyBlock);
    if (explicit) return { operation, status: 'explicit' };
    if (/\bexecute[A-Za-z0-9_]*Node\b|\brun[A-Za-z0-9_]*Node\b/.test(legacyBlock)) {
      return { operation, status: 'generic_operation_dispatch' };
    }
    if (operations.length === 1 && (/\bfetch\s*\(/.test(legacyBlock) || /\bresult\s*=/.test(legacyBlock))) {
      return { operation, status: 'generic_operation_dispatch' };
    }
    if (/\boperation\b/.test(legacyBlock)) return { operation, status: 'generic_operation_dispatch' };
    return { operation, status: 'not_referenced' };
  });
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const workerRoot = path.join(repoRoot, 'worker');
  const outDirArg = process.argv.includes('--out-dir')
    ? process.argv[process.argv.indexOf('--out-dir') + 1]
    : path.join(workerRoot, 'tmp', 'node-operation-contract-audit');
  const outDir = path.resolve(workerRoot, outDirArg);

  const originalLog = console.log;
  const quiet = !process.argv.includes('--verbose');
  if (quiet) console.log = () => undefined;
  // Dynamic require lets us suppress registry bootstrap noise.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { unifiedNodeRegistry } = require('../src/core/registry/unified-node-registry');
  if (quiet) console.log = originalLog;

  const executeWorkflowSource = readText(path.join(workerRoot, 'src', 'api', 'execute-workflow.ts'));
  const legacyCases = extractTopLevelLegacyCases(executeWorkflowSource);
  const frontendStaticTypes = extractFrontendStaticNodeTypes(repoRoot);
  const schemaDrivenFrontend = hasSchemaDrivenFrontend(repoRoot);
  const nodeTypes = unifiedNodeRegistry.getAllTypes().sort() as string[];

  const rows: OperationAuditRow[] = [];

  for (const nodeType of nodeTypes) {
    const def = unifiedNodeRegistry.get(nodeType);
    if (!def) continue;

    const executeSource = typeof def.execute === 'function' ? String(def.execute) : '';
    const executionKind: OperationAuditRow['executionKind'] =
      !executeSource
        ? 'missing_execute'
        : executeSource.includes('executeViaLegacyExecutor')
          ? 'legacy_delegate'
          : 'registry_direct';

    const aliases = uniq([
      nodeType,
      ...(Array.isArray(def.aliases) ? def.aliases : []),
      ...(nodeType === 'respond_to_webhook' ? ['webhook_response'] : []),
      ...(nodeType === 'form' ? ['form_trigger'] : []),
      ...(nodeType === 'zoho_crm' ? ['zoho'] : []),
      ...(nodeType === 'postgresql' ? ['postgres'] : []),
    ]);
    const legacy = legacyCaseBlock(executeWorkflowSource, legacyCases, aliases);
    const inputSchema = (def.inputSchema || {}) as Record<string, AnyRecord>;
    const operationOptions = fieldOptions(inputSchema.operation);
    const resourceOptions = fieldOptions(inputSchema.resource);
    const requiredInputs = Array.isArray(def.requiredInputs) ? def.requiredInputs : [];
    const requiredInputsMissingFromSchema = requiredInputs.filter((f: string) => !inputSchema[f]);
    const credentialProviders = uniq((def.credentialSchema?.requirements || []).map((r: AnyRecord) => String(r.provider || '')));
    const credentialFields = uniq(def.credentialSchema?.credentialFields || []);

    const operationCoverage = operationCoverageForNode({
      executionKind,
      hasLegacyCase: legacy.found,
      legacyBlock: legacy.block,
      operations: operationOptions,
    });

    const issues: OperationAuditRow['issues'] = [];
    if (executionKind === 'missing_execute') {
      issues.push({ severity: 'critical', message: 'Node has no execute function in UnifiedNodeRegistry.' });
    }
    if (executionKind === 'legacy_delegate' && !legacy.found) {
      issues.push({
        severity: 'critical',
        message: 'Node delegates to legacy executor but execute-workflow.ts has no matching case for the node or alias.',
      });
    }
    if (requiredInputsMissingFromSchema.length > 0) {
      issues.push({
        severity: 'critical',
        message: `requiredInputs not present in inputSchema: ${requiredInputsMissingFromSchema.join(', ')}`,
      });
    }
    const notReferenced = operationCoverage.filter((op) => op.status === 'not_referenced');
    if (notReferenced.length > 0) {
      issues.push({
        severity: 'warning',
        message: `Operation options not referenced in executor block: ${notReferenced.map((op) => op.operation).join(', ')}`,
      });
    }
    if (operationOptions.length > 0 && inputSchema.operation?.ui?.options?.length === undefined) {
      issues.push({
        severity: 'warning',
        message: 'Operation values exist only as defaults/examples; no schema-driven UI options were found.',
      });
    }
    if (credentialFields.length > 0 && credentialProviders.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'Credential fields are listed but no credential provider requirement is declared.',
      });
    }
    if (!frontendStaticTypes.has(nodeType) && !schemaDrivenFrontend) {
      issues.push({
        severity: 'warning',
        message: 'Node is not present in legacy frontend NODE_TYPES fallback; schema-driven backend UI must be available.',
      });
    }

    rows.push({
      nodeType,
      label: def.label,
      category: def.category,
      executionKind,
      hasLegacyCase: legacy.found,
      legacyCaseAliases: legacy.aliases,
      inputFieldCount: Object.keys(inputSchema).length,
      requiredInputs,
      requiredInputsMissingFromSchema,
      operationOptions,
      resourceOptions,
      operationCoverage,
      credentialProviders,
      credentialFields,
      uiStaticFallbackPresent: frontendStaticTypes.has(nodeType),
      issues,
    });
  }

  const summary: AuditSummary = {
    generatedAt: new Date().toISOString(),
    nodeCount: rows.length,
    criticalNodeCount: rows.filter((r) => r.issues.some((i) => i.severity === 'critical')).length,
    warningNodeCount: rows.filter((r) => r.issues.some((i) => i.severity === 'warning')).length,
    executableNodeCount: rows.filter((r) => !r.issues.some((i) => i.severity === 'critical')).length,
    legacyDelegateCount: rows.filter((r) => r.executionKind === 'legacy_delegate').length,
    registryDirectCount: rows.filter((r) => r.executionKind === 'registry_direct').length,
    nodesWithOperations: rows.filter((r) => r.operationOptions.length > 0).length,
    operationCount: rows.reduce((sum, r) => sum + r.operationOptions.length, 0),
    frontendStaticFallbackCount: rows.filter((r) => r.uiStaticFallbackPresent).length,
  };

  fs.mkdirSync(outDir, { recursive: true });
  const json = { summary, rows };
  fs.writeFileSync(path.join(outDir, 'node-operation-contract-audit.json'), JSON.stringify(json, null, 2));

  const csvHeader = [
    'nodeType',
    'label',
    'category',
    'executionKind',
    'hasLegacyCase',
    'operationCount',
    'operations',
    'resourceCount',
    'resources',
    'credentialProviders',
    'credentialFields',
    'uiStaticFallbackPresent',
    'criticalIssues',
    'warnings',
  ];
  const esc = (value: unknown) => {
    const s = Array.isArray(value) ? value.join('|') : String(value ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csvRows = rows.map((r) => [
    r.nodeType,
    r.label,
    r.category,
    r.executionKind,
    r.hasLegacyCase,
    r.operationOptions.length,
    r.operationOptions,
    r.resourceOptions.length,
    r.resourceOptions,
    r.credentialProviders,
    r.credentialFields,
    r.uiStaticFallbackPresent,
    r.issues.filter((i) => i.severity === 'critical').map((i) => i.message),
    r.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
  ]);
  fs.writeFileSync(
    path.join(outDir, 'node-operation-contract-audit.csv'),
    [csvHeader.join(','), ...csvRows.map((row) => row.map(esc).join(','))].join('\n') + '\n',
  );

  const criticalRows = rows.filter((r) => r.issues.some((i) => i.severity === 'critical'));
  const warningRows = rows.filter((r) => r.issues.some((i) => i.severity === 'warning'));
  let md = '# Node Operation Contract Audit\n\n';
  md += `Generated: ${summary.generatedAt}\n\n`;
  md += '## Summary\n\n';
  md += `- Registered nodes: ${summary.nodeCount}\n`;
  md += `- Nodes without critical execution/schema issues: ${summary.executableNodeCount}\n`;
  md += `- Nodes with critical issues: ${summary.criticalNodeCount}\n`;
  md += `- Nodes with warnings: ${summary.warningNodeCount}\n`;
  md += `- Nodes declaring operations: ${summary.nodesWithOperations}\n`;
  md += `- Declared operation values: ${summary.operationCount}\n`;
  md += `- Registry-direct execute nodes: ${summary.registryDirectCount}\n`;
  md += `- Legacy-delegate execute nodes: ${summary.legacyDelegateCount}\n`;
  md += `- Legacy frontend fallback nodes: ${summary.frontendStaticFallbackCount}\n\n`;

  md += '## Critical Nodes\n\n';
  if (criticalRows.length === 0) {
    md += 'No critical node contract issues found.\n\n';
  } else {
    for (const r of criticalRows) {
      md += `### ${r.nodeType}\n\n`;
      md += `- Execution: ${r.executionKind}${r.hasLegacyCase ? ` via ${r.legacyCaseAliases.join('|')}` : ''}\n`;
      md += `- Operations: ${r.operationOptions.length > 0 ? r.operationOptions.join(', ') : '(none declared)'}\n`;
      for (const issue of r.issues.filter((i) => i.severity === 'critical')) {
        md += `- Critical: ${issue.message}\n`;
      }
      md += '\n';
    }
  }

  md += '## Warning Sample\n\n';
  for (const r of warningRows.slice(0, 40)) {
    md += `- ${r.nodeType}: ${r.issues.filter((i) => i.severity === 'warning').map((i) => i.message).join(' | ')}\n`;
  }
  if (warningRows.length > 40) md += `- ... ${warningRows.length - 40} more nodes with warnings in JSON/CSV.\n`;

  fs.writeFileSync(path.join(outDir, 'NODE_OPERATION_CONTRACT_AUDIT.md'), md);

  console.log(JSON.stringify(summary, null, 2));
  if (criticalRows.length > 0 && process.argv.includes('--fail-on-critical')) {
    process.exit(1);
  }
}

main();
