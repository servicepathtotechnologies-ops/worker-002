// SECURITY FIX: vm2 Sandbox Replacement for eval()
// This file shows the replacement code for the vulnerable eval() usage
// File: worker/src/api/execute-workflow.ts
// Lines: 786-847 (javascript case)

import { VM } from 'vm2';

/**
 * Secure JavaScript execution using vm2 sandbox
 * Replaces vulnerable eval() with sandboxed execution
 */
function executeJavaScriptSecurely(
  code: string,
  inputObj: Record<string, unknown>,
  nodeOutputs: Record<string, unknown>,
  timeout: number = 5000
): unknown {
  // Security: Check if JavaScript execution is enabled
  if (process.env.DISABLE_JAVASCRIPT_NODE === 'true') {
    throw new Error('JavaScript node execution is disabled for security reasons');
  }

  try {
    // Create vm2 sandbox with strict security settings
    const vm = new VM({
      timeout: timeout, // Execution timeout in milliseconds
      sandbox: {
        // Safe context variables
        input: inputObj,
        $json: inputObj,
        json: inputObj,
        
        // Read-only access to nodeOutputs via getter function
        // This prevents direct modification of nodeOutputs
        getNodeOutput: (nodeId: string) => {
          const output = nodeOutputs[nodeId];
          // Return a deep clone to prevent modification
          if (output === null || output === undefined) {
            return undefined;
          }
          try {
            return JSON.parse(JSON.stringify(output));
          } catch {
            // If circular reference or non-serializable, return undefined
            return undefined;
          }
        },
        
        // Helper functions that are safe to expose
        Math: Math,
        JSON: JSON,
        Date: Date,
        Array: Array,
        Object: Object,
        String: String,
        Number: Number,
        Boolean: Boolean,
        RegExp: RegExp,
        
        // Console for debugging (will be limited by vm2)
        console: {
          log: (...args: unknown[]) => console.log('[JS Node]', ...args),
          error: (...args: unknown[]) => console.error('[JS Node]', ...args),
          warn: (...args: unknown[]) => console.warn('[JS Node]', ...args),
        },
      },
      
      // Additional security settings
      eval: false, // Disable eval() inside sandbox
      wasm: false, // Disable WebAssembly
      fixAsync: true, // Fix async/await support
    });

    // Wrap user code in IIFE to ensure proper return handling
    const wrappedCode = `
      (function() {
        ${code}
        
        // If code doesn't return anything, return input
        return typeof result !== 'undefined' ? result : input;
      })()
    `;

    // Execute code in sandbox
    const result = vm.run(wrappedCode);
    
    return result;
  } catch (error) {
    // Provide detailed error information
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Log security-related errors separately
    if (errorMessage.includes('require') || 
        errorMessage.includes('process') || 
        errorMessage.includes('global') ||
        errorMessage.includes('__dirname') ||
        errorMessage.includes('__filename')) {
      console.error('[Security] JavaScript node attempted to access restricted APIs:', errorMessage);
      throw new Error(`Security violation: Code attempted to access restricted Node.js APIs. ${errorMessage}`);
    }
    
    // Log timeout errors
    if (errorMessage.includes('timeout') || errorMessage.includes('Script execution timed out')) {
      console.error('[Security] JavaScript node execution timed out');
      throw new Error(`Execution timeout: Code exceeded ${timeout}ms execution limit`);
    }
    
    // Re-throw other errors with context
    throw new Error(`JavaScript execution failed: ${errorMessage}`);
  }
}

/**
 * BEFORE (VULNERABLE CODE):
 * 
 * const wrappedCode = `
 *   (function() {
 *     const input = ${JSON.stringify(inputObj)};
 *     const $json = ${JSON.stringify(inputObj)};
 *     const json = ${JSON.stringify(inputObj)};
 *     const nodeOutputs = ${JSON.stringify(nodeOutputs)};
 *     
 *     ${code}
 *     
 *     return typeof result !== 'undefined' ? result : input;
 *   })()
 * `;
 * 
 * const result = eval(wrappedCode);  // ⚠️ VULNERABLE
 * return result;
 * 
 * 
 * AFTER (SECURE CODE):
 * 
 * const timeout = parseInt(getStringProperty(config, 'timeout', '5000'), 10) || 5000;
 * const result = executeJavaScriptSecurely(code, inputObj, nodeOutputs, timeout);
 * return result;
 */
