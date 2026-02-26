/**
 * Test Google Sheets → LLM → Gmail Flow
 * 
 * Tests intelligent JSON property selection and data flow
 */

import '../src/core/env-loader';
import { agenticWorkflowBuilder } from '../src/services/ai/workflow-builder';

interface NodeConfig {
  id: string;
  type: string;
  data: any;
}

interface WorkflowAnalysis {
  nodes: NodeConfig[];
  dataFlow: {
    fromNode: string;
    toNode: string;
    field: string;
    templateExpression: string;
    propertySelected: string;
  }[];
  propertySelectionLogs: string[];
  userIntentDetected: boolean;
}

function analyzeDataFlow(workflow: any): WorkflowAnalysis {
  const analysis: WorkflowAnalysis = {
    nodes: [],
    dataFlow: [],
    propertySelectionLogs: [],
    userIntentDetected: false
  };

  if (!workflow?.workflow?.nodes) {
    return analysis;
  }

  // Extract nodes
  analysis.nodes = workflow.workflow.nodes.map((node: any) => ({
    id: node.id,
    type: node.data?.type || node.type || 'unknown',
    data: node.data || {}
  }));

  // Analyze data flow by examining node configurations
  const nodes = analysis.nodes;
  for (let i = 1; i < nodes.length; i++) {
    const currentNode = nodes[i];
    const previousNode = nodes[i - 1];
    
    // Check all fields in current node config - try multiple locations
    const config = currentNode.data?.config || currentNode.data?.configValues || currentNode.data || {};
    
    // Also check if config is nested differently
    const allConfigFields = {
      ...config,
      ...(currentNode.data?.configValues || {}),
      ...(currentNode.data || {})
    };
    
    for (const [fieldName, fieldValue] of Object.entries(allConfigFields)) {
      // Skip metadata fields
      if (['id', 'type', 'label', 'position', 'autoConfigured', 'autoConfigConfidence'].includes(fieldName)) {
        continue;
      }
      
      if (typeof fieldValue === 'string' && fieldValue.includes('{{')) {
        // Extract the property being used (supports both $json.field and other formats)
        const jsonMatch = fieldValue.match(/\{\{\$json\.([^}]+)\}\}/);
        const inputMatch = fieldValue.match(/\{\{input\.([^}]+)\}\}/);
        const nodeMatch = fieldValue.match(/\{\{([^}]+)\.([^}]+)\}\}/);
        
        if (jsonMatch) {
          const propertySelected = jsonMatch[1];
          
          analysis.dataFlow.push({
            fromNode: previousNode.type,
            toNode: currentNode.type,
            field: fieldName,
            templateExpression: fieldValue,
            propertySelected: propertySelected
          });
        } else if (inputMatch || nodeMatch) {
          // Also capture other template formats
          const propertySelected = inputMatch ? inputMatch[1] : (nodeMatch ? `${nodeMatch[1]}.${nodeMatch[2]}` : 'unknown');
          
          analysis.dataFlow.push({
            fromNode: previousNode.type,
            toNode: currentNode.type,
            field: fieldName,
            templateExpression: fieldValue,
            propertySelected: propertySelected
          });
        }
      }
    }
  }

  return analysis;
}

async function testSheetsToLLMToGmail() {
  console.log('🧪 Testing Google Sheets → LLM → Gmail Flow\n');
  console.log('='.repeat(80));
  
  // Test prompts with different scenarios
  const testPrompts = [
    {
      name: 'Test 1: Basic Flow (All Data)',
      prompt: 'Get data from Google Sheets and send it to Gmail using an LLM to format it',
      expectedFlow: ['google_sheets', 'ai_agent', 'google_gmail']
    },
    {
      name: 'Test 2: Filtered Data (Resumes Column)',
      prompt: 'Get data from Google Sheets and send only the resumes column to Gmail using an LLM to format it',
      expectedFlow: ['google_sheets', 'ai_agent', 'google_gmail'],
      expectedFilter: 'resumes'
    },
    {
      name: 'Test 3: Specific Column Mentioned',
      prompt: 'Read Google Sheets data and forward the name column to an AI agent, then send the result to Gmail',
      expectedFlow: ['google_sheets', 'ai_agent', 'google_gmail'],
      expectedFilter: 'name'
    }
  ];

  for (const testCase of testPrompts) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📝 ${testCase.name}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Prompt: "${testCase.prompt}"`);
    console.log(`\n⏳ Generating workflow...\n`);

    try {
      const startTime = Date.now();
      
      // Capture console logs for property selection analysis
      const originalLog = console.log;
      const logs: string[] = [];
      
      // Override console.log to capture property selection logs
      console.log = (...args: any[]) => {
        const logMessage = args.map(arg => 
          typeof arg === 'string' ? arg : JSON.stringify(arg)
        ).join(' ');
        
        // Capture property selection related logs
        if (logMessage.includes('[Property Selection]') || 
            logMessage.includes('[Data Flow]') ||
            logMessage.includes('[Final Validation]') ||
            logMessage.includes('intelligent selection') ||
            logMessage.includes('User specified')) {
          logs.push(logMessage);
        }
        
        // Also capture to original console
        originalLog(...args);
      };

      // Generate workflow
      const workflow = await agenticWorkflowBuilder.generateFromPrompt(
        testCase.prompt,
        {},
        (progress: any) => {
          if (progress.stepName) {
            process.stdout.write(`\r   ${progress.stepName}... (${progress.progress}%)`);
          }
        }
      );

      // Restore console.log
      console.log = originalLog;
      process.stdout.write('\n');

      const responseTime = Date.now() - startTime;
      
      console.log(`\n✅ Workflow generated successfully! (${responseTime}ms)`);
      
      // Analyze workflow
      const analysis = analyzeDataFlow(workflow);
      
      // Display analysis
      console.log(`\n📊 Workflow Analysis:`);
      console.log(`   Nodes: ${analysis.nodes.map(n => n.type).join(' → ')}`);
      console.log(`   Node Count: ${analysis.nodes.length}`);
      
      // Check if expected nodes are present
      const nodeTypes = analysis.nodes.map(n => n.type);
      const hasExpectedNodes = testCase.expectedFlow.every(expected => 
        nodeTypes.some(actual => actual.includes(expected) || expected.includes(actual))
      );
      
      console.log(`   Expected Flow: ${testCase.expectedFlow.join(' → ')}`);
      console.log(`   Matches Expected: ${hasExpectedNodes ? '✅ YES' : '❌ NO'}`);
      
      // Display data flow
      if (analysis.dataFlow.length > 0) {
        console.log(`\n🔗 Data Flow Analysis:`);
        analysis.dataFlow.forEach((flow, idx) => {
          console.log(`   ${idx + 1}. ${flow.fromNode} → ${flow.toNode}`);
          console.log(`      Field: ${flow.field}`);
          console.log(`      Template: ${flow.templateExpression}`);
          console.log(`      Property Selected: ${flow.propertySelected}`);
          
          // Check if filtering is applied (for filtered test cases)
          if (testCase.expectedFilter) {
            const hasFilter = flow.propertySelected.toLowerCase().includes(testCase.expectedFilter.toLowerCase()) ||
                            flow.templateExpression.toLowerCase().includes(testCase.expectedFilter.toLowerCase());
            console.log(`      Filter Applied: ${hasFilter ? '✅ YES' : '❌ NO'}`);
          }
        });
      } else {
        console.log(`\n⚠️  No data flow detected (no template expressions found)`);
      }
      
      // Display property selection logs
      if (logs.length > 0) {
        console.log(`\n📝 Property Selection Logs:`);
        logs.forEach((log, idx) => {
          console.log(`   ${idx + 1}. ${log}`);
          
          // Check for user intent detection
          if (log.includes('User specified') || log.includes('resumes') || log.includes('column')) {
            analysis.userIntentDetected = true;
          }
        });
      } else {
        console.log(`\n⚠️  No property selection logs captured`);
      }
      
      // Display node configurations
      console.log(`\n⚙️  Node Configurations:`);
      analysis.nodes.forEach((node, idx) => {
        console.log(`\n   ${idx + 1}. ${node.type} (${node.id}):`);
        
        // Try multiple locations for config
        const config = node.data?.config || node.data?.configValues || node.data || {};
        const relevantFields = ['userInput', 'input', 'data', 'text', 'message', 'body', 'subject', 'to', 'inputData'];
        
        // Show all config fields that contain template expressions
        console.log(`      All config keys: ${Object.keys(config).join(', ')}`);
        
        relevantFields.forEach(field => {
          if (config[field] !== undefined) {
            const value = typeof config[field] === 'string' 
              ? config[field].substring(0, 150) 
              : JSON.stringify(config[field]).substring(0, 150);
            console.log(`      ${field}: ${value}`);
          }
        });
        
        // Show any template expressions found
        for (const [key, value] of Object.entries(config)) {
          if (typeof value === 'string' && value.includes('{{')) {
            if (!relevantFields.includes(key)) {
              console.log(`      ${key}: ${value.substring(0, 150)}`);
            }
          }
        }
      });
      
      // Summary
      console.log(`\n📋 Test Summary:`);
      console.log(`   ✅ Workflow Generated: YES`);
      console.log(`   ✅ Expected Nodes Present: ${hasExpectedNodes ? 'YES' : 'NO'}`);
      console.log(`   ✅ Data Flow Detected: ${analysis.dataFlow.length > 0 ? 'YES' : 'NO'}`);
      console.log(`   ✅ User Intent Detected: ${analysis.userIntentDetected ? 'YES' : 'NO'}`);
      
      if (testCase.expectedFilter) {
        const filterApplied = analysis.dataFlow.some(flow => 
          flow.propertySelected.toLowerCase().includes(testCase.expectedFilter!.toLowerCase()) ||
          flow.templateExpression.toLowerCase().includes(testCase.expectedFilter!.toLowerCase())
        );
        console.log(`   ✅ Filter Applied: ${filterApplied ? 'YES' : 'NO'}`);
      }
      
    } catch (error) {
      console.log(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      console.error(error);
    }
    
    // Wait between tests
    if (testPrompts.indexOf(testCase) < testPrompts.length - 1) {
      console.log(`\n⏸️  Waiting 3 seconds before next test...\n`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ All tests completed!');
  console.log(`${'='.repeat(80)}\n`);
}

// Run if executed directly
const isMainModule = typeof require !== 'undefined' && require.main === module;
if (isMainModule || process.argv[1]?.endsWith('test-sheets-llm-gmail-flow.ts')) {
  testSheetsToLLMToGmail().catch(console.error);
}

export { testSheetsToLLMToGmail };
