/**
 * Switch-only expression evaluation for legacy execute path.
 * Supports simple field paths ({{$json.response}}) and lightweight JS in {{ ... }} for routing.
 */

import type { ExecutionContext } from '../execution/typed-execution-context';
import { getContextValue } from '../execution/typed-execution-context';
import { isBareFieldPathString, resolveTypedValue } from '../execution/typed-value-resolver';

function looksLikeJavaScriptExpression(expression: string): boolean {
  return /(?:[!=<>]=?|&&|\|\||[+\-*/%]|\[|\]|\b(?:true|false|null|undefined)\b|['"])/.test(expression);
}

function buildInputAlias(
  json: Record<string, unknown>,
  variables: Record<string, unknown>
): unknown {
  const item = { json };
  const base = {
    item,
    json,
    first: () => item,
    all: () => [item],
  };

  const existing = variables.$input;
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    return { ...base, ...(existing as Record<string, unknown>) };
  }

  return base;
}

/**
 * Evaluate Switch `expression` config against the current execution context.
 * Used only by the `switch` case in execute-workflow legacy executor.
 */
export function evaluateSwitchRoutingExpression(
  expression: string,
  context: ExecutionContext
): unknown {
  const trimmed = (expression || '').trim();
  if (!trimmed) {
    return null;
  }

  const single = trimmed.match(/^\{\{([^}]+)\}\}$/);
  const inner = single ? single[1].trim() : trimmed;

  if (single && isBareFieldPathString(inner) && !inner.startsWith('$input.')) {
    return getContextValue(context, inner);
  }

  const resolved = resolveTypedValue(expression, context);
  if (resolved !== null && resolved !== undefined && resolved !== '') {
    return resolved;
  }

  if (single && (inner.startsWith('$input.') || /[?:()]/.test(inner) || looksLikeJavaScriptExpression(inner))) {
    try {
      const $json =
        (context.variables.$json as Record<string, unknown> | undefined) ??
        (context.variables.json as Record<string, unknown> | undefined) ??
        (context.lastOutput && typeof context.lastOutput === 'object' && !Array.isArray(context.lastOutput)
          ? (context.lastOutput as Record<string, unknown>)
          : {});
      const json = $json;
      const input = context.variables;
      const $input = buildInputAlias($json, context.variables);
      const fn = new Function('$json', 'json', 'input', '$input', `return (${inner});`);
      return fn($json, json, input, $input);
    } catch {
      return null;
    }
  }

  return resolved;
}
