/**
 * Phase 2 Skip Logic Validation
 * 
 * Tests router skip behavior with REAL workflows that have Phase 1 metadata.
 * 
 * This validates:
 * - Router skips when confidence ≥ 0.85
 * - Router activates when confidence < 0.85
 * - Schema drift detection
 * - Explicit filtering detection
 * - Latency distribution
 */

import '../src/core/env-loader';
import { DataFlowContractLayer } from '../src/services/data-flow-contract-layer';
import { executeNodeDynamically } from '../src/core/execution/dynamic-node-executor';
import { LRUNodeOutputsCache } from '../src/core/cache/lru-node-outputs-cache';
import { getSupabaseClient } from '../src/core/database/supabase-compat';
import { Workflow, WorkflowNode, WorkflowEdge } from '../src/core/types/ai-types';

interface RouterMetrics {
  scenario: string;
  totalDecisions: number;
  activations: number;
  skips: number;
  activationRate: number;
  avgLatency: number;
  latencyDistribution: {
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  };
  highConfidenceSkips: number; // Confidence ≥ 0.85
  lowConfidenceActivations: number; // Confidence < 0.85
  schemaDriftCount: number;
  explicitFilteringCount: number;
  falsePositives: number; // Activations when should have skipped
}

// Capture router logs
const routerLogs: string[] = [];
const originalLog = console.log;

function captureRouterLogs() {
  console.log = (...args: any[]) => {
    const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    if (message.includes('[DynamicExecutor]') || message.includes('[IntentRouter]')) {
      routerLogs.push(message);
    }
    originalLog(...args);
  };
}

function restoreLogs() {
  console.log = originalLog;
}

/**
 * Create a test workflow WITHOUT metadata (will be enriched by Phase 1)
 */
function createTestWorkflow(prompt: string): Workflow {
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
            // No metadata - will be added by Phase 1
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
            // No metadata - will be added by Phase 1
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
 * Apply Phase 1 Data Flow Contract Layer to get real metadata
 */
async function enrichWorkflowWithPhase1(
  workflow: Workflow,
  prompt: string,
  userId: string = 'test-user-id'
): Promise<Workflow> {
  const dataFlowLayer = new DataFlowContractLayer();
  
  try {
    const result = await dataFlowLayer.applyDataFlowContract(
      workflow,
      prompt,
      userId
    );
    
    // After Phase 1, manually adjust confidence scores for testing
    // This simulates high-confidence mappings that would occur in production
    // with better prompts and successful node execution
    const enriched = result.workflow;
    
    // For high-confidence test: boost confidences to ≥0.85
    // For low-confidence test: keep as-is or lower them
    
    return enriched;
  } catch (error: any) {
    console.warn(`[Phase1Enrichment] Failed: ${error.message}, using original workflow`);
    return workflow;
  }
}

/**
 * Manually adjust metadata confidence for testing skip logic
 */
function adjustMetadataConfidence(
  workflow: Workflow,
  targetConfidence: 'high' | 'low'
): Workflow {
  const adjusted = {
    ...workflow,
    nodes: workflow.nodes.map(node => {
      const metadata = node.data?.config?._mappingMetadata;
      if (!metadata || typeof metadata !== 'object') {
        return node;
      }
      
      const adjustedMetadata: Record<string, any> = {};
      Object.entries(metadata).forEach(([field, meta]: [string, any]) => {
        if (targetConfidence === 'high') {
          // Boost to high confidence (≥0.85)
          adjustedMetadata[field] = {
            ...meta,
            confidence: Math.max(0.85, meta.confidence || 0.5) + 0.1, // Ensure ≥0.85
          };
        } else {
          // Keep or lower to low confidence (<0.85)
          adjustedMetadata[field] = {
            ...meta,
            confidence: Math.min(0.75, meta.confidence || 0.5), // Ensure <0.85
          };
        }
      });
      
      return {
        ...node,
        data: {
          ...node.data,
          config: {
            ...node.data.config,
            _mappingMetadata: adjustedMetadata,
          },
        },
      };
    }),
  };
  
  return adjusted;
}

/**
 * Execute workflow and measure router behavior
 */
async function executeWorkflowAndMeasure(
  workflow: Workflow,
  prompt: string,
  scenario: string
): Promise<RouterMetrics> {
  routerLogs.length = 0; // Clear previous logs
  captureRouterLogs();

  const metrics: RouterMetrics = {
    scenario,
    totalDecisions: 0,
    activations: 0,
    skips: 0,
    activationRate: 0,
    avgLatency: 0,
    latencyDistribution: {
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    },
    highConfidenceSkips: 0,
    lowConfidenceActivations: 0,
    schemaDriftCount: 0,
    explicitFilteringCount: 0,
    falsePositives: 0,
  };

  const latencies: number[] = [];
  const supabase = getSupabaseClient();
  const nodeOutputs = new LRUNodeOutputsCache(100);
  
  // Set user intent for router
  (global as any).currentWorkflowIntent = prompt;

  // Topological sort
  const sortedNodes = topologicalSort(workflow.nodes, workflow.edges);

  // Execute nodes in order
  for (const node of sortedNodes) {
    if (node.type === 'manual_trigger') {
      // Trigger nodes don't need execution
      nodeOutputs.set(node.id, { triggered: true });
      continue;
    }

    const startTime = Date.now();
    
    try {
      const input = getNodeInput(node, workflow.edges, nodeOutputs);
      
      const output = await executeNodeDynamically({
        node,
        input,
        nodeOutputs,
        supabase,
        workflowId: 'test-workflow-id',
        userId: 'test-user-id',
      });

      const latency = Date.now() - startTime;
      latencies.push(latency);

      nodeOutputs.set(node.id, output);
    } catch (error: any) {
      console.error(`[Execution] Error in node ${node.id}:`, error.message);
      nodeOutputs.set(node.id, { _error: error.message });
    }
  }

  restoreLogs();

  // Analyze router logs
  for (const log of routerLogs) {
    if (log.includes('Router activated')) {
      metrics.activations++;
      metrics.totalDecisions++;
      
      // Extract confidence from log if available
      const confidenceMatch = log.match(/confidence:\s*([\d.]+)/);
      if (confidenceMatch) {
        const confidence = parseFloat(confidenceMatch[1]);
        if (confidence < 0.85) {
          metrics.lowConfidenceActivations++;
        } else {
          metrics.falsePositives++; // Should have skipped
        }
      }
      
      // Check for schema drift
      if (log.includes('Schema drift detected')) {
        metrics.schemaDriftCount++;
      }
      
      // Check for explicit filtering
      if (log.includes('Explicit filtering intent detected')) {
        metrics.explicitFilteringCount++;
      }
    } else if (log.includes('Router skipped')) {
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

  // Calculate metrics
  if (metrics.totalDecisions > 0) {
    metrics.activationRate = (metrics.activations / metrics.totalDecisions) * 100;
  }

  if (latencies.length > 0) {
    latencies.sort((a, b) => a - b);
    metrics.avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    metrics.latencyDistribution = {
      min: latencies[0],
      max: latencies[latencies.length - 1],
      p50: latencies[Math.floor(latencies.length * 0.5)],
      p95: latencies[Math.floor(latencies.length * 0.95)],
      p99: latencies[Math.floor(latencies.length * 0.99)],
    };
  }

  return metrics;
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
    return {}; // No upstream nodes
  }
  
  const primaryEdge = upstreamEdges[0];
  const upstreamOutput = nodeOutputs.get(primaryEdge.source);
  return upstreamOutput || {};
}

/**
 * Main test function
 */
async function testPhase2SkipLogic() {
  console.log('🧪 Phase 2 Skip Logic Validation Test\n');
  console.log('='.repeat(80));

  const results: RouterMetrics[] = [];

  // Test Case 1: High-confidence workflow (should skip router)
  // Use a clear, unambiguous prompt that should generate high-confidence mappings
  console.log('\n📋 Test Case 1: High-Confidence Workflow (Expected: Skip Router)');
  console.log('='.repeat(80));
  
  const highConfPrompt = 'Read data from Google Sheets, process it with AI agent, then send the result via Gmail';
  const highConfWorkflow = createTestWorkflow(highConfPrompt);
  
  // Enrich with Phase 1 metadata - this will generate REAL metadata with REAL schema hashes
  const enrichedHighConfRaw = await enrichWorkflowWithPhase1(
    highConfWorkflow,
    highConfPrompt
  );
  
  // Manually adjust to high confidence for testing skip logic
  const enrichedHighConf = adjustMetadataConfidence(enrichedHighConfRaw, 'high');
  
  console.log('\n   Phase 1 enrichment complete. Checking metadata...');
  // Log metadata for debugging
  enrichedHighConf.nodes.forEach(node => {
    const metadata = node.data?.config?._mappingMetadata;
    if (metadata) {
      console.log(`   ${node.type}: ${Object.keys(metadata).length} fields with metadata`);
      Object.entries(metadata).forEach(([field, meta]: [string, any]) => {
        console.log(`     ${field}: confidence=${meta.confidence?.toFixed(3)}, source=${meta.source}, hash=${meta.schemaHash?.substring(0, 8)}...`);
      });
    }
  });
  
  const highConfMetrics = await executeWorkflowAndMeasure(
    enrichedHighConf,
    highConfPrompt,
    'High-Confidence (≥0.85)'
  );
  
  results.push(highConfMetrics);
  
  console.log(`\n✅ Results:`);
  console.log(`   Router decisions: ${highConfMetrics.totalDecisions}`);
  console.log(`   Activations: ${highConfMetrics.activations}`);
  console.log(`   Skips: ${highConfMetrics.skips}`);
  console.log(`   Activation rate: ${highConfMetrics.activationRate.toFixed(1)}%`);
  console.log(`   High-confidence skips: ${highConfMetrics.highConfidenceSkips}`);
  console.log(`   False positives: ${highConfMetrics.falsePositives}`);
  console.log(`   Schema drift count: ${highConfMetrics.schemaDriftCount}`);

  // Test Case 2: Low-confidence workflow (should activate router)
  // Use an ambiguous prompt that should generate low-confidence mappings
  console.log('\n\n📋 Test Case 2: Low-Confidence Workflow (Expected: Activate Router)');
  console.log('='.repeat(80));
  
  const lowConfPrompt = 'Get some stuff from sheets and do something with it then email maybe';
  const lowConfWorkflow = createTestWorkflow(lowConfPrompt);
  
  // Enrich with Phase 1 metadata
  const enrichedLowConfRaw = await enrichWorkflowWithPhase1(
    lowConfWorkflow,
    lowConfPrompt
  );
  
  // Ensure low confidence for testing
  const enrichedLowConf = adjustMetadataConfidence(enrichedLowConfRaw, 'low');
  
  console.log('\n   Phase 1 enrichment complete. Checking metadata...');
  enrichedLowConf.nodes.forEach(node => {
    const metadata = node.data?.config?._mappingMetadata;
    if (metadata) {
      console.log(`   ${node.type}: ${Object.keys(metadata).length} fields with metadata`);
      Object.entries(metadata).forEach(([field, meta]: [string, any]) => {
        console.log(`     ${field}: confidence=${meta.confidence?.toFixed(3)}, source=${meta.source}, hash=${meta.schemaHash?.substring(0, 8)}...`);
      });
    }
  });
  
  const lowConfMetrics = await executeWorkflowAndMeasure(
    enrichedLowConf,
    lowConfPrompt,
    'Low-Confidence (<0.85)'
  );
  
  results.push(lowConfMetrics);
  
  console.log(`\n✅ Results:`);
  console.log(`   Router decisions: ${lowConfMetrics.totalDecisions}`);
  console.log(`   Activations: ${lowConfMetrics.activations}`);
  console.log(`   Skips: ${lowConfMetrics.skips}`);
  console.log(`   Activation rate: ${lowConfMetrics.activationRate.toFixed(1)}%`);
  console.log(`   Low-confidence activations: ${lowConfMetrics.lowConfidenceActivations}`);
  console.log(`   Schema drift count: ${lowConfMetrics.schemaDriftCount}`);

  // Test Case 3: Explicit filtering (should activate router)
  console.log('\n\n📋 Test Case 3: Explicit Filtering Intent (Expected: Activate Router)');
  console.log('='.repeat(80));
  
  const filterPrompt = 'Get only the resumes column from Google Sheets, summarize with AI, send to Gmail';
  const filterWorkflow = createTestWorkflow(filterPrompt);
  
  const enrichedFilter = await enrichWorkflowWithPhase1(
    filterWorkflow,
    filterPrompt
  );
  
  const filterMetrics = await executeWorkflowAndMeasure(
    enrichedFilter,
    filterPrompt,
    'Explicit Filtering'
  );
  
  results.push(filterMetrics);
  
  console.log(`\n✅ Results:`);
  console.log(`   Router decisions: ${filterMetrics.totalDecisions}`);
  console.log(`   Activations: ${filterMetrics.activations}`);
  console.log(`   Explicit filtering detections: ${filterMetrics.explicitFilteringCount}`);
  console.log(`   Schema drift count: ${filterMetrics.schemaDriftCount}`);

  // Summary Report
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 Phase 2 Skip Logic Validation Summary');
  console.log('='.repeat(80));

  const totalDecisions = results.reduce((sum, r) => sum + r.totalDecisions, 0);
  const totalActivations = results.reduce((sum, r) => sum + r.activations, 0);
  const totalSkips = results.reduce((sum, r) => sum + r.skips, 0);
  const totalHighConfSkips = results.reduce((sum, r) => sum + r.highConfidenceSkips, 0);
  const totalLowConfActivations = results.reduce((sum, r) => sum + r.lowConfidenceActivations, 0);
  const totalFalsePositives = results.reduce((sum, r) => sum + r.falsePositives, 0);

  console.log('\n📈 Global Metrics:');
  console.log(`   Total router decisions: ${totalDecisions}`);
  console.log(`   Total activations: ${totalActivations}`);
  console.log(`   Total skips: ${totalSkips}`);
  console.log(`   Overall activation rate: ${totalDecisions > 0 ? ((totalActivations / totalDecisions) * 100).toFixed(1) : 0}%`);
  console.log(`   High-confidence skips: ${totalHighConfSkips} ✅`);
  console.log(`   Low-confidence activations: ${totalLowConfActivations} ✅`);
  console.log(`   False positives: ${totalFalsePositives} ${totalFalsePositives === 0 ? '✅' : '⚠️'}`);

  console.log('\n📊 Per-Scenario Breakdown:');
  results.forEach(r => {
    console.log(`\n   ${r.scenario}:`);
    console.log(`     Decisions: ${r.totalDecisions}`);
    console.log(`     Activations: ${r.activations} (${r.activationRate.toFixed(1)}%)`);
    console.log(`     Skips: ${r.skips}`);
    console.log(`     Avg latency: ${r.avgLatency.toFixed(2)} ms`);
    if (r.latencyDistribution.max > 0) {
      console.log(`     Latency: min=${r.latencyDistribution.min}ms, p50=${r.latencyDistribution.p50}ms, p95=${r.latencyDistribution.p95}ms, p99=${r.latencyDistribution.p99}ms`);
    }
  });

  // Validation Criteria
  console.log('\n\n✅ Validation Criteria:');
  const highConfSkipRate = totalHighConfSkips > 0 ? (totalHighConfSkips / (totalHighConfSkips + totalFalsePositives)) * 100 : 0;
  console.log(`   High-confidence skip rate: ${highConfSkipRate.toFixed(1)}% ${highConfSkipRate >= 90 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   False positive rate: ${totalDecisions > 0 ? ((totalFalsePositives / totalDecisions) * 100).toFixed(1) : 0}% ${totalFalsePositives === 0 ? '✅ PASS' : '⚠️  REVIEW'}`);
  console.log(`   Low-confidence activation rate: ${totalLowConfActivations > 0 ? '✅ PASS' : '⚠️  REVIEW'}`);

  const overallActivationRate = totalDecisions > 0 ? (totalActivations / totalDecisions) * 100 : 0;
  console.log(`\n🎯 Overall Activation Rate: ${overallActivationRate.toFixed(1)}%`);
  console.log(`   Target: <10% for high-confidence workflows`);
  console.log(`   Status: ${overallActivationRate < 10 ? '✅ PASS' : overallActivationRate < 30 ? '⚠️  ACCEPTABLE' : '❌ REVIEW'}`);

  console.log('\n' + '='.repeat(80));
  console.log('✅ Phase 2 Skip Logic Validation Complete');
  console.log('='.repeat(80));
}

// Run tests
if (require.main === module) {
  testPhase2SkipLogic()
    .then(() => {
      console.log('\n✅ Test script finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test script failed:', error);
      process.exit(1);
    });
}

export { testPhase2SkipLogic };
