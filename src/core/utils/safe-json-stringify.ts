/**
 * Safe JSON Stringify Utility
 * 
 * Handles circular references and other JSON.stringify edge cases
 * Prevents "Converting circular structure to JSON" errors
 * 
 * ✅ UNIVERSAL: Works for any object, including StructuredIntent with metadata
 */

/**
 * Safe JSON stringify that handles circular references
 * 
 * @param obj - Object to stringify
 * @param space - Optional spacing for pretty printing
 * @returns JSON string, or fallback string if circular reference detected
 */
export function safeJsonStringify(obj: any, space?: number): string {
  try {
    // First attempt: standard JSON.stringify
    return JSON.stringify(obj, null, space);
  } catch (error: any) {
    // If circular reference error, use replacer function
    if (error.message && error.message.includes('circular')) {
      const seen = new WeakSet();
      
      return JSON.stringify(obj, (key: string, value: any) => {
        // Skip circular references
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }
        
        // Skip internal metadata that might cause issues
        if (key === '_aiSpecifiedNodesContext' || key === '__metadata' || key === '__internal') {
          return '[Metadata]';
        }
        
        return value;
      }, space);
    }
    
    // For other errors, return error message
    return `[JSON Stringify Error: ${error.message}]`;
  }
}

/**
 * Get a serializable snapshot of StructuredIntent
 * Removes circular references and metadata
 * 
 * @param intent - StructuredIntent to serialize
 * @returns Serializable snapshot without circular references
 */
export function getSerializableIntentSnapshot(intent: any): any {
  return {
    trigger: intent.trigger,
    trigger_config: intent.trigger_config,
    actions: intent.actions ? [...intent.actions] : [],
    dataSources: intent.dataSources ? [...intent.dataSources] : [],
    transformations: intent.transformations ? [...intent.transformations] : [],
    conditions: intent.conditions,
    requires_credentials: intent.requires_credentials ? [...intent.requires_credentials] : [],
    // Explicitly exclude metadata that causes circular references
    // _aiSpecifiedNodesContext is excluded
  };
}
