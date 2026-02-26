/**
 * Test script for Data Flow Contract Layer (Mask Layer)
 * 
 * This tests the mask layer that runs AFTER credentials/inputs are provided.
 * It should:
 * 1. Execute nodes to get REAL JSON output
 * 2. Map properties intelligently based on user intent
 * 3. Write template expressions into node configs
 */

import '../src/core/env-loader';
import { DataFlowContractLayer } from '../src/services/data-flow-contract-layer';
import { Workflow, WorkflowNode, WorkflowEdge } from '../src/core/types/ai-types';

async function runTestWithPrompt(
  workflow: Workflow,
  prompt: string,
  testName: string,
  userId: string = 'test-user-id'
) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 ${testName}`);
  console.log(`   User prompt: "${prompt}"`);
  console.log(`${'='.repeat(80)}\n`);
  
  const dataFlowLayer = new DataFlowContractLayer();
  
  try {
    console.log('   Executing mask layer...');
    const result = await dataFlowLayer.applyDataFlowContract(
      workflow,
      prompt,
      userId
    );
    
    console.log(`\n✅ Results:`);
    console.log(`   - Executed ${result.executionResults.length} nodes`);
    console.log(`   - Created ${result.mappings.length} property mappings\n`);
    
    // Show execution results
    console.log('   Node Execution Results:');
    result.executionResults.forEach(result => {
      const node = workflow.nodes.find(n => n.id === result.nodeId);
      const keyCount = result.outputKeys.length;
      const keysPreview = result.outputKeys.slice(0, 8).join(', ');
      console.log(`   - ${node?.type || 'unknown'} (${result.nodeId}):`);
      console.log(`     Output keys (${keyCount}): ${keysPreview}${keyCount > 8 ? '...' : ''}`);
      console.log(`     Has real output: ${result.output !== null ? '✅' : '❌'}`);
    });
    
    // Show mappings
    if (result.mappings.length > 0) {
      console.log('\n   Property Mappings Created:');
      result.mappings.forEach(mapping => {
        const sourceNode = workflow.nodes.find(n => n.id === mapping.sourceNodeId);
        const targetNode = workflow.nodes.find(n => n.id === mapping.targetNodeId);
        console.log(`   ✅ ${targetNode?.type || mapping.targetNodeId}.${mapping.targetField}`);
        console.log(`      = ${mapping.templateExpression}`);
        console.log(`      (from ${sourceNode?.type || mapping.sourceNodeId}.${mapping.sourceField})`);
      });
    } else {
      console.log('\n   ⚠️  No property mappings created');
    }
    
    // Check specific nodes
    const llmNode = result.workflow.nodes.find(n => n.type === 'ai_agent' || n.type === 'openai_gpt');
    const gmailNode = result.workflow.nodes.find(n => n.type === 'google_gmail' || n.type === 'gmail');
    
    if (llmNode) {
      console.log(`\n   ${llmNode.type} Node Config:`);
      Object.entries(llmNode.data.config).forEach(([key, value]) => {
        if (typeof value === 'string' && value.includes('{{$json.')) {
          console.log(`   - ${key}: ${value}`);
        }
      });
    }
    
    if (gmailNode) {
      console.log(`\n   ${gmailNode.type} Node Config:`);
      Object.entries(gmailNode.data.config).forEach(([key, value]) => {
        if (typeof value === 'string' && value.includes('{{$json.')) {
          console.log(`   - ${key}: ${value}`);
        }
      });
    }
    
    return result;
  } catch (error: any) {
    console.error(`\n❌ Test Failed: ${error.message}`);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    return null;
  }
}

async function testDataFlowContractLayer() {
  console.log('🧪 Testing Data Flow Contract Layer (Mask Layer) with Multiple Prompts...\n');
  
  // Create a test workflow: Google Sheets → LLM → Gmail
  const testWorkflow: Workflow = {
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
            // Note: In real scenario, credentials would be injected here
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
            // These should be filled by mask layer
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
            // These should be filled by mask layer
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
  
  // Test Case 1: Basic flow without specific column filtering
  await runTestWithPrompt(
    testWorkflow,
    'Get data from Google Sheets, summarize with AI, send to Gmail',
    'Test Case 1: Basic flow (Google Sheets → LLM → Gmail)'
  );
  
  // Test Case 2: With specific column filtering
  await runTestWithPrompt(
    testWorkflow,
    'Get resumes column from Google Sheets, summarize with AI, send to Gmail',
    'Test Case 2: Column filtering ("resumes column")'
  );
  
  // Test Case 3: Multiple column filtering
  await runTestWithPrompt(
    testWorkflow,
    'Extract only the Name and Email columns from Google Sheets, format them nicely with AI, and email the result',
    'Test Case 3: Multiple column filtering'
  );
  
  // Test Case 4: Different wording for same intent
  await runTestWithPrompt(
    testWorkflow,
    'Read Google Sheets data, use AI to create a summary, then email that summary',
    'Test Case 4: Different wording (read/summary/email)'
  );
  
  // Test Case 5: Explicit data flow
  await runTestWithPrompt(
    testWorkflow,
    'Take all rows from Google Sheets, send them to AI for processing, then email the AI response',
    'Test Case 5: Explicit data flow (rows → AI → email)'
  );
  
  // Test Case 6: Short prompt
  await runTestWithPrompt(
    testWorkflow,
    'Sheets to AI to Gmail',
    'Test Case 6: Short prompt'
  );
  
  // Test Case 7: Complex prompt with multiple instructions
  await runTestWithPrompt(
    testWorkflow,
    'Get the resumes section from my Google Sheet, use artificial intelligence to create a professional summary, and send that summary via Gmail to my email address',
    'Test Case 7: Complex prompt with multiple instructions'
  );
  
  // Test Case 8: Filtering with different column name
  await runTestWithPrompt(
    testWorkflow,
    'Get the Name column from Google Sheets, process it with AI, send to Gmail',
    'Test Case 8: Different column name ("Name" instead of "Resumes")'
  );
  
  console.log('\n\n' + '='.repeat(80));
  console.log('✅ All tests completed!');
  console.log('='.repeat(80));
  console.log('\n📝 Summary:');
  console.log('   The mask layer should:');
  console.log('   1. Execute nodes to get REAL JSON (not schemas)');
  console.log('   2. Extract property keys from actual JSON structure');
  console.log('   3. Map properties intelligently based on user intent');
  console.log('   4. Write template expressions like {{$json.items}} into node configs');
  console.log('   5. Handle various prompt phrasings and column filtering');
}

// Run tests
if (require.main === module) {
  testDataFlowContractLayer()
    .then(() => {
      console.log('\n✅ Test script finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test script failed:', error);
      process.exit(1);
    });
}

export { testDataFlowContractLayer };
