const fs = require('fs');
const path = require('path');

/**
 * Comprehensive enhancement: Add ALL 13 new nodes to sample workflows
 * and update descriptions to help AI learn when to use them
 */

const NEW_NODES = {
  delay: {
    keywords: ['wait', 'pause', 'delay', 'throttle', 'rate limit', 'cooldown', 'sleep'],
    useCases: ['rate limiting', 'waiting for external systems', 'throttling API calls'],
    config: { duration: 2000, unit: 'milliseconds' },
    description: 'Adds a delay between steps to prevent rate limiting'
  },
  timeout: {
    keywords: ['timeout', 'time limit', 'deadline', 'abort', 'max time', 'execution time'],
    useCases: ['API call timeout', 'prevent long-running operations', 'SLA enforcement'],
    config: { limit: 30000 },
    description: 'Fails workflow if execution exceeds time limit'
  },
  return: {
    keywords: ['return', 'exit', 'stop', 'break', 'terminate', 'end workflow', 'early exit'],
    useCases: ['conditional termination', 'return result from sub-workflow', 'early exit'],
    config: { includeInput: true },
    description: 'Stops workflow execution and returns specified data'
  },
  execute_workflow: {
    keywords: ['sub-workflow', 'execute workflow', 'call workflow', 'invoke workflow', 'nested workflow', 'modular'],
    useCases: ['modular workflows', 'reusable components', 'sub-workflow execution'],
    config: { workflowId: '{{$json.subWorkflowId}}', input: '{{$json}}', waitForCompletion: true },
    description: 'Executes another workflow and returns its result'
  },
  try_catch: {
    keywords: ['try', 'catch', 'error', 'exception', 'handle', 'error handling', 'fallback'],
    useCases: ['API error handling', 'graceful error recovery', 'fallback logic'],
    config: {},
    description: 'Executes a branch and catches errors, routing to error handler'
  },
  retry: {
    keywords: ['retry', 'attempt', 'repeat', 'backoff', 'retry on failure', 'retry logic'],
    useCases: ['transient failures', 'API retries', 'improve reliability'],
    config: { maxAttempts: 3, delayBetween: 1000, backoff: 'exponential' },
    description: 'Retries a branch on failure up to a maximum number of attempts'
  },
  parallel: {
    keywords: ['parallel', 'concurrent', 'simultaneous', 'fork', 'join', 'run in parallel', 'at the same time', 'batch'],
    useCases: ['parallel API calls', 'batch processing', 'speed up workflow'],
    config: { mode: 'all' },
    description: 'Runs multiple branches concurrently and waits for all to complete'
  },
  queue_push: {
    keywords: ['queue', 'push', 'enqueue', 'bull', 'redis', 'background job', 'task distribution'],
    useCases: ['background jobs', 'task distribution', 'decouple workflow steps'],
    config: { queueName: 'tasks', message: '{{$json}}' },
    description: 'Push a message to a queue for background processing'
  },
  queue_consume: {
    keywords: ['queue', 'consume', 'pop', 'dequeue', 'worker', 'background task', 'job processing'],
    useCases: ['worker pattern', 'background job processing', 'task execution'],
    config: { queueName: 'tasks', timeout: 60000, autoAck: true },
    description: 'Consume a message from a queue (waits for next message)'
  },
  cache_get: {
    keywords: ['cache', 'get', 'retrieve', 'redis', 'caching', 'session data', 'temporary'],
    useCases: ['caching API responses', 'reduce repeated computations', 'session data'],
    config: { key: '{{$json.cacheKey}}', defaultValue: null },
    description: 'Retrieve a value from cache by key'
  },
  cache_set: {
    keywords: ['cache', 'set', 'store', 'redis', 'caching', 'temporary data', 'session storage'],
    useCases: ['cache expensive computations', 'temporary data storage', 'session management'],
    config: { key: '{{$json.cacheKey}}', value: '{{$json}}', ttl: 3600 },
    description: 'Store a value in cache with optional TTL'
  },
  oauth2_auth: {
    keywords: ['oauth', 'oauth2', 'auth', 'authentication', 'token', 'google', 'github'],
    useCases: ['Google APIs', 'GitHub API', 'OAuth2 services'],
    config: { provider: 'google', action: 'getToken' },
    description: 'Handles OAuth2 authentication and provides access tokens'
  },
  api_key_auth: {
    keywords: ['apikey', 'auth', 'key', 'api key', 'openai', 'stripe', 'authentication'],
    useCases: ['OpenAI API', 'Stripe API', 'API key services'],
    config: { apiKeyName: 'openai' },
    description: 'Provides an API key for authentication'
  }
};

function shouldAddNode(workflow, nodeName) {
  const nodeInfo = NEW_NODES[nodeName];
  if (!nodeInfo) return false;

  const goal = (workflow.goal || '').toLowerCase();
  const category = (workflow.category || '').toLowerCase();
  const useCase = (workflow.use_case || '').toLowerCase();
  const description = (workflow.phase1?.step5?.structure?.description || '').toLowerCase();
  const fullText = `${goal} ${category} ${useCase} ${description}`;

  // Check if any keyword matches
  const keywordMatch = nodeInfo.keywords.some(keyword => fullText.includes(keyword.toLowerCase()));

  // Check if any use case matches
  const useCaseMatch = nodeInfo.useCases.some(uc => fullText.includes(uc.toLowerCase()));

  return keywordMatch || useCaseMatch;
}

function addNodeToWorkflow(workflow, nodeName) {
  if (!workflow.phase1?.step5) return null;

  const step5 = workflow.phase1.step5;
  const selectedNodes = step5.selectedNodes || [];
  const nodeConfigs = step5.nodeConfigurations || {};
  const connections = step5.connections || [];
  const structure = step5.structure || {};

  // Skip if node already exists
  if (selectedNodes.includes(nodeName)) return null;

  const nodeInfo = NEW_NODES[nodeName];
  let added = false;

  // Add node to selectedNodes
  selectedNodes.push(nodeName);
  nodeConfigs[nodeName] = nodeInfo.config;

  // Add appropriate connections based on node type
  if (nodeName === 'delay') {
    // Add delay before API calls
    const apiNode = selectedNodes.find(n => 
      n.includes('api') || n.includes('http') || n.includes('google') || n.includes('slack')
    );
    if (apiNode) {
      const apiIndex = selectedNodes.indexOf(apiNode);
      const prevNode = apiIndex > 0 ? selectedNodes[apiIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → delay`);
      connections.push(`delay → ${apiNode}`);
      added = true;
    }
  } else if (nodeName === 'timeout') {
    // Add timeout before slow operations
    const slowNode = selectedNodes.find(n => 
      n.includes('ai_agent') || n.includes('database') || n.includes('api')
    );
    if (slowNode) {
      const slowIndex = selectedNodes.indexOf(slowNode);
      const prevNode = slowIndex > 0 ? selectedNodes[slowIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → timeout`);
      connections.push(`timeout (success) → ${slowNode}`);
      connections.push(`timeout (timeout) → slack_message`);
      added = true;
    }
  } else if (nodeName === 'try_catch') {
    // Wrap risky operations
    const riskyNode = selectedNodes.find(n => 
      n.includes('http') || n.includes('api') || n.includes('database') || 
      n.includes('google') || n.includes('hubspot')
    );
    if (riskyNode) {
      const riskyIndex = selectedNodes.indexOf(riskyNode);
      const prevNode = riskyIndex > 0 ? selectedNodes[riskyIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → try_catch (try)`);
      connections.push(`try_catch (try) → ${riskyNode}`);
      connections.push(`try_catch (catch) → slack_message`);
      added = true;
    }
  } else if (nodeName === 'retry') {
    // Add retry before API calls
    const apiNode = selectedNodes.find(n => n.includes('http') || n.includes('api'));
    if (apiNode) {
      const apiIndex = selectedNodes.indexOf(apiNode);
      const prevNode = apiIndex > 0 ? selectedNodes[apiIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → retry`);
      connections.push(`retry → ${apiNode}`);
      added = true;
    }
  } else if (nodeName === 'parallel') {
    // Add parallel for multiple operations
    const actionNodes = selectedNodes.filter(n => 
      !['manual_trigger', 'webhook', 'if_else', 'parallel'].includes(n) &&
      (n.includes('google') || n.includes('slack') || n.includes('email') || n.includes('gmail'))
    );
    if (actionNodes.length >= 2) {
      const triggerNode = selectedNodes.find(n => n.includes('trigger') || n.includes('webhook')) || selectedNodes[0];
      connections.push(`${triggerNode} → parallel`);
      actionNodes.slice(0, 2).forEach(node => {
        connections.push(`parallel → ${node}`);
      });
      added = true;
    }
  } else if (nodeName === 'cache_get' || nodeName === 'cache_set') {
    // Add cache nodes around data operations
    const dataNode = selectedNodes.find(n => 
      n.includes('api') || n.includes('database') || n.includes('google_sheets')
    );
    if (dataNode) {
      if (!selectedNodes.includes('cache_get')) {
        selectedNodes.push('cache_get');
        nodeConfigs.cache_get = NEW_NODES.cache_get.config;
      }
      if (!selectedNodes.includes('cache_set')) {
        selectedNodes.push('cache_set');
        nodeConfigs.cache_set = NEW_NODES.cache_set.config;
      }
      const dataIndex = selectedNodes.indexOf(dataNode);
      const prevNode = dataIndex > 0 ? selectedNodes[dataIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → cache_get`);
      connections.push(`cache_get → ${dataNode}`);
      connections.push(`${dataNode} → cache_set`);
      added = true;
    }
  } else if (nodeName === 'oauth2_auth') {
    // Add oauth2_auth before Google services
    const googleNode = selectedNodes.find(n => 
      n.includes('google') && !n.includes('oauth')
    );
    if (googleNode) {
      const googleIndex = selectedNodes.indexOf(googleNode);
      const prevNode = googleIndex > 0 ? selectedNodes[googleIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → oauth2_auth`);
      connections.push(`oauth2_auth → ${googleNode}`);
      added = true;
    }
  } else if (nodeName === 'api_key_auth') {
    // Add api_key_auth before API services
    const apiNode = selectedNodes.find(n => 
      n.includes('openai') || n.includes('stripe') || n.includes('http_request')
    );
    if (apiNode) {
      const apiIndex = selectedNodes.indexOf(apiNode);
      const prevNode = apiIndex > 0 ? selectedNodes[apiIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → api_key_auth`);
      connections.push(`api_key_auth → ${apiNode}`);
      added = true;
    }
  } else if (nodeName === 'return') {
    // Add return at the end
    const lastActionNode = selectedNodes.filter(n => 
      !['manual_trigger', 'webhook', 'return'].includes(n)
    ).slice(-1)[0];
    if (lastActionNode) {
      connections.push(`${lastActionNode} → return`);
      added = true;
    }
  } else if (nodeName === 'execute_workflow') {
    // Add execute_workflow in the middle
    const midNode = selectedNodes[Math.floor(selectedNodes.length / 2)];
    if (midNode && !['manual_trigger', 'webhook'].includes(midNode)) {
      connections.push(`${midNode} → execute_workflow`);
      added = true;
    }
  } else if (nodeName === 'queue_push' || nodeName === 'queue_consume') {
    // Add queue nodes for background processing
    if (!selectedNodes.includes('queue_push')) {
      selectedNodes.push('queue_push');
      nodeConfigs.queue_push = NEW_NODES.queue_push.config;
    }
    if (!selectedNodes.includes('queue_consume')) {
      selectedNodes.push('queue_consume');
      nodeConfigs.queue_consume = NEW_NODES.queue_consume.config;
    }
    const triggerNode = selectedNodes.find(n => n.includes('trigger') || n.includes('webhook')) || selectedNodes[0];
    const aiNode = selectedNodes.find(n => n.includes('ai_agent') || n.includes('ai'));
    if (aiNode) {
      connections.push(`${triggerNode} → queue_consume`);
      connections.push(`queue_consume → ${aiNode}`);
      connections.push(`${aiNode} → queue_push`);
      added = true;
    }
  }

  if (added) {
    // Update description
    const currentDesc = structure.description || '';
    structure.description = `${currentDesc} [Uses ${nodeName} for: ${nodeInfo.description}]`;

    // Update use_case
    if (workflow.use_case) {
      workflow.use_case = `${workflow.use_case} [Enhanced with ${nodeName}]`;
    }

    return nodeName;
  }

  return null;
}

function enhanceWorkflow(workflow) {
  const addedNodes = [];
  
  // Check each new node
  Object.keys(NEW_NODES).forEach(nodeName => {
    if (shouldAddNode(workflow, nodeName)) {
      const added = addNodeToWorkflow(workflow, nodeName);
      if (added) {
        addedNodes.push(added);
      }
    }
  });

  return addedNodes.length > 0 ? { workflow, addedNodes } : null;
}

function main() {
  console.log('🚀 Comprehensive workflow enhancement with ALL 13 new nodes...\n');

  const files = [
    { path: 'worker/data/modern_workflow_examples.json', name: 'Modern Examples (40 workflows)' },
    { path: 'worker/data/workflow_training_dataset_300.json', name: 'Training Dataset 300 (290 workflows)' },
    { path: 'worker/data/workflow_training_dataset_100.json', name: 'Training Dataset 100 (100 workflows)' }
  ];

  let totalEnhanced = 0;
  let totalWorkflows = 0;
  const nodeUsage = {};

  files.forEach(({ path: filePath, name }) => {
    try {
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        return;
      }

      console.log(`\n📝 Processing: ${name}`);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      const workflows = data.workflows || data;

      if (!Array.isArray(workflows)) {
        console.log(`⚠️  Invalid format: ${filePath}`);
        return;
      }

      totalWorkflows += workflows.length;
      let enhancedCount = 0;

      workflows.forEach((workflow, index) => {
        const result = enhanceWorkflow(workflow);
        if (result) {
          enhancedCount++;
          totalEnhanced++;
          result.addedNodes.forEach(node => {
            nodeUsage[node] = (nodeUsage[node] || 0) + 1;
          });
          workflows[index] = result.workflow;
        }
      });

      if (enhancedCount > 0) {
        // Write back
        const output = data.workflows ? { ...data, workflows } : workflows;
        fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf8');
        console.log(`✅ Enhanced ${enhancedCount}/${workflows.length} workflows`);
      } else {
        console.log(`ℹ️  No workflows needed enhancement`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error.message);
    }
  });

  console.log(`\n🎉 Enhancement complete!`);
  console.log(`   Total workflows processed: ${totalWorkflows}`);
  console.log(`   Total workflows enhanced: ${totalEnhanced}`);
  console.log(`   Enhancement rate: ${((totalEnhanced / totalWorkflows) * 100).toFixed(1)}%`);
  console.log(`\n📊 Node usage statistics:`);
  Object.entries(nodeUsage)
    .sort((a, b) => b[1] - a[1])
    .forEach(([node, count]) => {
      console.log(`   ${node.padEnd(20)}: ${count} workflows`);
    });
}

main();
