/**
 * Runtime Router Metrics Test
 *
 * Purpose:
 * - Execute a small, representative workflow end-to-end using the REAL execution engine
 * - Exercise DynamicNodeExecutor + IntentDrivenJsonRouter in runtime
 * - Measure:
 *   - Router activation rate (activated vs skipped)
 *   - Router latency (per invocation + averages)
 *   - Schema drift detections
 *   - Explicit filtering triggers
 *
 * This script is intentionally focused and segmented:
 * - Uses a small, explicit workflow: Manual Trigger → Google Sheets → AI Agent → Gmail
 * - Reuses the same test workflow shape as test-data-flow-contract-layer.ts
 * - Runs multiple prompts to cover:
 *   - High-confidence flows
 *   - Explicit filtering cases
 *   - More complex instructions
 *
 * How to run (from worker/):
 *   npx ts-node scripts/test-runtime-router-metrics.ts
 */

import '../src/core/env-loader';
import { DataFlowContractLayer } from '../src/services/data-flow-contract-layer';
import { Workflow } from '../src/core/types/ai-types';
import { LRUNodeOutputsCache } from '../src/core/cache/lru-node-outputs-cache';
import { executeNodeDynamically } from '../src/core/execution/dynamic-node-executor';
import { getSupabaseClient } from '../src/core/database/supabase-compat';
import { IntentDrivenJsonRouter } from '../src/core/intent-driven-json-router';

interface RouterMetrics {
  activations: number;
  skips: number;
  schemaDriftDetections: number;
  explicitFilteringDetections: number;
  routeLatencies: number[]; // in ms
}

const globalMetrics: RouterMetrics = {
  activations: 0,
  skips: 0,
  schemaDriftDetections: 0,
  explicitFilteringDetections: 0,
  routeLatencies: [],
};

const scenarioMetrics: Record<string, RouterMetrics> = {};
let currentScenario: string = 'unknown';

/**
 * Ensure per-scenario metrics object exists
 */
function getScenarioMetrics(name: string): RouterMetrics {
  if (!scenarioMetrics[name]) {
    scenarioMetrics[name] = {
      activations: 0,
      skips: 0,
      schemaDriftDetections: 0,
      explicitFilteringDetections: 0,
      routeLatencies: [],
    };
  }
  return scenarioMetrics[name];
}

/**
 * Segment 1: Instrument IntentDrivenJsonRouter.route to measure activations & latency
 */
function instrumentIntentRouter() {
  const originalRoute = IntentDrivenJsonRouter.prototype.route;

  IntentDrivenJsonRouter.prototype.route = async function (context: any) {
    const start = Date.now();
    const scenario = currentScenario || 'unknown';

    try {
      const result = await originalRoute.call(this, context);
      const duration = Date.now() - start;

      // Global metrics
      globalMetrics.activations += 1;
      globalMetrics.routeLatencies.push(duration);

      // Scenario metrics
      const sMetrics = getScenarioMetrics(scenario);
      sMetrics.activations += 1;
      sMetrics.routeLatencies.push(duration);

      return result;
    } catch (error) {
      // Still record activation even if router throws
      globalMetrics.activations += 1;
      const sMetrics = getScenarioMetrics(scenario);
      sMetrics.activations += 1;
      throw error;
    }
  };
}

/**
 * Segment 2: Instrument console.log to detect skips, schema drift, explicit filtering
 *
 * We keep this focused:
 * - Count "Router skipped" events
 * - Count schema drift logs
 * - Count explicit filtering logs
 */
function instrumentConsoleLogging() {
  const originalLog = console.log;

  console.log = (...args: any[]) => {
    const message = args
      .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
      .join(' ');

    const scenario = currentScenario || 'unknown';
    const sMetrics = getScenarioMetrics(scenario);

    // Router skipped
    if (message.includes('Router skipped for')) {
      globalMetrics.skips += 1;
      sMetrics.skips += 1;
    }

    // Schema drift detection
    if (message.includes('[IntentRouter] 🔄 Schema drift detected')) {
      globalMetrics.schemaDriftDetections += 1;
      sMetrics.schemaDriftDetections += 1;
    }

    // Explicit filtering detection
    if (message.includes('[IntentRouter] 🔍 Explicit filtering intent detected')) {
      globalMetrics.explicitFilteringDetections += 1;
      sMetrics.explicitFilteringDetections += 1;
    }

    originalLog(...args);
  };
}

/**
 * Segment 3: Simple topological sort for Workflow.nodes / edges
 * This is a minimal copy tailored for the small test workflow.
 */
function topologicalSort(workflow: Workflow): Workflow['nodes'] {
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};
  const nodeMap: Record<string, any> = {};

  nodes.forEach((node) => {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
    nodeMap[node.id] = node;
  });

  edges.forEach((edge) => {
    adjacency[edge.source] = adjacency[edge.source] || [];
    adjacency[edge.source].push(edge.target);
    inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
  });

  const queue: string[] = [];
  Object.entries(inDegree).forEach(([nodeId, degree]) => {
    if (degree === 0) queue.push(nodeId);
  });

  const sorted: any[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    sorted.push(nodeMap[nodeId]);

    (adjacency[nodeId] || []).forEach((neighbor) => {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    });
  }

  return sorted;
}

/**
 * Segment 4: Define a small, explicit test workflow
 * Manual Trigger → Google Sheets → AI Agent → Gmail
 */
function createTestWorkflow(): Workflow {
  const workflow: Workflow = {
    nodes: [
      {
        id: 'node-1',
        type: 'manual_trigger',
        data: {
          label: 'Manual Trigger',
          type: 'manual_trigger',
          category: 'trigger',
          config: {},
        },
      },
      {
        id: 'node-2',
        type: 'google_sheets',
        data: {
          label: 'Google Sheets',
          type: 'google_sheets',
          category: 'data',
          config: {
            operation: 'read',
            spreadsheetId: 'test-sheet-id',
            sheetName: 'Sheet1',
            range: 'A1:C10',
          },
        },
      },
      {
        id: 'node-3',
        type: 'ai_agent',
        data: {
          label: 'AI Agent',
          type: 'ai_agent',
          category: 'ai',
          config: {
            userInput: '',
            prompt: '',
          },
        },
      },
      {
        id: 'node-4',
        type: 'google_gmail',
        data: {
          label: 'Gmail',
          type: 'google_gmail',
          category: 'communication',
          config: {
            operation: 'send',
            to: '',
            subject: '',
            body: '',
          },
        },
      },
    ],
    edges: [
      { id: 'edge-1', source: 'node-1', target: 'node-2' },
      { id: 'edge-2', source: 'node-2', target: 'node-3' },
      { id: 'edge-3', source: 'node-3', target: 'node-4' },
    ],
  };

  return workflow;
}

/**
 * Segment 5: Execute a single workflow end-to-end using DynamicNodeExecutor
 * - Applies Data Flow Contract Layer first (to populate mapping metadata)
 * - Then executes nodes in topological order
 */
async function executeWorkflowRuntime(prompt: string, scenarioName: string) {
  currentScenario = scenarioName;

  console.log('\n' + '='.repeat(80));
  console.log(`🧪 Scenario: ${scenarioName}`);
  console.log(`📝 Prompt: "${prompt}"`);
  console.log('='.repeat(80));

  // Make prompt available to execution context (used by AI Input Resolver & router)
  (global as any).currentWorkflowIntent = prompt;

  // 1) Build test workflow
  const baseWorkflow = createTestWorkflow();

  // 2) Apply Data Flow Contract Layer (Phase 1 mask layer)
  const dataFlowLayer = new DataFlowContractLayer();

  console.log('\n[RuntimeMetrics] Applying Data Flow Contract Layer...');
  const contractResult = await dataFlowLayer.applyDataFlowContract(
    baseWorkflow,
    prompt,
    'test-user-id'
  );

  const workflowWithContracts = contractResult.workflow;

  console.log(
    `[RuntimeMetrics] Data Flow Contract created ${contractResult.mappings.length} mappings`
  );

  // 3) Prepare execution context
  const supabase = getSupabaseClient();
  const nodeOutputs = new LRUNodeOutputsCache(50);
  const sortedNodes = topologicalSort(workflowWithContracts);

  console.log(
    `[RuntimeMetrics] Executing workflow with ${sortedNodes.length} nodes in topological order`
  );

  const workflowId = `runtime-metrics-${Date.now()}`;

  for (const node of sortedNodes) {
    console.log(`\n[RuntimeMetrics] ▶ Executing node ${node.id} (${node.type})`);

    try {
      const context = {
        node,
        input: {}, // Dynamic executor currently derives inputs from previous outputs + AI
        nodeOutputs,
        supabase,
        workflowId,
        userId: 'test-user-id',
        currentUserId: 'test-user-id',
      };

      const output = await executeNodeDynamically(context as any);

      // Store output in LRU cache for downstream nodes and router
      nodeOutputs.set(node.id, output);

      console.log(
        `[RuntimeMetrics] ✅ Node ${node.id} (${node.type}) executed. Output type: ${typeof output}`
      );
    } catch (error: any) {
      console.error(
        `[RuntimeMetrics] ❌ Error executing node ${node.id} (${node.type}):`,
        error?.message || String(error)
      );

      // Still set an error output so downstream nodes and router have something to inspect
      nodeOutputs.set(node.id, {
        _error: error?.message || 'Node execution failed',
        _nodeType: node.type,
      });
    }
  }
}

/**
 * Segment 6: Run multiple scenarios and print metrics summary
 */
async function runRuntimeRouterMetrics() {
  // Install instrumentation once
  instrumentIntentRouter();
  instrumentConsoleLogging();

  console.log('🧪 Running Runtime Router Metrics Tests...\n');

  const scenarios = [
    {
      name: 'High-confidence basic flow (Sheets → AI → Gmail)',
      prompt: 'Get data from Google Sheets, summarize with AI, and send the summary via Gmail.',
    },
    {
      name: 'Explicit filtering (Resumes column only)',
      prompt:
        'Get the resumes column from Google Sheets, use AI to summarize each resume, and send the summaries via Gmail.',
    },
    {
      name: 'Name + Email filtering',
      prompt:
        'Extract only the Name and Email columns from Google Sheets, format them nicely with AI, and email the result.',
    },
    {
      name: 'Short ambiguous prompt',
      prompt: 'Sheets to AI to Gmail.',
    },
  ];

  for (const scenario of scenarios) {
    await executeWorkflowRuntime(scenario.prompt, scenario.name);
  }

  // After all scenarios, print metrics
  console.log('\n' + '='.repeat(80));
  console.log('📊 Runtime Router Metrics Summary (Per Scenario)');
  console.log('='.repeat(80));

  Object.entries(scenarioMetrics).forEach(([name, m]) => {
    const decisions = m.activations + m.skips;
    const activationRate = decisions > 0 ? (m.activations / decisions) * 100 : 0;
    const avgLatency =
      m.routeLatencies.length > 0
        ? m.routeLatencies.reduce((a, b) => a + b, 0) / m.routeLatencies.length
        : 0;

    const driftRate = m.activations > 0 ? (m.schemaDriftDetections / m.activations) * 100 : 0;
    const filteringRate =
      m.activations > 0 ? (m.explicitFilteringDetections / m.activations) * 100 : 0;

    console.log(`\nScenario: ${name}`);
    console.log(`  Router decisions    : ${decisions}`);
    console.log(`  Activations         : ${m.activations}`);
    console.log(`  Skips               : ${m.skips}`);
    console.log(`  Activation rate     : ${activationRate.toFixed(1)}%`);
    console.log(`  Avg router latency  : ${avgLatency.toFixed(1)} ms`);
    console.log(`  Schema drift count  : ${m.schemaDriftDetections}`);
    console.log(`  Schema drift rate   : ${driftRate.toFixed(1)}% (of activations)`);
    console.log(`  Explicit filtering  : ${m.explicitFilteringDetections}`);
    console.log(`  Filtering rate      : ${filteringRate.toFixed(1)}% (of activations)`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('📊 Global Runtime Router Metrics');
  console.log('='.repeat(80));

  const globalDecisions = globalMetrics.activations + globalMetrics.skips;
  const globalActivationRate =
    globalDecisions > 0 ? (globalMetrics.activations / globalDecisions) * 100 : 0;
  const globalAvgLatency =
    globalMetrics.routeLatencies.length > 0
      ? globalMetrics.routeLatencies.reduce((a, b) => a + b, 0) /
        globalMetrics.routeLatencies.length
      : 0;

  const globalDriftRate =
    globalMetrics.activations > 0
      ? (globalMetrics.schemaDriftDetections / globalMetrics.activations) * 100
      : 0;
  const globalFilteringRate =
    globalMetrics.activations > 0
      ? (globalMetrics.explicitFilteringDetections / globalMetrics.activations) * 100
      : 0;

  console.log(`  Router decisions    : ${globalDecisions}`);
  console.log(`  Activations         : ${globalMetrics.activations}`);
  console.log(`  Skips               : ${globalMetrics.skips}`);
  console.log(`  Activation rate     : ${globalActivationRate.toFixed(1)}%`);
  console.log(`  Avg router latency  : ${globalAvgLatency.toFixed(1)} ms`);
  console.log(`  Schema drift count  : ${globalMetrics.schemaDriftDetections}`);
  console.log(`  Schema drift rate   : ${globalDriftRate.toFixed(1)}% (of activations)`);
  console.log(`  Explicit filtering  : ${globalMetrics.explicitFilteringDetections}`);
  console.log(`  Filtering rate      : ${globalFilteringRate.toFixed(1)}% (of activations)`);
}

// Run if executed directly
if (require.main === module) {
  runRuntimeRouterMetrics()
    .then(() => {
      console.log('\n✅ Runtime Router Metrics test finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Runtime Router Metrics test failed:', error);
      process.exit(1);
    });
}

export { runRuntimeRouterMetrics };

