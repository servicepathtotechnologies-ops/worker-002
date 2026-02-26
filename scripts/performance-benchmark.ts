/**
 * Performance Benchmark Script
 * 
 * Measures Save and Run latency before/after refactoring.
 * 
 * Usage:
 *   npm run benchmark
 *   npm run benchmark -- --save-only
 *   npm run benchmark -- --run-only
 */

import { performance } from 'perf_hooks';
import { getSupabaseClient } from '../src/core/database/supabase-compat';

interface BenchmarkResult {
  operation: string;
  latency: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

// ✅ STRICT TYPING: API Response Interfaces
interface ExecuteWorkflowResponse {
  executionId?: string;
  success?: boolean;
  error?: string;
  nodes?: any[];
  edges?: any[];
}

interface NodeDefinitionsResponse {
  nodes?: Array<{
    type: string;
    label: string;
    category: string;
    inputSchema: Record<string, any>;
    outputSchema: Record<string, any>;
  }>;
  error?: string;
}

// ✅ TYPE GUARDS: Runtime validation
function isExecuteWorkflowResponse(data: unknown): data is ExecuteWorkflowResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('executionId' in data || 'success' in data || 'error' in data)
  );
}

function isNodeDefinitionsResponse(data: unknown): data is NodeDefinitionsResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    ('nodes' in data || 'error' in data)
  );
}

const results: BenchmarkResult[] = [];

/**
 * Benchmark workflow save operation
 */
async function benchmarkSave(workflowId: string): Promise<BenchmarkResult> {
  const supabase = getSupabaseClient();
  
  const testWorkflow = {
    id: workflowId,
    nodes: [
      {
        id: 'node1',
        type: 'manual_trigger',
        position: { x: 0, y: 0 },
        data: { type: 'manual_trigger', label: 'Start', config: {} },
      },
      {
        id: 'node2',
        type: 'javascript',
        position: { x: 100, y: 100 },
        data: {
          type: 'javascript',
          label: 'Process',
          config: { code: 'return input.data;' },
        },
      },
    ],
    edges: [
      {
        id: 'edge1',
        source: 'node1',
        target: 'node2',
        sourceHandle: 'default',
        targetHandle: 'default',
      },
    ],
  };

  const start = performance.now();
  
  try {
    const { error } = await supabase
      .from('workflows')
      .update({
        nodes: testWorkflow.nodes as any,
        edges: testWorkflow.edges as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    if (error) throw error;

    const latency = performance.now() - start;

    return {
      operation: 'save',
      latency,
      timestamp: new Date().toISOString(),
      metadata: {
        nodeCount: testWorkflow.nodes.length,
        edgeCount: testWorkflow.edges.length,
      },
    };
  } catch (error: any) {
    const latency = performance.now() - start;
    return {
      operation: 'save',
      latency,
      timestamp: new Date().toISOString(),
      metadata: {
        error: error.message,
      },
    };
  }
}

/**
 * Benchmark workflow run operation
 */
async function benchmarkRun(workflowId: string): Promise<BenchmarkResult> {
  const start = performance.now();
  
  try {
    const response = await fetch(`http://localhost:3001/api/execute-workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflowId,
        input: {},
      }),
    });

    const latency = performance.now() - start;
    const rawData = await response.json();

    // ✅ STRICT TYPING: Type-safe response parsing
    if (!isExecuteWorkflowResponse(rawData)) {
      return {
        operation: 'run',
        latency,
        timestamp: new Date().toISOString(),
        metadata: {
          status: response.status,
          success: false,
          error: 'Invalid response format',
        },
      };
    }

    const data = rawData as ExecuteWorkflowResponse;

    return {
      operation: 'run',
      latency,
      timestamp: new Date().toISOString(),
      metadata: {
        status: response.status,
        success: response.ok,
        executionId: data.executionId || undefined,
      },
    };
  } catch (error: any) {
    const latency = performance.now() - start;
    return {
      operation: 'run',
      latency,
      timestamp: new Date().toISOString(),
      metadata: {
        error: error.message,
      },
    };
  }
}

/**
 * Benchmark schema fetch operation
 */
async function benchmarkSchemaFetch(): Promise<BenchmarkResult> {
  const start = performance.now();
  
  try {
    const response = await fetch('http://localhost:3001/api/node-definitions');
    const latency = performance.now() - start;
    const rawData = await response.json();

    // ✅ STRICT TYPING: Type-safe response parsing
    if (!isNodeDefinitionsResponse(rawData)) {
      return {
        operation: 'schema_fetch',
        latency,
        timestamp: new Date().toISOString(),
        metadata: {
          status: response.status,
          nodeCount: 0,
          cacheHit: false,
          error: 'Invalid response format',
        },
      };
    }

    const data = rawData as NodeDefinitionsResponse;

    return {
      operation: 'schema_fetch',
      latency,
      timestamp: new Date().toISOString(),
      metadata: {
        status: response.status,
        nodeCount: data.nodes?.length || 0,
        cacheHit: false, // First fetch is always cache miss
      },
    };
  } catch (error: any) {
    const latency = performance.now() - start;
    return {
      operation: 'schema_fetch',
      latency,
      timestamp: new Date().toISOString(),
      metadata: {
        error: error.message,
      },
    };
  }
}

/**
 * Benchmark schema fetch with cache (second fetch)
 */
async function benchmarkSchemaFetchCached(): Promise<BenchmarkResult> {
  // First fetch to populate cache
  await benchmarkSchemaFetch();
  
  // Second fetch should hit cache
  const start = performance.now();
  
  try {
    const response = await fetch('http://localhost:3001/api/node-definitions');
    const latency = performance.now() - start;
    const rawData = await response.json();

    // ✅ STRICT TYPING: Type-safe response parsing
    if (!isNodeDefinitionsResponse(rawData)) {
      return {
        operation: 'schema_fetch_cached',
        latency,
        timestamp: new Date().toISOString(),
        metadata: {
          status: response.status,
          nodeCount: 0,
          cacheHit: true,
          error: 'Invalid response format',
        },
      };
    }

    const data = rawData as NodeDefinitionsResponse;

    return {
      operation: 'schema_fetch_cached',
      latency,
      timestamp: new Date().toISOString(),
      metadata: {
        status: response.status,
        nodeCount: data.nodes?.length || 0,
        cacheHit: true,
      },
    };
  } catch (error: any) {
    const latency = performance.now() - start;
    return {
      operation: 'schema_fetch_cached',
      latency,
      timestamp: new Date().toISOString(),
      metadata: {
        error: error.message,
      },
    };
  }
}

/**
 * Run all benchmarks
 */
async function runBenchmarks() {
  const args = process.argv.slice(2);
  const saveOnly = args.includes('--save-only');
  const runOnly = args.includes('--run-only');

  console.log('🚀 Starting Performance Benchmarks...\n');
  console.log('Environment:');
  console.log(`  Node.js: ${process.version}`);
  console.log(`  Platform: ${process.platform}`);
  console.log(`  Backend URL: http://localhost:3001`);
  console.log('');

  // Get or create test workflow
  const supabase = getSupabaseClient();
  let workflowId: string;

  try {
    // Try to find existing test workflow
    const { data: existing } = await supabase
      .from('workflows')
      .select('id')
      .eq('name', 'Performance Test Workflow')
      .limit(1)
      .single();

    if (existing) {
      workflowId = existing.id;
      console.log(`✅ Using existing test workflow: ${workflowId}`);
    } else {
      // Create test workflow
      const { data: newWorkflow, error } = await supabase
        .from('workflows')
        .insert({
          name: 'Performance Test Workflow',
          nodes: [],
          edges: [],
        })
        .select()
        .single();

      if (error) throw error;
      workflowId = newWorkflow.id;
      console.log(`✅ Created test workflow: ${workflowId}`);
    }
  } catch (error: any) {
    console.error('❌ Error setting up test workflow:', error.message);
    process.exit(1);
  }

  // Run benchmarks
  if (!runOnly) {
    console.log('\n📝 Benchmarking Save Operation...');
    for (let i = 0; i < 10; i++) {
      const result = await benchmarkSave(workflowId);
      results.push(result);
      console.log(`  Run ${i + 1}: ${result.latency.toFixed(2)}ms`);
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
    }
  }

  if (!saveOnly) {
    console.log('\n▶️  Benchmarking Run Operation...');
    for (let i = 0; i < 10; i++) {
      const result = await benchmarkRun(workflowId);
      results.push(result);
      console.log(`  Run ${i + 1}: ${result.latency.toFixed(2)}ms`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Delay between runs
    }

    console.log('\n📡 Benchmarking Schema Fetch (Cold)...');
    const coldResult = await benchmarkSchemaFetch();
    results.push(coldResult);
    console.log(`  Cold fetch: ${coldResult.latency.toFixed(2)}ms`);

    console.log('\n📡 Benchmarking Schema Fetch (Cached)...');
    const cachedResult = await benchmarkSchemaFetchCached();
    results.push(cachedResult);
    console.log(`  Cached fetch: ${cachedResult.latency.toFixed(2)}ms`);
  }

  // Calculate statistics
  console.log('\n📊 Results Summary:\n');
  
  const saveResults = results.filter(r => r.operation === 'save');
  const runResults = results.filter(r => r.operation === 'run');
  const schemaResults = results.filter(r => r.operation === 'schema_fetch');
  const schemaCachedResults = results.filter(r => r.operation === 'schema_fetch_cached');

  if (saveResults.length > 0) {
    const saveLatencies = saveResults.map(r => r.latency);
    const avgSave = saveLatencies.reduce((a, b) => a + b, 0) / saveLatencies.length;
    const minSave = Math.min(...saveLatencies);
    const maxSave = Math.max(...saveLatencies);
    
    console.log('Save Operation:');
    console.log(`  Average: ${avgSave.toFixed(2)}ms`);
    console.log(`  Min: ${minSave.toFixed(2)}ms`);
    console.log(`  Max: ${maxSave.toFixed(2)}ms`);
    console.log(`  Runs: ${saveResults.length}`);
  }

  if (runResults.length > 0) {
    const runLatencies = runResults.map(r => r.latency);
    const avgRun = runLatencies.reduce((a, b) => a + b, 0) / runLatencies.length;
    const minRun = Math.min(...runLatencies);
    const maxRun = Math.max(...runLatencies);
    
    console.log('\nRun Operation:');
    console.log(`  Average: ${avgRun.toFixed(2)}ms`);
    console.log(`  Min: ${minRun.toFixed(2)}ms`);
    console.log(`  Max: ${maxRun.toFixed(2)}ms`);
    console.log(`  Runs: ${runResults.length}`);
  }

  if (schemaResults.length > 0) {
    console.log('\nSchema Fetch (Cold):');
    console.log(`  Latency: ${schemaResults[0].latency.toFixed(2)}ms`);
    console.log(`  Node Count: ${schemaResults[0].metadata?.nodeCount || 0}`);
  }

  if (schemaCachedResults.length > 0) {
    console.log('\nSchema Fetch (Cached):');
    console.log(`  Latency: ${schemaCachedResults[0].latency.toFixed(2)}ms`);
    console.log(`  Cache Hit: ${schemaCachedResults[0].metadata?.cacheHit || false}`);
    if (schemaResults.length > 0) {
      const speedup = ((schemaResults[0].latency - schemaCachedResults[0].latency) / schemaResults[0].latency * 100).toFixed(1);
      console.log(`  Speedup: ${speedup}%`);
    }
  }

  // Save results to file
  const fs = require('fs');
  const resultsFile = 'performance-results.json';
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to ${resultsFile}`);
}

// Run if executed directly
if (require.main === module) {
  runBenchmarks().catch(console.error);
}

export { runBenchmarks, benchmarkSave, benchmarkRun, benchmarkSchemaFetch };
