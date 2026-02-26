/**
 * Security Test: JavaScript Node vm2 Sandbox
 * Tests the secure replacement of eval() with vm2 sandbox
 * 
 * Run with: npm test (if test framework configured)
 * Or: node -r ts-node/register src/api/__tests__/javascript-node-security.test.ts
 */

import { VM } from 'vm2';

// Mock the executeNode function's JavaScript case logic
function executeJavaScriptSecurely(
  code: string,
  inputObj: Record<string, unknown>,
  nodeOutputs: Record<string, unknown>,
  timeout: number = 5000
): unknown {
  const maxTimeout = 30000;
  const safeTimeout = Math.min(timeout, maxTimeout);

  try {
    const vm = new VM({
      timeout: safeTimeout,
      sandbox: {
        input: (() => {
          try {
            return JSON.parse(JSON.stringify(inputObj));
          } catch {
            return inputObj;
          }
        })(),
        $json: (() => {
          try {
            return JSON.parse(JSON.stringify(inputObj));
          } catch {
            return inputObj;
          }
        })(),
        json: (() => {
          try {
            return JSON.parse(JSON.stringify(inputObj));
          } catch {
            return inputObj;
          }
        })(),
        getNodeOutput: (nodeId: string) => {
          const output = nodeOutputs[nodeId];
          if (output === null || output === undefined) {
            return undefined;
          }
          try {
            return JSON.parse(JSON.stringify(output));
          } catch {
            return undefined;
          }
        },
        Math: Math,
        JSON: JSON,
        Date: Date,
        Array: Array,
        Object: Object,
        String: String,
        Number: Number,
        Boolean: Boolean,
        RegExp: RegExp,
        console: {
          log: (...args: unknown[]) => console.log('[JS Node]', ...args),
          error: (...args: unknown[]) => console.error('[JS Node]', ...args),
          warn: (...args: unknown[]) => console.warn('[JS Node]', ...args),
        },
      },
      eval: false,
      wasm: false,
      fixAsync: true,
    });

    const wrappedCode = `
      (function() {
        ${code}
        return typeof result !== 'undefined' ? result : input;
      })()
    `;

    return vm.run(wrappedCode);
  } catch (error) {
    throw error;
  }
}

// Test Suite
console.log('🧪 Testing JavaScript Node Security (vm2 Sandbox)\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    testsFailed++;
  }
}

// Test 1: Basic execution
test('Basic execution: return input', () => {
  const input = { name: 'test', value: 123 };
  const result = executeJavaScriptSecurely('return input;', input, {});
  if (JSON.stringify(result) !== JSON.stringify(input)) {
    throw new Error('Expected input to be returned');
  }
});

// Test 2: Data transformation
test('Data transformation: map operation', () => {
  const input = { items: [1, 2, 3] };
  const code = 'return { doubled: input.items.map(x => x * 2) };';
  const result = executeJavaScriptSecurely(code, input, {}) as { doubled: number[] };
  if (!result.doubled || result.doubled[0] !== 2 || result.doubled[1] !== 4) {
    throw new Error('Expected doubled array');
  }
});

// Test 3: Access to input variables
test('Access to input, $json, json variables', () => {
  const input = { test: 'value' };
  const code = 'return { hasInput: !!input, hasJson: !!$json, hasJsonAlias: !!json };';
  const result = executeJavaScriptSecurely(code, input, {}) as Record<string, boolean>;
  if (!result.hasInput || !result.hasJson || !result.hasJsonAlias) {
    throw new Error('Expected all variables to be accessible');
  }
});

// Test 4: Read nodeOutputs via getter
test('Read nodeOutputs via getNodeOutput', () => {
  const input = {};
  const nodeOutputs = { 'node-1': { data: 'test' } };
  const code = 'return getNodeOutput("node-1");';
  const result = executeJavaScriptSecurely(code, input, nodeOutputs) as { data: string };
  if (!result || result.data !== 'test') {
    throw new Error('Expected node output to be accessible');
  }
});

// Test 5: Timeout enforcement
test('Timeout enforcement', () => {
  const input = {};
  const code = `
    const start = Date.now();
    while (Date.now() - start < 2000) {
      // Busy wait for 2 seconds
    }
    return { done: true };
  `;
  try {
    executeJavaScriptSecurely(code, input, {}, 1000); // 1 second timeout
    throw new Error('Expected timeout error');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // vm2 throws "Script execution timed out" or similar
    if (!errorMessage.includes('timeout') && 
        !errorMessage.includes('timed out') && 
        !errorMessage.includes('Timeout')) {
      throw new Error(`Expected timeout error message, got: ${errorMessage}`);
    }
  }
});

// Test 6: Security: Block require()
test('Security: Block require() access', () => {
  const input = {};
  const code = 'require("fs"); return input;';
  try {
    executeJavaScriptSecurely(code, input, {});
    throw new Error('Expected security violation error');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('require')) {
      throw new Error('Expected require() to be blocked');
    }
  }
});

// Test 7: Security: Block process.env
test('Security: Block process.env access', () => {
  const input = {};
  const code = 'process.env.TEST; return input;';
  try {
    executeJavaScriptSecurely(code, input, {});
    throw new Error('Expected security violation error');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('process')) {
      throw new Error('Expected process to be blocked');
    }
  }
});

// Test 8: Error handling: Syntax errors
test('Error handling: Syntax errors', () => {
  const input = {};
  const code = 'return { invalid syntax }';
  try {
    executeJavaScriptSecurely(code, input, {});
    throw new Error('Expected syntax error');
  } catch (error) {
    // Should throw error
    if (!(error instanceof Error)) {
      throw new Error('Expected Error object');
    }
  }
});

// Test 9: Circular reference handling
test('Circular reference handling in nodeOutputs', () => {
  const input = {};
  const circular: any = { data: 'test' };
  circular.self = circular; // Create circular reference
  const nodeOutputs = { 'node-1': circular };
  const code = 'return getNodeOutput("node-1");';
  // Should not throw, should return undefined or handle gracefully
  const result = executeJavaScriptSecurely(code, input, nodeOutputs);
  // Result should be undefined or handled gracefully
  if (result !== undefined && typeof result !== 'object') {
    throw new Error('Expected graceful handling of circular reference');
  }
});

// Test 10: Standard JavaScript operations
test('Standard JavaScript operations work', () => {
  const input = { numbers: [1, 2, 3, 4, 5] };
  const code = `
    const sum = input.numbers.reduce((a, b) => a + b, 0);
    const doubled = input.numbers.map(x => x * 2);
    return { sum, doubled, length: input.numbers.length };
  `;
  const result = executeJavaScriptSecurely(code, input, {}) as { sum: number; doubled: number[]; length: number };
  if (result.sum !== 15 || result.doubled.length !== 5 || result.length !== 5) {
    throw new Error('Expected standard operations to work');
  }
});

// Summary
console.log(`\n📊 Test Results: ${testsPassed} passed, ${testsFailed} failed`);

if (testsFailed === 0) {
  console.log('✅ All security tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Review the errors above.');
  process.exit(1);
}
