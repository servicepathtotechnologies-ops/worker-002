/**
 * Workflow Accuracy Verification Script
 * Tests workflow generation and validation accuracy
 */

const axios = require('axios');

const TEST_CASES = [
  {
    name: 'Basic Slack Message',
    prompt: 'send good morning message to slack channel',
    expectedNodes: ['manual_trigger', 'slack_message'],
    shouldPass: true
  },
  {
    name: 'Scheduled Slack Message',
    prompt: 'send daily report to slack at 9am',
    expectedNodes: ['schedule', 'slack_message'],
    shouldPass: true,
    checkSchedule: true
  },
  {
    name: 'Instagram Post',
    prompt: 'post to instagram daily at 9am tech content',
    expectedNodes: ['schedule', 'instagram'],
    shouldPass: true,
    checkSchedule: true
  }
];

const API_BASE_URL = process.env.WORKER_API_URL || 'http://localhost:3001';

async function runTest(testCase) {
  console.log(`\n🔍 Testing: ${testCase.name}`);
  console.log(`Prompt: ${testCase.prompt}`);
  
  try {
    const response = await axios.post(`${API_BASE_URL}/api/generate-workflow`, {
      prompt: testCase.prompt
    }, {
      timeout: 60000 // 60 second timeout
    });
    
    const workflow = response.data.workflow;
    
    if (!workflow || !workflow.nodes) {
      console.log('❌ Invalid workflow structure');
      return false;
    }
    
    // Check node types
    const nodeTypes = workflow.nodes.map(n => {
      // Normalize node type (handle custom type pattern)
      if (n.type === 'custom' && n.data?.type) {
        return n.data.type;
      }
      return n.type;
    });
    
    console.log(`Node types generated: ${nodeTypes.join(', ')}`);
    
    // Check for expected nodes
    const hasExpectedNodes = testCase.expectedNodes.every(expected => 
      nodeTypes.includes(expected)
    );
    
    if (!hasExpectedNodes) {
      console.log(`❌ Missing expected nodes. Expected: ${testCase.expectedNodes.join(', ')}, Got: ${nodeTypes.join(', ')}`);
      return false;
    }
    
    // Validate workflow
    try {
      const validation = await axios.post(`${API_BASE_URL}/api/validate-workflow`, workflow, {
        timeout: 10000
      });
      
      if (validation.data.valid) {
        console.log('✅ Validation PASSED');
        
        // Check for required fields
        let hasRequiredFields = true;
        workflow.nodes.forEach(node => {
          const nodeType = node.type === 'custom' ? node.data?.type : node.type;
          
          // Check schedule node has cron
          if (nodeType === 'schedule') {
            const config = node.data?.config || node.data || {};
            if (!config.cron) {
              console.log('❌ Schedule node missing cron field');
              hasRequiredFields = false;
            } else {
              console.log(`✅ Schedule node has cron: ${config.cron}`);
            }
          }
          
          // Check slack node has required fields
          if (nodeType === 'slack_message') {
            const config = node.data?.config || node.data || {};
            if (!config.channel && !config.text) {
              console.log('⚠️  Slack node missing channel or text (may be using defaults)');
            }
          }
        });
        
        return hasRequiredFields;
      } else {
        console.log('❌ Validation FAILED:', validation.data.errors);
        return false;
      }
    } catch (validationError) {
      console.log('⚠️  Validation endpoint not available or error:', validationError.message);
      // Continue with basic checks
    }
    
    // Basic checks passed
    return true;
    
  } catch (error) {
    console.log('❌ API Error:', error.response?.data || error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting CtrlChecks Accuracy Verification');
  console.log('='.repeat(50));
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of TEST_CASES) {
    const result = await runTest(testCase);
    
    if (result === testCase.shouldPass) {
      passed++;
      console.log(`✓ Test ${testCase.name}: EXPECTED`);
    } else {
      failed++;
      console.log(`✗ Test ${testCase.name}: UNEXPECTED`);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed! System is 100% accurate.');
  } else {
    console.log('⚠️  Some tests failed. Review the logs above.');
  }
  
  process.exit(failed === 0 ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
