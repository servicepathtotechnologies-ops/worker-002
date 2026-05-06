/**
 * Deterministic backfill for registry `title_like` fields when fill mode is `runtime_ai`
 * and AI/guarantee left them empty. Keeps behavior universal (not per node type).
 */

import type { FieldFillMode } from '../types/unified-node-contract';
import type { NodeInputField } from '../types/unified-node-contract';
import { isMeaningfulStaticValue } from '../utils/fill-mode-resolver';

const MAX_TITLE_LEN = 100;

function firstLine(text: string): string {
  const line = text.split(/\r?\n/)[0]?.trim() ?? '';
  return line;
}

function truncateTitle(text: string, maxLen: number = MAX_TITLE_LEN): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

export interface TitleBackfillOptions {
  resolvedInputs: Record<string, any>;
  upstreamPayload: unknown;
  inputSchema: Record<string, NodeInputField | any>;
  effectiveFillModes: Record<string, FieldFillMode>;
  workflowIntent: string;
}

/**
 * Fills empty `title_like` + `runtime_ai` fields from (in order):
 * 1) workflow intent (first line, truncated)
 * 2) upstream plain string `response` (typical AI node output)
 * 3) first non-empty string among body/message/text/content in resolvedInputs
 */
export function fillMissingTitleLikeRuntimeAiFields(options: TitleBackfillOptions): string[] {
  const { resolvedInputs, upstreamPayload, inputSchema, effectiveFillModes, workflowIntent } = options;
  const filled: string[] = [];

  const prev =
    upstreamPayload != null && typeof upstreamPayload === 'object' && !Array.isArray(upstreamPayload)
      ? (upstreamPayload as Record<string, unknown>)
      : null;

  const responseString =
    prev && typeof prev.response === 'string' && prev.response.trim().length > 0
      ? prev.response.trim()
      : undefined;

  let bodyText: string | undefined;
  for (const k of ['body', 'message', 'text', 'content']) {
    const v = resolvedInputs[k];
    if (typeof v === 'string' && v.trim().length > 0) {
      bodyText = v.trim();
      break;
    }
  }

  const intentTrim = workflowIntent.trim();
  const intentTitle = intentTrim.length > 0 ? truncateTitle(firstLine(intentTrim)) : undefined;

  // Only use intent as title source when there is no real upstream payload.
  // When upstream has real data (e.g. Google Sheets rows), the LLM should derive the title
  // from that data — not from the user's workflow description.
  const hasRealUpstream = upstreamPayload != null && prev !== null;

  for (const fieldName of Object.keys(inputSchema)) {
    if (effectiveFillModes[fieldName] !== 'runtime_ai') continue;
    const fieldDef = inputSchema[fieldName] as NodeInputField | undefined;
    if (!fieldDef || fieldDef.role !== 'title_like') continue;
    if (isMeaningfulStaticValue(resolvedInputs[fieldName])) continue;

    let derived: string | undefined;
    if (responseString) {
      derived = truncateTitle(firstLine(responseString));
    } else if (bodyText) {
      derived = truncateTitle(firstLine(bodyText));
    } else if (!hasRealUpstream && intentTitle && intentTitle.length > 0) {
      // Only fall back to intent title when there is no real upstream data
      derived = intentTitle;
    }

    if (derived && derived.trim().length > 0) {
      resolvedInputs[fieldName] = derived;
      filled.push(fieldName);
    }
  }

  if (filled.length > 0) {
    console.debug(`[DynamicExecutor] Title-like runtime backfill applied: ${filled.join(', ')}`);
  }

  return filled;
}
