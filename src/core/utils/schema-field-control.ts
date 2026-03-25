/**
 * Schema-driven control hints for wizard / comprehensive questions.
 * MUST stay in sync with ctrl_checks `convertSchemaToConfigField` → `isUserProvidedTextField`
 * so worker question types and Properties panel never disagree.
 */

/** Free-form user values — never force a select from schema `options`. */
export function isFieldUserProvidedText(fieldName: string): boolean {
  const keyLower = fieldName.toLowerCase();

  return (
    keyLower.includes('url') ||
    keyLower.includes('endpoint') ||
    (keyLower.includes('api') &&
      (keyLower.includes('key') || keyLower.includes('token') || keyLower.includes('secret'))) ||
    keyLower.includes('spreadsheet') ||
    (keyLower.includes('table') && keyLower.includes('name')) ||
    (keyLower.includes('file') && keyLower.includes('name')) ||
    (keyLower.includes('database') && keyLower.includes('name')) ||
    (keyLower.includes('sheet') && keyLower.includes('id')) ||
    (keyLower.includes('id') && !keyLower.includes('credential') && !keyLower.includes('model')) ||
    keyLower.includes('secret') ||
    keyLower.includes('password') ||
    keyLower.includes('token') ||
    keyLower.includes('auth') ||
    keyLower.includes('prompt') ||
    keyLower.includes('message') ||
    keyLower.includes('body') ||
    keyLower.includes('content') ||
    (keyLower.includes('text') && !keyLower.includes('format'))
  );
}

/**
 * Node library optional field has explicit `options` → use select unless user-provided text.
 * Does not use `examples` as dropdown source.
 */
export function shouldUseSelectForExplicitOptions(
  fieldName: string,
  fieldInfo?: { options?: unknown[] }
): boolean {
  if (isFieldUserProvidedText(fieldName)) return false;
  const opts = fieldInfo?.options;
  return Array.isArray(opts) && opts.length > 0;
}
