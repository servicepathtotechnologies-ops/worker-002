/**
 * Direct Workflow Generation Test
 * 
 * Tests the workflow builder directly without needing the API server
 */

import fs from 'fs';
import path from 'path';
// IMPORTANT: Load environment variables FIRST before any other imports
import '../src/core/env-loader';
import { agenticWorkflowBuilder } from '../src/services/ai/workflow-builder';

interface TestPrompt {
  id: string;
  name: string;
  prompt: string;
  expected_complexity: string;
  expected_nodes: string[];
  expected_credentials: string[];
}

interface TestResult {
  testId: string;
  testName: string;
  prompt: string;
  success: boolean;
  responseTime?: number;
  workflow?: any;
  errors?: string[];
  observations: {
    nodeCount?: number;
    nodeTypes?: string[];
    connectionCount?: number;
    credentials?: string[];
    validationStatus?: string;
    matchesExpected?: boolean;
  };
}

function analyzeWorkflow(workflow: any, expected: TestPrompt): TestResult['observations'] {
  const observations: TestResult['observations'] = {};
  
  if (!workflow || !workflow.workflow) {
    return { matchesExpected: false };
  }

  const nodes = workflow.workflow.nodes || [];
  const edges = workflow.workflow.edges || [];
  const nodeTypes = nodes.map((n: any) => {
    const type = n.data?.type || n.type || 'unknown';
    return type;
  });

  observations.nodeCount = nodes.length;
  observations.nodeTypes = nodeTypes;
  observations.connectionCount = edges.length;
  observations.credentials = workflow.requiredCredentials?.map((c: any) => c.provider || c) || [];
  observations.validationStatus = workflow.validation?.valid ? 'valid' : 'needs_attention';
  
  // Check if expected nodes are present
  const hasExpectedNodes = expected.expected_nodes.every(expectedNode => 
    nodeTypes.some((actualNode: string) => 
      actualNode === expectedNode || actualNode.includes(expectedNode)
    )
  );
  
  // Check if expected credentials are identified
  const hasExpectedCredentials = expected.expected_credentials.every(expectedCred => 
    observations.credentials?.some((actualCred: string) => 
      actualCred.toLowerCase().includes(expectedCred.toLowerCase())
    )
  );

  observations.matchesExpected = hasExpectedNodes && hasExpectedCredentials;

  return observations;
}

async function runDirectTests() {
  console.log('🧪 Running Direct Workflow Generation Tests\n');
  
  // Load test prompts - limit to first 4 for testing
  const testPromptsPath = path.join(process.cwd(), 'data', 'test_prompts.json');
  const testData = JSON.parse(fs.readFileSync(testPromptsPath, 'utf-8'));
  const allPrompts: TestPrompt[] = testData.test_prompts;
  const prompts: TestPrompt[] = allPrompts.slice(0, 4); // Only test first 4 prompts
  
  const results: TestResult[] = [];
  
  for (let i = 0; i < prompts.length; i++) {
    const testPrompt = prompts[i];
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Test ${i + 1}/${prompts.length}: ${testPrompt.name}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`📝 Prompt: "${testPrompt.prompt}"`);
    console.log(`\n⏳ Generating workflow...`);
    
    const result: TestResult = {
      testId: testPrompt.id,
      testName: testPrompt.name,
      prompt: testPrompt.prompt,
      success: false,
      observations: {}
    };
    
    try {
      const startTime = Date.now();
      
      // Call workflow builder directly
      const workflow = await agenticWorkflowBuilder.generateFromPrompt(
        testPrompt.prompt,
        {},
        (progress: any) => {
          if (progress.stepName) {
            process.stdout.write(`\r   ${progress.stepName}... (${progress.progress}%)`);
          }
        }
      );
      
      const responseTime = Date.now() - startTime;
      process.stdout.write('\n'); // New line after progress
      
      result.success = true;
      result.responseTime = responseTime;
      result.workflow = workflow;
      
      // Analyze the workflow
      result.observations = analyzeWorkflow(workflow, testPrompt);
      
      console.log(`✅ Workflow generated successfully! (${responseTime}ms)`);
      console.log(`\n📊 Observations:`);
      console.log(`   Node Count: ${result.observations.nodeCount}`);
      console.log(`   Node Types: ${result.observations.nodeTypes?.join(', ') || 'N/A'}`);
      console.log(`   Connections: ${result.observations.connectionCount}`);
      console.log(`   Credentials: ${result.observations.credentials?.join(', ') || 'None'}`);
      console.log(`   Validation: ${result.observations.validationStatus}`);
      console.log(`   Matches Expected: ${result.observations.matchesExpected ? '✅ YES' : '❌ NO'}`);
      
      // Show expected vs actual
      console.log(`\n📋 Expected vs Actual:`);
      console.log(`   Expected Nodes: ${testPrompt.expected_nodes.join(', ')}`);
      console.log(`   Actual Nodes: ${result.observations.nodeTypes?.join(', ') || 'N/A'}`);
      console.log(`   Expected Credentials: ${testPrompt.expected_credentials.join(', ')}`);
      console.log(`   Actual Credentials: ${result.observations.credentials?.join(', ') || 'None'}`);
      
      // Show workflow structure
      if (workflow.workflow?.nodes) {
        console.log(`\n🔗 Workflow Structure:`);
        workflow.workflow.nodes.forEach((node: any, idx: number) => {
          const nodeType = node.data?.type || node.type || 'unknown';
          const nodeLabel = node.data?.label || nodeType;
          console.log(`   ${idx + 1}. ${nodeLabel} (${nodeType})`);
        });
        
        // Show connections
        if (workflow.workflow.edges && workflow.workflow.edges.length > 0) {
          console.log(`\n🔌 Connections:`);
          workflow.workflow.edges.slice(0, 5).forEach((edge: any, idx: number) => {
            const source = edge.source || edge.sourceHandle || 'unknown';
            const target = edge.target || edge.targetHandle || 'unknown';
            console.log(`   ${idx + 1}. ${source} → ${target}`);
          });
          if (workflow.workflow.edges.length > 5) {
            console.log(`   ... and ${workflow.workflow.edges.length - 5} more`);
          }
        }
      }
      
      // Show summary if available
      if (workflow.documentation) {
        console.log(`\n📝 Documentation: ${workflow.documentation.substring(0, 200)}...`);
      }
      if (workflow.estimatedComplexity) {
        console.log(`   Estimated Complexity: ${workflow.estimatedComplexity}`);
      }
      
    } catch (error) {
      result.success = false;
      result.errors = [error instanceof Error ? error.message : String(error)];
      console.log(`❌ Error: ${result.errors[0]}`);
      
      if (result.errors[0]?.includes('Ollama') || result.errors[0]?.includes('ECONNREFUSED')) {
        console.log(`\n💡 Tip: Make sure Ollama service is running:`);
        console.log(`   Check: ${process.env.OLLAMA_BASE_URL || 'http://ollama.ctrlchecks.ai:8000'}`);
      }
    }
    
    results.push(result);
    
    // Wait a bit between tests
    if (i < prompts.length - 1) {
      console.log(`\n⏸️  Waiting 2 seconds before next test...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('📈 Test Summary');
  console.log(`${'='.repeat(80)}`);
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const matching = results.filter(r => r.observations.matchesExpected).length;
  const avgResponseTime = results
    .filter(r => r.responseTime)
    .reduce((sum, r) => sum + (r.responseTime || 0), 0) / successful;
  
  console.log(`✅ Successful: ${successful}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  console.log(`🎯 Matches Expected: ${matching}/${successful}`);
  if (successful > 0) {
    console.log(`⏱️  Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
  }
  
  console.log(`\n📋 Detailed Results:`);
  results.forEach((result, idx) => {
    const status = result.success ? '✅' : '❌';
    const match = result.observations.matchesExpected ? '🎯' : '⚠️';
    console.log(`   ${status} ${match} Test ${idx + 1}: ${result.testName} (${result.responseTime || 0}ms)`);
    if (result.errors) {
      result.errors.forEach(err => console.log(`      Error: ${err}`));
    }
  });
  
  // Save results
  const resultsPath = path.join(__dirname, '../data/test_results_direct.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    testMethod: 'direct',
    results: results
  }, null, 2), 'utf-8');
  
  console.log(`\n💾 Results saved to: ${resultsPath}`);
  
  return results;
}

// Run if executed directly
const isMainModule = typeof require !== 'undefined' && require.main === module;
if (isMainModule || process.argv[1]?.endsWith('test-workflow-direct.ts')) {
  runDirectTests().catch(console.error);
}

export { runDirectTests };
