/**
 * Legacy execution used to wrap some node results as { data, type }.
 * Unwrap for registry/dynamic paths while incremental migration continues.
 */
export function normalizeLegacyWrappedNodeOutput(result: unknown): unknown {
  if (result && typeof result === 'object' && 'data' in result && 'type' in result) {
    return (result as { data: unknown }).data;
  }
  return result;
}
