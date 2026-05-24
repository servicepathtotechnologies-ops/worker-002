export type FieldOwnershipGuidanceSections = {
  whatThisFieldDoes: string;
  ifYouChooseYou: string;
  ifYouChooseAIBuild: string;
  ifYouChooseAIRuntime: string;
  isActuallyRequired: string;
  whereToGetValue: string;
  nextStepExpectations: string;
};

import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { buildFieldGuidanceDescription } from '../../core/utils/node-field-intelligence';

type GuideContext = {
  selectedField?: { nodeId?: string; fieldName?: string } | null;
  selectedRow?: Record<string, unknown> | null;
  selectedNode?: Record<string, unknown> | null;
  selectedFieldSchema?: Record<string, unknown> | null;
  operation?: string | null;
  prompt?: string;
  ownershipRows?: Array<Record<string, unknown>>;
  credentialWizardRows?: Array<Record<string, unknown>>;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function inferFieldPurpose(fieldName: string, row: Record<string, unknown>, schema: Record<string, unknown>, operation: string): string {
  const description = text(schema.description) || text(row.description);
  if (description) return description;

  const lower = fieldName.toLowerCase();
  if (lower.includes('spreadsheetid')) return 'Identifies the exact Google Sheet file that this node will read from or write to.';
  if (lower.includes('sheetname')) return 'Selects the tab inside the spreadsheet. Use the visible tab name such as Sheet1, Leads, or Orders.';
  if (lower === 'range') return 'Limits the cells used by the operation, such as A1:D100. Leave it broad only when the node should scan the full sheet.';
  if (lower === 'values') return `Provides row or cell values for the ${operation || 'write'} operation. Use this when the node writes an array of rows.`;
  if (lower === 'data') return `Provides an object payload for the ${operation || 'write'} operation. Use this when earlier nodes produce named fields.`;
  if (lower.includes('documentid')) return 'Identifies the exact Google Docs document that this node will read from or write to.';
  if (lower.includes('url') || lower.includes('webhook')) return 'Stores the provider URL or webhook endpoint that this node calls during execution.';
  if (lower.includes('apikey') || lower.includes('api_key') || lower.includes('token') || lower.includes('secret')) return 'Stores a secret value used to authenticate with the external service.';
  return 'Configures this node for the selected workflow operation.';
}

function inferWhereToGet(fieldName: string, row: Record<string, unknown>, schema: Record<string, unknown>, nodeLabel: string): string {
  const docsUrl = text(schema.docsUrl) || text(row.docsUrl);
  const example = text(schema.exampleValue) || text(row.exampleValue);
  const lower = fieldName.toLowerCase();
  const suffix = docsUrl ? ` Provider docs: ${docsUrl}` : example ? ` Example: ${example}` : '';

  if (lower.includes('spreadsheetid')) {
    return 'Open the Google Sheet, copy the long value in the URL between /d/ and /edit, then paste it here. You can also paste the full sheet URL if the field supports URL parsing.' + suffix;
  }
  if (lower.includes('sheetname')) {
    return 'Open the spreadsheet and copy the tab name from the bottom of Google Sheets, for example Sheet1, Leads, or Orders.' + suffix;
  }
  if (lower === 'range') {
    return 'Choose the cell range from the sheet grid, for example A1:D100. For append operations, use the target tab/range where new rows should land.' + suffix;
  }
  if (lower === 'values' || lower === 'data') {
    return 'Map this from earlier node output or enter a sample structure manually. For Google Sheets append/write, values is usually an array of rows, while data is an object with named columns.' + suffix;
  }
  if (lower.includes('documentid')) {
    return 'Open the Google Doc and copy the long value in the URL between /d/ and /edit.' + suffix;
  }
  if (lower.includes('url') || lower.includes('webhook')) {
    return `Get it from ${nodeLabel || 'the provider'} setup page, webhook settings, or the app that receives/sends the request.` + suffix;
  }
  if (lower.includes('apikey') || lower.includes('api_key') || lower.includes('token') || lower.includes('secret')) {
    return `Create or copy this secret from ${nodeLabel || 'the provider'} developer/API settings, then store it in the Credentials step or vault. Never paste it into public workflow text.` + suffix;
  }
  return 'Use the provider console, the source document URL, or the previous node output that matches this field.' + suffix;
}

function modeText(mode: string): string {
  if (mode === 'runtime_ai') return 'AI runtime';
  if (mode === 'buildtime_ai_once') return 'AI build';
  return 'You';
}

/**
 * Builds operation-aware guidance from registry/question context without relying on an LLM.
 */
export function buildDeterministicFieldOwnershipGuidance(question: string, context: unknown): FieldOwnershipGuidanceSections {
  const ctx = (context || {}) as GuideContext;
  const row = (ctx.selectedRow || {}) as Record<string, unknown>;
  const schema = (ctx.selectedFieldSchema || {}) as Record<string, unknown>;
  const node = (ctx.selectedNode || {}) as Record<string, unknown>;
  const fieldName = text(ctx.selectedField?.fieldName) || text(row.fieldName) || 'this field';
  const nodeLabel = text(row.nodeLabel) || text((node as any)?.data?.label) || text((node as any)?.label) || text(row.nodeType) || 'this node';
  const nodeType = text(row.nodeType) || text((node as any)?.type) || text((node as any)?.data?.type);
  const operation = text(ctx.operation) || text((node as any)?.data?.config?.operation) || text((node as any)?.data?.config?.action) || 'the selected';
  const registryField = nodeType ? unifiedNodeRegistry.get(nodeType)?.inputSchema?.[fieldName] : undefined;
  const effectiveSchema = { ...schema, ...(registryField || {}) } as Record<string, unknown>;
  const registryDescription = registryField
    ? buildFieldGuidanceDescription({
        nodeType,
        nodeLabel,
        fieldName,
        field: {
          ...registryField,
          label: text(row.label) || fieldName,
          selectedMode: text(row.effectiveMode) || text(row.selectedMode),
          supportsRuntimeAI: bool(row.supportsRuntimeAI, registryField.fillMode?.supportsRuntimeAI !== false),
          supportsBuildtimeAI: bool(row.supportsBuildtimeAI, registryField.fillMode?.supportsBuildtimeAI !== false),
          fieldRelevance: (row as any).fieldRelevance,
        },
        workflowGoal: text(ctx.prompt),
        operation,
        fieldRelevance: (row as any).fieldRelevance,
      })
    : null;
  const required = bool(row.required, bool(schema.required, false));
  const supportsRuntime = bool(row.supportsRuntimeAI, bool((schema as any).fillMode?.supportsRuntimeAI, true));
  const supportsBuild = bool(row.supportsBuildtimeAI, bool((schema as any).fillMode?.supportsBuildtimeAI, true));
  const currentMode = text(row.effectiveMode) || text(row.selectedMode) || text(row.fillModeDefault) || 'manual_static';
  const ownershipClass = text(row.ownershipClass) || text((schema as any).ownership) || text((schema as any).helpCategory);
  const purpose = registryDescription?.what || inferFieldPurpose(fieldName, row, effectiveSchema, operation);
  const where = inferWhereToGet(fieldName, row, effectiveSchema, nodeLabel);
  const isCredential = ownershipClass === 'credential' || text((schema as any).role).includes('credential') || /api[_-]?key|token|secret|credential/i.test(fieldName);
  const modeLabel = modeText(currentMode);
  const operationPhrase = operation && operation !== 'the selected' ? ` for the "${operation}" operation` : '';

  return {
    whatThisFieldDoes:
      registryDescription?.what ||
      `${fieldName} on ${nodeLabel}${nodeType ? ` (${nodeType})` : ''} ${purpose.charAt(0).toLowerCase()}${purpose.slice(1)} It is used${operationPhrase}. Current recommendation: ${modeLabel}.`,
    ifYouChooseYou:
      isCredential
        ? 'You provide or connect the credential yourself in the Credentials step. This is safest for API keys, OAuth accounts, tokens, sheet IDs, URLs, and other account-specific values.'
        : 'You type or paste the exact value. Use this for fixed IDs, URLs, sheet tabs, ranges, constants, or any value that should stay the same every run.',
    ifYouChooseAIBuild:
      supportsBuild
        ? 'AI fills this once during setup using the workflow intent and available node context. Review it before running; it will not automatically change on each execution.'
        : 'AI build is not supported for this field, so the system should keep it as a manual/credential value.',
    ifYouChooseAIRuntime:
      supportsRuntime
        ? 'AI fills this during each workflow run from live input and previous node output. Use it only when the value should be dynamic, not for stable secrets or account IDs.'
        : 'AI runtime is not supported for this field. Keep it as You or AI build if build-time generation is available.',
    isActuallyRequired:
      registryDescription?.needed ||
      (required
        ? 'Yes. This field must be resolved before the node can run successfully.'
        : 'No. This field is optional for this operation unless your workflow logic specifically depends on it.'),
    whereToGetValue: where,
    nextStepExpectations:
      registryDescription?.dataImpact ||
      (isCredential
        ? 'After field ownership, go to Credentials and connect the provider account or paste the secret into the vault. The workflow runner will inject it securely at execution time.'
        : 'After field ownership, manual fields appear in the configuration/credentials flow. AI build fields are generated during setup; AI runtime fields are resolved when the workflow executes.'),
  };
}

export function buildFieldOwnershipGuidancePrompt(args: {
  question: string;
  context: unknown;
  deterministicGuidance?: FieldOwnershipGuidanceSections;
}): string {
  return [
    "You are a Field Ownership guidance assistant for workflow setup.",
    "Explain clearly and helpfully without forcing a decision.",
    "Do not mutate workflows; analysis only.",
    "Use only provided context, selected node operation, field schema, credential rows, and node docs; avoid inventing facts.",
    "Be field-specific. If selectedField is present, answer only for that node + field.",
    "If runtime/build AI is unsupported, explain fallback behavior.",
    "For provider IDs/URLs/API keys/OAuth tokens, tell the user exactly where to copy/connect them.",
    "Return STRICT JSON object with keys:",
    "whatThisFieldDoes, ifYouChooseYou, ifYouChooseAIBuild, ifYouChooseAIRuntime, isActuallyRequired, whereToGetValue, nextStepExpectations.",
    args.deterministicGuidance ? "\nBaseline guidance to preserve unless context proves otherwise:" : "",
    args.deterministicGuidance ? JSON.stringify(args.deterministicGuidance, null, 2) : "",
    "",
    "User question:",
    args.question,
    "",
    "Context JSON:",
    JSON.stringify(args.context || {}, null, 2),
  ].join("\n");
}

export function fallbackFieldOwnershipGuidance(): FieldOwnershipGuidanceSections {
  return {
    whatThisFieldDoes:
      "This field affects how your node is configured during workflow setup or execution.",
    ifYouChooseYou:
      "You provide the value manually. If required and empty, you will be asked in the next setup step.",
    ifYouChooseAIBuild:
      "AI generates the value once during build/setup and reuses it unless you change it later.",
    ifYouChooseAIRuntime:
      "AI generates the value when the workflow runs. This option only works for fields that support runtime AI.",
    isActuallyRequired:
      "Required fields must be resolved before execution. Optional fields can be skipped.",
    whereToGetValue:
      "For credentials, get values from the provider account/app console (API keys, OAuth app, webhook settings).",
    nextStepExpectations:
      "After Field Ownership, the Credentials step asks for missing secrets/connections and manual required values.",
  };
}
