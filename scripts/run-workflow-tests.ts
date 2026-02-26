/**
 * Run Workflow Generation Tests
 * 
 * Tests the autonomous workflow builder with 5 example prompts
 * and observes the results
 */

import * as fs from 'fs';
import * as path from 'path';

const __dirname = path.dirname(typeof require !== 'undefined' && require.main?.filename || process.argv[1] || '.');

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

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';

async function testWorkflowGeneration(prompt: string): Promise<TestResult['workflow']> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${API_URL}/api/generate-workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        mode: 'create'
      })
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data: any = await response.json();
    
    return {
      ...(data || {}),
      _responseTime: responseTime
    };
  } catch (error) {
    throw error;
  }
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

async function runTests() {
  console.log('🧪 Running Workflow Generation Tests\n');
  console.log(`📡 API URL: ${API_URL}\n`);
  
  // Load test prompts
  const testPromptsPath = path.join(__dirname, '../data/test_prompts.json');
  const testData = JSON.parse(fs.readFileSync(testPromptsPath, 'utf-8'));
  const prompts: TestPrompt[] = testData.test_prompts;
  
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
      const workflow = await testWorkflowGeneration(testPrompt.prompt);
      const responseTime = Date.now() - startTime;
      
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
      }
      
    } catch (error) {
      result.success = false;
      result.errors = [error instanceof Error ? error.message : String(error)];
      console.log(`❌ Error: ${result.errors[0]}`);
      
      if (result.errors[0]?.includes('ECONNREFUSED') || result.errors[0]?.includes('fetch failed')) {
        console.log(`\n💡 Tip: Make sure the worker service is running:`);
        console.log(`   cd worker && npm run dev`);
      }
    }
    
    results.push(result);
    
    // Wait a bit between tests to avoid overwhelming the API
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
  console.log(`⏱️  Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
  
  console.log(`\n📋 Detailed Results:`);
  results.forEach((result, idx) => {
    const status = result.success ? '✅' : '❌';
    const match = result.observations.matchesExpected ? '🎯' : '⚠️';
    console.log(`   ${status} ${match} Test ${idx + 1}: ${result.testName} (${result.responseTime || 0}ms)`);
  });
  
  // Save results
  const resultsPath = path.join(__dirname, '../data/test_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    apiUrl: API_URL,
    results: results
  }, null, 2), 'utf-8');
  
  console.log(`\n💾 Results saved to: ${resultsPath}`);
  
  return results;
}

// Run if executed directly
const isMainModule = typeof require !== 'undefined' && require.main === module;
if (isMainModule || process.argv[1]?.endsWith('run-workflow-tests.ts')) {
  runTests().catch(console.error);
}

export { runTests };
