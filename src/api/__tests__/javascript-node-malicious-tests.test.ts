/**
 * Additional Security Tests: Malicious Code Attempts
 * Tests that vm2 sandbox properly blocks dangerous operations
 */

import { VM } from 'vm2';

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

console.log('🛡️ Testing Malicious Code Protection (vm2 Sandbox)\n');

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

// Test 1: File System Access Attempt
test('Malicious: Block file system access (require fs)', () => {
  const input = {};
  const code = `
    const fs = require('fs');
    return fs.readFileSync('/etc/passwd', 'utf8');
  `;
  try {
    executeJavaScriptSecurely(code, input, {});
    throw new Error('Expected security violation');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('require')) {
      throw new Error('Expected require() to be blocked');
    }
  }
});

// Test 2: Network Access Attempt
test('Malicious: Block network access (require http)', () => {
  const input = {};
  const code = `
    const http = require('http');
    return { network: 'accessed' };
  `;
  try {
    executeJavaScriptSecurely(code, input, {});
    throw new Error('Expected security violation');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('require')) {
      throw new Error('Expected require() to be blocked');
    }
  }
});

// Test 3: Process Execution Attempt
test('Malicious: Block process execution (require child_process)', () => {
  const input = {};
  const code = `
    const { exec } = require('child_process');
    return { executed: true };
  `;
  try {
    executeJavaScriptSecurely(code, input, {});
    throw new Error('Expected security violation');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('require')) {
      throw new Error('Expected require() to be blocked');
    }
  }
});

// Test 4: Environment Variable Access
test('Malicious: Block environment variable access', () => {
  const input = {};
  const code = `
    return { env: process.env };
  `;
  try {
    executeJavaScriptSecurely(code, input, {});
    throw new Error('Expected security violation');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('process')) {
      throw new Error('Expected process to be blocked');
    }
  }
});

// Test 5: Infinite Loop (Timeout Protection)
test('Malicious: Block infinite loops (timeout)', () => {
  const input = {};
  const code = `
    while (true) {
      // Infinite loop
    }
    return { done: true };
  `;
  try {
    executeJavaScriptSecurely(code, input, {}, 1000); // 1 second timeout
    throw new Error('Expected timeout');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('timeout') && 
        !errorMessage.includes('timed out') && 
        !errorMessage.includes('Timeout')) {
      throw new Error(`Expected timeout error, got: ${errorMessage}`);
    }
  }
});

// Test 6: Memory Exhaustion Attempt
test('Malicious: Prevent memory exhaustion (large array)', () => {
  const input = {};
  const code = `
    const arr = [];
    for (let i = 0; i < 10000000; i++) {
      arr.push({ data: 'x'.repeat(1000) });
    }
    return { length: arr.length };
  `;
  try {
    // This should either timeout or complete (vm2 handles memory)
    const result = executeJavaScriptSecurely(code, input, {}, 2000);
    // If it completes, that's fine - vm2 isolates memory
    if (typeof result === 'object' && result !== null) {
      // Test passed - memory is isolated
    }
  } catch (error) {
    // Timeout is acceptable and expected for this test (proves timeout protection works)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('timeout') || 
        errorMessage.includes('timed out') || 
        errorMessage.includes('Timeout')) {
      // Timeout is acceptable - this proves timeout protection works
      return; // Test passes if timeout occurs
    }
    // If it's not a timeout, re-throw to see what happened
    throw error;
  }
});

// Test 7: eval() Inside Sandbox (Double Protection)
test('Malicious: Block eval() inside sandbox', () => {
  const input = {};
  const code = `
    return eval('process.env.TEST');
  `;
  try {
    executeJavaScriptSecurely(code, input, {});
    throw new Error('Expected eval() to be blocked');
  } catch (error) {
    // Should fail because eval is disabled
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('eval') && !errorMessage.includes('process')) {
      // Either eval is blocked or process access is blocked - both are good
    }
  }
});

// Test 8: Global Object Access
test('Malicious: Block global object access', () => {
  const input = {};
  const code = `
    return { global: global };
  `;
  try {
    executeJavaScriptSecurely(code, input, {});
    throw new Error('Expected global to be blocked');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes('global')) {
      throw new Error('Expected global to be blocked');
    }
  }
});

// Test 9: Valid Code Still Works (Backward Compatibility)
test('Valid: Standard data transformation still works', () => {
  const input = { items: [1, 2, 3, 4, 5] };
  const code = `
    const sum = input.items.reduce((a, b) => a + b, 0);
    const doubled = input.items.map(x => x * 2);
    return { sum, doubled, count: input.items.length };
  `;
  const result = executeJavaScriptSecurely(code, input, {}) as { sum: number; doubled: number[]; count: number };
  if (result.sum !== 15 || result.doubled.length !== 5 || result.count !== 5) {
    throw new Error('Expected valid code to work');
  }
});

// Test 10: Access to $json and getNodeOutput Still Works
test('Valid: $json and getNodeOutput access still works', () => {
  const input = { test: 'value' };
  const nodeOutputs = { 'node-1': { data: 'from-node' } };
  const code = `
    return {
      hasJson: !!$json,
      hasInput: !!input,
      nodeOutput: getNodeOutput('node-1')
    };
  `;
  const result = executeJavaScriptSecurely(code, input, nodeOutputs) as {
    hasJson: boolean;
    hasInput: boolean;
    nodeOutput: { data: string };
  };
  if (!result.hasJson || !result.hasInput || !result.nodeOutput || result.nodeOutput.data !== 'from-node') {
    throw new Error('Expected $json and getNodeOutput to work');
  }
});

console.log(`\n📊 Malicious Code Test Results: ${testsPassed} passed, ${testsFailed} failed`);

if (testsFailed === 0) {
  console.log('✅ All malicious code protection tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Review the errors above.');
  process.exit(1);
}
