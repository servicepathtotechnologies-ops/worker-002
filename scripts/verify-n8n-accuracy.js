/**
 * n8n-Accuracy Verification Script
 * Tests workflow generation accuracy against n8n requirements
 */

const axios = require('axios');

const TEST_SUITE = [
  {
    name: 'Basic Scheduled Slack',
    prompt: 'send good morning message to slack channel daily at 9am',
    expectedNodes: ['schedule', 'slack_message'],
    shouldPass: true,
    requiredConfig: {
      schedule: ['cron'],
      slack_message: ['channel', 'text']
    }
  },
  {
    name: 'Manual Email',
    prompt: 'send email to team when form submitted',
    expectedNodes: ['form', 'email'],
    shouldPass: true,
    requiredConfig: {
      email: ['to', 'subject', 'body']
    }
  },
  {
    name: 'Form to Database',
    prompt: 'when form is submitted, save data to database',
    expectedNodes: ['form', 'database_write'],
    shouldPass: true
  },
  {
    name: 'Webhook to API',
    prompt: 'when webhook is called, fetch data from API',
    expectedNodes: ['webhook', 'http_request'],
    shouldPass: true
  },
  {
    name: 'Unsupported Platform',
    prompt: 'post to instagram daily',
    expectedNodes: ['instagram'],
    shouldPass: false,
    expectedError: 'Missing required capabilities'
  },
  {
    name: 'Ambiguous Intent',
    prompt: 'do something',
    expectedNodes: [],
    shouldPass: false,
    expectedError: 'Could not parse user intent'
  }
];

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_ENDPOINT = `${API_URL}/api/generate-workflow`;

async function runTests() {
  console.log('🚀 Starting n8n-Accuracy Verification\n');
  console.log(`Testing against: ${API_ENDPOINT}\n`);
  
  let passed = 0;
  let failed = 0;
  const results = [];

  for (const test of TEST_SUITE) {
    console.log(`\n🔍 Testing: ${test.name}`);
    console.log(`   Prompt: "${test.prompt}"`);
    
    try {
      const response = await axios.post(API_ENDPOINT, {
        prompt: test.prompt,
        mode: 'create'
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = response.data;
      const testPassed = validateTest(test, result);
      
      if (testPassed) {
        console.log('   ✅ PASS');
        passed++;
        results.push({ test: test.name, status: 'PASS', details: 'Workflow generated correctly' });
      } else {
        console.log('   ❌ FAIL');
        console.log(`   Expected: ${test.shouldPass ? 'Success' : 'Failure'}`);
        console.log(`   Got: ${result.success ? 'Success' : 'Failure'}`);
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
        failed++;
        results.push({ 
          test: test.name, 
          status: 'FAIL', 
          details: result.error || 'Validation failed',
          expected: test.shouldPass,
          got: result.success
        });
      }

      // Additional validation for successful tests
      if (test.shouldPass && result.success && result.workflow) {
        const validationResult = validateWorkflow(test, result.workflow);
        if (!validationResult.valid) {
          console.log(`   ⚠️  WARN: ${validationResult.errors.join(', ')}`);
        }
      }

    } catch (error) {
      console.log('   ❌ ERROR');
      console.log(`   ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Response: ${JSON.stringify(error.response.data)}`);
      }
      failed++;
      results.push({ 
        test: test.name, 
        status: 'ERROR', 
        details: error.message 
      });
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Results Summary');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${TEST_SUITE.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Accuracy: ${((passed / TEST_SUITE.length) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED - System is n8n-accurate!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Review the implementation.');
    console.log('\nDetailed Results:');
    results.forEach(r => {
      console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.test}: ${r.details}`);
    });
    process.exit(1);
  }
}

function validateTest(test, result) {
  // Check if result matches expectation
  if (test.shouldPass) {
    if (!result.success) {
      return false;
    }
    
    if (!result.workflow || !result.workflow.nodes) {
      return false;
    }
    
    // Check expected nodes exist
    if (test.expectedNodes) {
      const nodeTypes = result.workflow.nodes.map(n => n.data.type);
      const allFound = test.expectedNodes.every(expected => 
        nodeTypes.some(type => type.includes(expected) || expected.includes(type))
      );
      if (!allFound) {
        return false;
      }
    }
    
    return true;
  } else {
    // Should fail
    if (result.success) {
      return false;
    }
    
    // Check for expected error message
    if (test.expectedError && result.error) {
      return result.error.toLowerCase().includes(test.expectedError.toLowerCase());
    }
    
    return true;
  }
}

function validateWorkflow(test, workflow) {
  const errors = [];
  
  // Check required config
  if (test.requiredConfig) {
    workflow.nodes.forEach(node => {
      const nodeType = node.data.type;
      const requiredFields = test.requiredConfig[nodeType];
      
      if (requiredFields) {
        const config = node.data.config || node.data;
        requiredFields.forEach(field => {
          if (!config[field] && config[field] !== false && config[field] !== 0) {
            errors.push(`Missing required config field: ${nodeType}.${field}`);
          }
        });
      }
    });
  }
  
  // Check for orphan nodes
  const nodeIds = new Set(workflow.nodes.map(n => n.id));
  const connectedNodeIds = new Set();
  
  workflow.edges.forEach(edge => {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });
  
  workflow.nodes.forEach(node => {
    if (!connectedNodeIds.has(node.id)) {
      const isTrigger = node.data.type?.includes('trigger') || 
                       node.data.type === 'schedule' ||
                       node.data.type === 'form' ||
                       node.data.type === 'webhook';
      
      if (!isTrigger) {
        errors.push(`Orphan node found: ${node.id} (${node.data.type})`);
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTests, validateTest, validateWorkflow };
