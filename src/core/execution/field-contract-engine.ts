import type { NodeInputSchema } from '../types/unified-node-contract';

export interface FieldContractContext {
  nodeType: string;
  userIntent: string;
  upstreamPayload: unknown;
  config: Record<string, unknown>;
  inputSchema: NodeInputSchema;
}

export interface FieldContractResult {
  resolvedInputs: Record<string, unknown>;
  warnings: string[];
  repairs: string[];
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isA1Range(value: string): boolean {
  const s = value.trim();
  const singleCell = /^[A-Za-z]{1,4}[0-9]{1,7}$/;
  const cellRange = /^[A-Za-z]{1,4}[0-9]{1,7}:[A-Za-z]{1,4}[0-9]{0,7}$/;
  const colRange = /^[A-Za-z]{1,4}:[A-Za-z]{1,4}$/;
  const rowRange = /^[0-9]{1,7}:[0-9]{1,7}$/;
  return singleCell.test(s) || cellRange.test(s) || colRange.test(s) || rowRange.test(s);
}

function looksLikePromptText(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes('planned workflow') ||
    lower.includes('summarize') ||
    lower.includes('summary') ||
    lower.includes('get data from') ||
    lower.includes('send it to')
  );
}

function pickUpstreamRange(upstreamPayload: unknown): string | undefined {
  const obj = asObject(upstreamPayload);
  const candidates = ['range', 'sheetRange', 'a1Range'];
  for (const k of candidates) {
    const v = asNonEmptyString(obj[k]);
    if (v && isA1Range(v)) return v;
  }
  return undefined;
}

export function applyDeterministicFieldContracts(
  resolvedInputs: Record<string, unknown>,
  context: FieldContractContext
): FieldContractResult {
  const out: Record<string, unknown> = { ...resolvedInputs };
  const warnings: string[] = [];
  const repairs: string[] = [];

  if (context.nodeType === 'google_sheets') {
    const operation = asNonEmptyString(out.operation) || asNonEmptyString(context.config.operation) || 'read';
    const currentRange = asNonEmptyString(out.range);

    if (operation === 'read' && currentRange) {
      const invalid = !isA1Range(currentRange) || looksLikePromptText(currentRange);
      if (invalid) {
        const upstreamRange = pickUpstreamRange(context.upstreamPayload);
        const fallback = upstreamRange || 'A1:Z1000';
        out.range = fallback;
        repairs.push(`google_sheets.range repaired to "${fallback}"`);
        warnings.push(`Invalid google_sheets.range "${currentRange}" replaced with deterministic fallback.`);
      }
    }

    const sheetName = asNonEmptyString(out.sheetName);
    if (sheetName) {
      out.sheetName = sheetName;
    }
  }

  if (context.nodeType === 'ai_chat_model' || context.nodeType === 'text_summarizer' || context.nodeType === 'ai_service') {
    const promptLikeKeys = ['prompt', 'query', 'text', 'message'];
    const hasPromptLike = promptLikeKeys.some((k) => asNonEmptyString(out[k]) !== undefined);
    if (!hasPromptLike) {
      const upstream = asObject(context.upstreamPayload);
      const upstreamText = asNonEmptyString(upstream.text) || asNonEmptyString(upstream.message);
      const fallback = upstreamText || context.userIntent || 'Summarize the upstream payload clearly and concisely.';
      out.prompt = fallback;
      repairs.push(`${context.nodeType}.prompt backfilled from deterministic fallback`);
    }
  }

  return { resolvedInputs: out, warnings, repairs };
}

