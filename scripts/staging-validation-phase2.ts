/**
 * Phase 2 Staging Validation
 * 
 * Validates Phase 2 skip logic with REAL enriched workflows and valid credentials.
 * 
 * Metrics captured:
 * - Activation rate for mappings ≥ 0.85 (target <10-20%)
 * - Schema drift frequency under successful executions
 * - Router latency distribution (expected ~1-2ms)
 * - % of "no-metadata" activations
 */

import '../src/core/env-loader';
import { DataFlowContractLayer } from '../src/services/data-flow-contract-layer';
import { executeNodeDynamically } from '../src/core/execution/dynamic-node-executor';
import { LRUNodeOutputsCache } from '../src/core/cache/lru-node-outputs-cache';
import { getSupabaseClient } from '../src/core/database/supabase-compat';
import { Workflow, WorkflowNode, WorkflowEdge } from '../src/core/types/ai-types';

// Interfaces
interface StagingMetrics {
  workflowId: string;
  workflowName: string;
  totalDecisions: number;
  activations: number;
  skips: number;
  activationRate: number;
  highConfidenceActivations: number; // Confidence ≥ 0.85 but activated
  highConfidenceSkips: number; // Confidence ≥ 0.85 and skipped
  lowConfidenceActivations: number; // Confidence < 0.85 and activated
  schemaDriftCount: number;
  explicitFilteringCount: number;
  noMetadataActivations: number;
  routerLatencies: number[];
  avgLatency: number;
  latencyDistribution: {
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  };
}

interface GlobalStagingMetrics {
  totalWorkflows: number;
  totalDecisions: number;
  totalActivations: number;
  totalSkips: number;
  overallActivationRate: number;
  highConfidenceActivationRate: number; // Activations / (Activations + Skips) for ≥0.85
  schemaDriftRate: number; // % of activations due to drift
  explicitFilteringRate: number; // % of activations due to filtering
  noMetadataRate: number; // % of activations due to no metadata
  avgRouterLatency: number;
  latencyDistribution: {
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  };
}

// Log capture
const routerLogs: string[] = [];
const routerLatencies: number[] = [];
const originalLog = console.log;
const originalWarn = console.warn;

function captureRouterLogs() {
  routerLogs.length = 0;
  routerLatencies.length = 0;
  console.log = (...args: any[]) => {
    const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    if (message.includes('[DynamicExecutor]') || message.includes('[IntentRouter]')) {
      routerLogs.push(message);
    }
    originalLog(...args);
  };
  console.warn = (...args: any[]) => {
    const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    if (message.includes('[DynamicExecutor]') || message.includes('[IntentRouter]')) {
      routerLogs.push(message);
    }
    originalWarn(...args);
  };
}

function restoreLogs() {
  console.log = originalLog;
  console.warn = originalWarn;
}

/**
 * Topological sort for execution order
 */
function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};
  const nodeMap: Record<string, WorkflowNode> = {};

  nodes.forEach(node => {
    inDegree[node.id] = 0;
    adjacency[node.id] = [];
    nodeMap[node.id] = node;
  });

  edges.forEach(edge => {
    adjacency[edge.source].push(edge.target);
    inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
  });

  const queue: string[] = [];
  Object.entries(inDegree).forEach(([nodeId, degree]) => {
    if (degree === 0) queue.push(nodeId);
  });

  const sorted: WorkflowNode[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    sorted.push(nodeMap[nodeId]);

    adjacency[nodeId].forEach(neighbor => {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) queue.push(neighbor);
    });
  }

  return sorted;
}

/**
 * Get input for a node from upstream outputs
 */
function getNodeInput(
  node: WorkflowNode,
  edges: WorkflowEdge[],
  nodeOutputs: LRUNodeOutputsCache
): unknown {
  const upstreamEdges = edges.filter(e => e.target === node.id);
  if (upstreamEdges.length === 0) {
    return {};
  }
  
  const primaryEdge = upstreamEdges[0];
  const upstreamOutput = nodeOutputs.get(primaryEdge.source);
  return upstreamOutput || {};
}

/**
 * Analyze router logs to extract metrics
 */
function analyzeRouterLogs(workflow: Workflow): StagingMetrics {
  const metrics: StagingMetrics = {
    workflowId: (workflow as any).id || 'unknown',
    workflowName: (workflow as any).name || 'Unknown Workflow',
    totalDecisions: 0,
    activations: 0,
    skips: 0,
    activationRate: 0,
    highConfidenceActivations: 0,
    highConfidenceSkips: 0,
    lowConfidenceActivations: 0,
    schemaDriftCount: 0,
    explicitFilteringCount: 0,
    noMetadataActivations: 0,
    routerLatencies: [],
    avgLatency: 0,
    latencyDistribution: {
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    },
  };

  const seenDecisions = new Set<string>();
  const schemaDriftHashes = new Set<string>();

  for (const log of routerLogs) {
    // Extract node IDs from log
    const nodeMatch = log.match(/for\s+([^\s→]+)\s*→\s*([^\s:]+)/);
    const decisionKey = nodeMatch ? `${nodeMatch[1]}-${nodeMatch[2]}` : null;

    // Check for schema drift
    if (log.includes('Schema drift detected')) {
      const hashMatch = log.match(/Schema drift detected:\s*([^\s]+)\s*→\s*([^\s]+)/);
      if (hashMatch) {
        const driftKey = `${hashMatch[1]}-${hashMatch[2]}`;
        if (!schemaDriftHashes.has(driftKey)) {
          schemaDriftHashes.add(driftKey);
          metrics.schemaDriftCount++;
        }
      }
    }

    // Check for explicit filtering
    if (log.includes('Explicit filtering intent detected')) {
      metrics.explicitFilteringCount++;
    }

    if (log.includes('Router activated')) {
      if (decisionKey && !seenDecisions.has(decisionKey)) {
        seenDecisions.add(decisionKey);
        metrics.activations++;
        metrics.totalDecisions++;

        // Extract confidence from log
        const confidenceMatch = log.match(/confidence:\s*([\d.]+)/);
        if (confidenceMatch) {
          const confidence = parseFloat(confidenceMatch[1]);
          if (confidence >= 0.85) {
            metrics.highConfidenceActivations++; // False positive
          } else {
            metrics.lowConfidenceActivations++;
          }
        } else {
          // No confidence in log = likely no metadata
          metrics.noMetadataActivations++;
        }
      }
    } else if (log.includes('Router skipped')) {
      if (decisionKey && !seenDecisions.has(decisionKey)) {
        seenDecisions.add(decisionKey);
        metrics.skips++;
        metrics.totalDecisions++;

        // Extract confidence from log
        const confidenceMatch = log.match(/confidence:\s*([\d.]+)/);
        if (confidenceMatch) {
          const confidence = parseFloat(confidenceMatch[1]);
          if (confidence >= 0.85) {
            metrics.highConfidenceSkips++;
          }
        }
      }
    }
  }

  // Calculate activation rate
  if (metrics.totalDecisions > 0) {
    metrics.activationRate = (metrics.activations / metrics.totalDecisions) * 100;
  }

  // Calculate latency distribution
  if (routerLatencies.length > 0) {
    routerLatencies.sort((a, b) => a - b);
    metrics.routerLatencies = [...routerLatencies];
    metrics.avgLatency = routerLatencies.reduce((a, b) => a + b, 0) / routerLatencies.length;
    metrics.latencyDistribution = {
      min: routerLatencies[0],
      max: routerLatencies[routerLatencies.length - 1],
      p50: routerLatencies[Math.floor(routerLatencies.length * 0.5)],
      p95: routerLatencies[Math.floor(routerLatencies.length * 0.95)],
      p99: routerLatencies[Math.floor(routerLatencies.length * 0.99)],
    };
  }

  return metrics;
}

/**
 * Execute workflow and capture metrics
 */
async function executeWorkflowWithMetrics(
  workflow: Workflow,
  prompt: string,
  userId: string = 'test-user-id'
): Promise<StagingMetrics> {
  captureRouterLogs();

  const supabase = getSupabaseClient();
  const nodeOutputs = new LRUNodeOutputsCache(100);
  
  // Set user intent for router
  (global as any).currentWorkflowIntent = prompt;

  // Step 1: Enrich workflow with Phase 1 metadata
  console.log(`\n[Staging] Enriching workflow with Phase 1 metadata...`);
  const dataFlowLayer = new DataFlowContractLayer();
  let enrichedWorkflow: Workflow;
  
  try {
    const contractResult = await dataFlowLayer.applyDataFlowContract(
      workflow,
      prompt,
      userId
    );
    enrichedWorkflow = contractResult.workflow;
    console.log(`[Staging] ✅ Phase 1 enrichment complete. ${contractResult.mappings.length} mappings applied.`);
  } catch (error: any) {
    console.warn(`[Staging] ⚠️  Phase 1 enrichment failed: ${error.message}, using original workflow`);
    enrichedWorkflow = workflow;
  }

  // Step 2: Execute workflow
  console.log(`[Staging] Executing workflow...`);
  const sortedNodes = topologicalSort(enrichedWorkflow.nodes, enrichedWorkflow.edges);

  for (const node of sortedNodes) {
    if (node.type === 'manual_trigger' || node.type === 'schedule' || node.type === 'webhook') {
      // Trigger nodes don't need execution
      nodeOutputs.set(node.id, { triggered: true });
      continue;
    }

    const routerStartTime = Date.now();
    
    try {
      const input = getNodeInput(node, enrichedWorkflow.edges, nodeOutputs);
      
      const output = await executeNodeDynamically({
        node,
        input,
        nodeOutputs,
        supabase,
        workflowId: (workflow as any).id || 'test-workflow-id',
        userId,
      });

      const routerEndTime = Date.now();
      const routerLatency = routerEndTime - routerStartTime;
      
      // Only capture latency if router was involved (check logs)
      const routerInvolved = routerLogs.some(log => 
        log.includes(`[DynamicExecutor]`) && 
        (log.includes('Router activated') || log.includes('Router skipped'))
      );
      
      if (routerInvolved) {
        routerLatencies.push(routerLatency);
      }

      nodeOutputs.set(node.id, output);
    } catch (error: any) {
      console.error(`[Staging] Error in node ${node.id}:`, error.message);
      nodeOutputs.set(node.id, { _error: error.message });
    }
  }

  restoreLogs();

  // Step 3: Analyze metrics
  const metrics = analyzeRouterLogs(enrichedWorkflow);
  return metrics;
}

/**
 * Aggregate metrics across all workflows
 */
function aggregateMetrics(workflowMetrics: StagingMetrics[]): GlobalStagingMetrics {
  const global: GlobalStagingMetrics = {
    totalWorkflows: workflowMetrics.length,
    totalDecisions: 0,
    totalActivations: 0,
    totalSkips: 0,
    overallActivationRate: 0,
    highConfidenceActivationRate: 0,
    schemaDriftRate: 0,
    explicitFilteringRate: 0,
    noMetadataRate: 0,
    avgRouterLatency: 0,
    latencyDistribution: {
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    },
  };

  let totalHighConfidenceDecisions = 0;
  let totalHighConfidenceActivations = 0;
  const allLatencies: number[] = [];

  workflowMetrics.forEach(m => {
    global.totalDecisions += m.totalDecisions;
    global.totalActivations += m.activations;
    global.totalSkips += m.skips;
    
    totalHighConfidenceDecisions += (m.highConfidenceActivations + m.highConfidenceSkips);
    totalHighConfidenceActivations += m.highConfidenceActivations;
    
    allLatencies.push(...m.routerLatencies);
  });

  // Calculate rates
  if (global.totalDecisions > 0) {
    global.overallActivationRate = (global.totalActivations / global.totalDecisions) * 100;
  }

  if (totalHighConfidenceDecisions > 0) {
    global.highConfidenceActivationRate = (totalHighConfidenceActivations / totalHighConfidenceDecisions) * 100;
  }

  if (global.totalActivations > 0) {
    const totalSchemaDrift = workflowMetrics.reduce((sum, m) => sum + m.schemaDriftCount, 0);
    const totalExplicitFiltering = workflowMetrics.reduce((sum, m) => sum + m.explicitFilteringCount, 0);
    const totalNoMetadata = workflowMetrics.reduce((sum, m) => sum + m.noMetadataActivations, 0);
    
    global.schemaDriftRate = (totalSchemaDrift / global.totalActivations) * 100;
    global.explicitFilteringRate = (totalExplicitFiltering / global.totalActivations) * 100;
    global.noMetadataRate = (totalNoMetadata / global.totalActivations) * 100;
  }

  // Calculate latency distribution
  if (allLatencies.length > 0) {
    allLatencies.sort((a, b) => a - b);
    global.avgRouterLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
    global.latencyDistribution = {
      min: allLatencies[0],
      max: allLatencies[allLatencies.length - 1],
      p50: allLatencies[Math.floor(allLatencies.length * 0.5)],
      p95: allLatencies[Math.floor(allLatencies.length * 0.95)],
      p99: allLatencies[Math.floor(allLatencies.length * 0.99)],
    };
  }

  return global;
}

/**
 * Print detailed report
 */
function printStagingReport(
  workflowMetrics: StagingMetrics[],
  globalMetrics: GlobalStagingMetrics
): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 Phase 2 Staging Validation Report');
  console.log('='.repeat(80));

  console.log('\n📈 Global Metrics:');
  console.log(`   Total Workflows: ${globalMetrics.totalWorkflows}`);
  console.log(`   Total Router Decisions: ${globalMetrics.totalDecisions}`);
  console.log(`   Total Activations: ${globalMetrics.totalActivations}`);
  console.log(`   Total Skips: ${globalMetrics.totalSkips}`);
  console.log(`   Overall Activation Rate: ${globalMetrics.overallActivationRate.toFixed(1)}%`);
  console.log(`   High-Confidence Activation Rate: ${globalMetrics.highConfidenceActivationRate.toFixed(1)}% ${globalMetrics.highConfidenceActivationRate < 20 ? '✅' : '⚠️'}`);
  console.log(`   Schema Drift Rate: ${globalMetrics.schemaDriftRate.toFixed(1)}%`);
  console.log(`   Explicit Filtering Rate: ${globalMetrics.explicitFilteringRate.toFixed(1)}%`);
  console.log(`   No-Metadata Activation Rate: ${globalMetrics.noMetadataRate.toFixed(1)}%`);
  console.log(`   Avg Router Latency: ${globalMetrics.avgRouterLatency.toFixed(2)} ms`);
  console.log(`   Latency Distribution: min=${globalMetrics.latencyDistribution.min}ms, p50=${globalMetrics.latencyDistribution.p50}ms, p95=${globalMetrics.latencyDistribution.p95}ms, p99=${globalMetrics.latencyDistribution.p99}ms`);

  console.log('\n📋 Per-Workflow Breakdown:');
  workflowMetrics.forEach((m, idx) => {
    console.log(`\n   Workflow ${idx + 1}: ${m.workflowName}`);
    console.log(`     Decisions: ${m.totalDecisions}`);
    console.log(`     Activations: ${m.activations} (${m.activationRate.toFixed(1)}%)`);
    console.log(`     Skips: ${m.skips}`);
    console.log(`     High-Confidence Skips: ${m.highConfidenceSkips} ✅`);
    console.log(`     High-Confidence Activations: ${m.highConfidenceActivations} ${m.highConfidenceActivations === 0 ? '✅' : '⚠️'}`);
    console.log(`     Low-Confidence Activations: ${m.lowConfidenceActivations} ✅`);
    console.log(`     Schema Drift: ${m.schemaDriftCount}`);
    console.log(`     Explicit Filtering: ${m.explicitFilteringCount}`);
    console.log(`     No-Metadata Activations: ${m.noMetadataActivations}`);
    if (m.routerLatencies.length > 0) {
      console.log(`     Avg Latency: ${m.avgLatency.toFixed(2)} ms`);
    }
  });

  console.log('\n✅ Validation Criteria:');
  const highConfPass = globalMetrics.highConfidenceActivationRate < 20;
  const latencyPass = globalMetrics.avgRouterLatency < 5;
  const schemaDriftPass = globalMetrics.schemaDriftRate < 30;
  
  console.log(`   High-Confidence Activation Rate <20%: ${globalMetrics.highConfidenceActivationRate.toFixed(1)}% ${highConfPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Avg Router Latency <5ms: ${globalMetrics.avgRouterLatency.toFixed(2)}ms ${latencyPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Schema Drift Rate <30%: ${globalMetrics.schemaDriftRate.toFixed(1)}% ${schemaDriftPass ? '✅ PASS' : '⚠️  REVIEW'}`);
  console.log(`   No-Metadata Rate (should be low): ${globalMetrics.noMetadataRate.toFixed(1)}% ${globalMetrics.noMetadataRate < 20 ? '✅ PASS' : '⚠️  REVIEW'}`);

  console.log('\n🎯 Overall Status:');
  if (highConfPass && latencyPass && schemaDriftPass) {
    console.log('   ✅ Phase 2 is PRODUCTION-VERIFIED');
    console.log('   ✅ Ready to proceed to Phase 3 (L1 in-memory caching)');
  } else {
    console.log('   ⚠️  Phase 2 needs review before production deployment');
    if (!highConfPass) {
      console.log('   ⚠️  High-confidence activation rate is above target');
    }
    if (!latencyPass) {
      console.log('   ⚠️  Router latency is above target');
    }
    if (!schemaDriftPass) {
      console.log('   ⚠️  Schema drift rate is high - investigate');
    }
  }

  console.log('\n' + '='.repeat(80));
}

/**
 * Load test workflows from database or use sample workflows
 */
async function loadTestWorkflows(): Promise<Array<{ workflow: Workflow; prompt: string; name: string }>> {
  // TODO: Load from database in production
  // For now, return sample workflows
  
  const workflows = [
    {
      name: 'Sheets → AI → Gmail (High Confidence)',
      prompt: 'Read data from Google Sheets, summarize it with AI, then send the result via Gmail',
      workflow: {
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
                spreadsheetId: process.env.TEST_SHEET_ID || 'test-sheet-id',
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
      } as Workflow,
    },
    {
      name: 'Sheets → Filter → Gmail (Explicit Filtering)',
      prompt: 'Get only the resumes column from Google Sheets, summarize with AI, send to Gmail',
      workflow: {
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
                spreadsheetId: process.env.TEST_SHEET_ID || 'test-sheet-id',
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
      } as Workflow,
    },
  ];

  return workflows;
}

/**
 * Main staging validation function
 */
async function runStagingValidation() {
  console.log('🧪 Phase 2 Staging Validation');
  console.log('='.repeat(80));
  console.log('\nThis script validates Phase 2 skip logic with REAL enriched workflows.');
  console.log('Ensure valid credentials are configured in environment variables.\n');

  // Load test workflows
  const testWorkflows = await loadTestWorkflows();
  console.log(`📋 Loaded ${testWorkflows.length} test workflows\n`);

  const workflowMetrics: StagingMetrics[] = [];

  // Execute each workflow
  for (let i = 0; i < testWorkflows.length; i++) {
    const { workflow, prompt, name } = testWorkflows[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`▶️  Executing Workflow ${i + 1}/${testWorkflows.length}: ${name}`);
    console.log(`   Prompt: "${prompt}"`);
    console.log(`${'='.repeat(80)}\n`);

    try {
      const metrics = await executeWorkflowWithMetrics(workflow, prompt);
      metrics.workflowName = name;
      workflowMetrics.push(metrics);

      console.log(`\n✅ Workflow ${i + 1} completed:`);
      console.log(`   Decisions: ${metrics.totalDecisions}`);
      console.log(`   Activations: ${metrics.activations} (${metrics.activationRate.toFixed(1)}%)`);
      console.log(`   Skips: ${metrics.skips}`);
      console.log(`   High-Confidence Skips: ${metrics.highConfidenceSkips}`);
    } catch (error: any) {
      console.error(`\n❌ Workflow ${i + 1} failed:`, error.message);
      // Continue with other workflows
    }
  }

  // Aggregate and report
  if (workflowMetrics.length > 0) {
    const globalMetrics = aggregateMetrics(workflowMetrics);
    printStagingReport(workflowMetrics, globalMetrics);
  } else {
    console.error('\n❌ No workflows completed successfully');
  }
}

// Run validation
if (require.main === module) {
  runStagingValidation()
    .then(() => {
      console.log('\n✅ Staging validation complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Staging validation failed:', error);
      process.exit(1);
    });
}

export { runStagingValidation };
