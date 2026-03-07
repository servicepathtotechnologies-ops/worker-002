const fs = require('fs');
const path = require('path');

/**
 * Enhance sample workflows with new nodes (delay, timeout, return, execute_workflow, 
 * try_catch, retry, parallel, queue_push, queue_consume, cache_get, cache_set, 
 * oauth2_auth, api_key_auth)
 */

const NEW_NODES = {
  delay: {
    description: 'Add delay between steps',
    useCases: ['rate limiting', 'waiting for external systems', 'throttling'],
    config: { duration: 2000, unit: 'milliseconds' }
  },
  timeout: {
    description: 'Set timeout for operations',
    useCases: ['API call timeout', 'prevent long-running operations'],
    config: { limit: 30000 }
  },
  return: {
    description: 'Early exit with return value',
    useCases: ['conditional termination', 'return result from sub-workflow'],
    config: { includeInput: true }
  },
  execute_workflow: {
    description: 'Call another workflow',
    useCases: ['modular workflows', 'reusable components', 'sub-workflow execution'],
    config: { workflowId: '{{$json.subWorkflowId}}', input: '{{$json}}' }
  },
  try_catch: {
    description: 'Error handling with try/catch',
    useCases: ['API error handling', 'graceful error recovery', 'fallback logic'],
    config: {}
  },
  retry: {
    description: 'Retry failed operations',
    useCases: ['transient failures', 'API retries', 'improve reliability'],
    config: { maxAttempts: 3, delayBetween: 1000, backoff: 'exponential' }
  },
  parallel: {
    description: 'Run operations in parallel',
    useCases: ['parallel API calls', 'batch processing', 'speed up workflow'],
    config: { mode: 'all' }
  },
  queue_push: {
    description: 'Push message to queue',
    useCases: ['background jobs', 'task distribution', 'decouple workflow steps'],
    config: { queueName: 'tasks', message: '{{$json}}' }
  },
  queue_consume: {
    description: 'Consume message from queue',
    useCases: ['worker pattern', 'background job processing', 'task execution'],
    config: { queueName: 'tasks', timeout: 60000 }
  },
  cache_get: {
    description: 'Get value from cache',
    useCases: ['caching API responses', 'reduce repeated computations', 'session data'],
    config: { key: '{{$json.cacheKey}}', defaultValue: null }
  },
  cache_set: {
    description: 'Store value in cache',
    useCases: ['cache expensive computations', 'temporary data storage', 'session management'],
    config: { key: '{{$json.cacheKey}}', value: '{{$json}}', ttl: 3600 }
  },
  oauth2_auth: {
    description: 'OAuth2 authentication',
    useCases: ['Google APIs', 'GitHub API', 'OAuth2 services'],
    config: { provider: 'google', action: 'getToken' }
  },
  api_key_auth: {
    description: 'API key authentication',
    useCases: ['OpenAI API', 'Stripe API', 'API key services'],
    config: { apiKeyName: 'openai' }
  }
};

function enhanceWorkflow(workflow) {
  let modified = false;
  const enhancements = [];

  // Check if workflow could benefit from new nodes
  const goal = (workflow.goal || '').toLowerCase();
  const description = (workflow.phase1?.step5?.structure?.description || '').toLowerCase();
  const useCase = (workflow.use_case || '').toLowerCase();
  const category = (workflow.category || '').toLowerCase();
  const fullText = `${goal} ${description} ${useCase} ${category}`.toLowerCase();

  // Get existing nodes
  const existingNodes = workflow.phase1?.step5?.selectedNodes || [];
  const nodeConfigs = workflow.phase1?.step5?.nodeConfigurations || {};
  const connections = workflow.phase1?.step5?.connections || [];

  // 1. Add delay node for rate limiting scenarios
  if ((fullText.includes('rate limit') || fullText.includes('throttle') || fullText.includes('wait') || 
       fullText.includes('delay') || fullText.includes('pause')) && !existingNodes.includes('delay')) {
    existingNodes.push('delay');
    nodeConfigs.delay = NEW_NODES.delay.config;
    connections.push('ai_agent → delay → google_gmail');
    enhancements.push('Added delay node for rate limiting');
    modified = true;
  }

  // 2. Add timeout for API-heavy workflows
  if ((fullText.includes('api') || fullText.includes('external') || fullText.includes('timeout') || 
       fullText.includes('time limit')) && !existingNodes.includes('timeout')) {
    existingNodes.push('timeout');
    nodeConfigs.timeout = NEW_NODES.timeout.config;
    // Insert timeout before API calls
    const apiNodeIndex = existingNodes.findIndex(n => n.includes('http') || n.includes('api'));
    if (apiNodeIndex > 0) {
      connections.push(`${existingNodes[apiNodeIndex - 1]} → timeout → ${existingNodes[apiNodeIndex]}`);
    }
    enhancements.push('Added timeout node for API operations');
    modified = true;
  }

  // 3. Add try_catch for error handling
  if ((fullText.includes('error') || fullText.includes('fail') || fullText.includes('exception') || 
       category.includes('error')) && !existingNodes.includes('try_catch')) {
    existingNodes.push('try_catch');
    nodeConfigs.try_catch = NEW_NODES.try_catch.config;
    // Wrap risky operations in try_catch
    const riskyNode = existingNodes.find(n => n.includes('api') || n.includes('http') || n.includes('database'));
    if (riskyNode) {
      connections.push(`try_catch (try) → ${riskyNode}`);
      connections.push(`try_catch (catch) → slack_message`);
    }
    enhancements.push('Added try_catch for error handling');
    modified = true;
  }

  // 4. Add retry for transient failures
  if ((fullText.includes('retry') || fullText.includes('retry') || fullText.includes('transient') || 
       fullText.includes('reliable')) && !existingNodes.includes('retry')) {
    existingNodes.push('retry');
    nodeConfigs.retry = NEW_NODES.retry.config;
    const apiNode = existingNodes.find(n => n.includes('api') || n.includes('http'));
    if (apiNode) {
      connections.push(`retry → ${apiNode}`);
    }
    enhancements.push('Added retry node for reliability');
    modified = true;
  }

  // 5. Add parallel for batch operations
  if ((fullText.includes('parallel') || fullText.includes('batch') || fullText.includes('multiple') || 
       fullText.includes('simultaneous')) && !existingNodes.includes('parallel')) {
    existingNodes.push('parallel');
    nodeConfigs.parallel = NEW_NODES.parallel.config;
    // Connect parallel to multiple nodes
    const actionNodes = existingNodes.filter(n => !['manual_trigger', 'webhook', 'parallel'].includes(n));
    if (actionNodes.length > 1) {
      connections.push(`parallel → ${actionNodes[0]}`);
      connections.push(`parallel → ${actionNodes[1]}`);
    }
    enhancements.push('Added parallel node for concurrent execution');
    modified = true;
  }

  // 6. Add cache_get/cache_set for data caching
  if ((fullText.includes('cache') || fullText.includes('store') || fullText.includes('session') || 
       fullText.includes('temporary')) && !existingNodes.includes('cache_get') && !existingNodes.includes('cache_set')) {
    existingNodes.push('cache_get', 'cache_set');
    nodeConfigs.cache_get = NEW_NODES.cache_get.config;
    nodeConfigs.cache_set = NEW_NODES.cache_set.config;
    const dataNode = existingNodes.find(n => n.includes('api') || n.includes('database'));
    if (dataNode) {
      connections.push(`cache_get → ${dataNode}`);
      connections.push(`${dataNode} → cache_set`);
    }
    enhancements.push('Added cache nodes for data caching');
    modified = true;
  }

  // 7. Add queue_push/queue_consume for background jobs
  if ((fullText.includes('queue') || fullText.includes('background') || fullText.includes('worker') || 
       fullText.includes('job')) && !existingNodes.includes('queue_push') && !existingNodes.includes('queue_consume')) {
    existingNodes.push('queue_push', 'queue_consume');
    nodeConfigs.queue_push = NEW_NODES.queue_push.config;
    nodeConfigs.queue_consume = NEW_NODES.queue_consume.config;
    connections.push('queue_consume → ai_agent');
    connections.push('ai_agent → queue_push');
    enhancements.push('Added queue nodes for background processing');
    modified = true;
  }

  // 8. Add oauth2_auth for OAuth services
  if ((fullText.includes('google') || fullText.includes('oauth') || fullText.includes('github') || 
       fullText.includes('authentication')) && !existingNodes.includes('oauth2_auth')) {
    existingNodes.push('oauth2_auth');
    nodeConfigs.oauth2_auth = NEW_NODES.oauth2_auth.config;
    const googleNode = existingNodes.find(n => n.includes('google'));
    if (googleNode) {
      connections.push(`oauth2_auth → ${googleNode}`);
    }
    enhancements.push('Added oauth2_auth for authentication');
    modified = true;
  }

  // 9. Add api_key_auth for API key services
  if ((fullText.includes('openai') || fullText.includes('stripe') || fullText.includes('api key') || 
       (fullText.includes('api') && !existingNodes.includes('oauth2_auth'))) && !existingNodes.includes('api_key_auth')) {
    existingNodes.push('api_key_auth');
    nodeConfigs.api_key_auth = NEW_NODES.api_key_auth.config;
    const apiNode = existingNodes.find(n => n.includes('openai') || n.includes('stripe') || n.includes('http'));
    if (apiNode) {
      connections.push(`api_key_auth → ${apiNode}`);
    }
    enhancements.push('Added api_key_auth for API key authentication');
    modified = true;
  }

  // 10. Add return for early exit scenarios
  if ((fullText.includes('return') || fullText.includes('exit') || fullText.includes('stop') || 
       fullText.includes('terminate')) && !existingNodes.includes('return')) {
    existingNodes.push('return');
    nodeConfigs.return = NEW_NODES.return.config;
    const lastNode = existingNodes[existingNodes.length - 2]; // Before return
    connections.push(`${lastNode} → return`);
    enhancements.push('Added return node for early exit');
    modified = true;
  }

  // 11. Add execute_workflow for modular workflows
  if ((fullText.includes('sub-workflow') || fullText.includes('modular') || fullText.includes('reusable') || 
       fullText.includes('call workflow')) && !existingNodes.includes('execute_workflow')) {
    existingNodes.push('execute_workflow');
    nodeConfigs.execute_workflow = NEW_NODES.execute_workflow.config;
    const midNode = existingNodes[Math.floor(existingNodes.length / 2)];
    connections.push(`${midNode} → execute_workflow`);
    enhancements.push('Added execute_workflow for modular design');
    modified = true;
  }

  if (modified) {
    // Update workflow structure description
    const structure = workflow.phase1?.step5?.structure || {};
    const newDescription = structure.description || '';
    const enhancementText = enhancements.join(', ');
    structure.description = `${newDescription} [Enhanced with: ${enhancementText}]`;

    // Update workflow description/use_case
    if (workflow.use_case) {
      workflow.use_case = `${workflow.use_case} [Uses: ${enhancements.map(e => e.replace('Added ', '').replace(' node', '')).join(', ')}]`;
    }

    return { workflow, enhancements };
  }

  return null;
}

function main() {
  console.log('🚀 Enhancing sample workflows with new nodes...\n');

  const files = [
    'worker/data/modern_workflow_examples.json',
    'worker/data/workflow_training_dataset_300.json',
    'worker/data/workflow_training_dataset_100.json',
    'worker/data/workflow_training_dataset.json'
  ];

  files.forEach(filePath => {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      return;
    }

    console.log(`\n📝 Processing: ${filePath}`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const workflows = data.workflows || data;

    let enhancedCount = 0;
    const allEnhancements = [];

    workflows.forEach((workflow, index) => {
      const result = enhanceWorkflow(workflow);
      if (result) {
        enhancedCount++;
        allEnhancements.push(...result.enhancements);
        workflows[index] = result.workflow;
      }
    });

    if (enhancedCount > 0) {
      // Write back
      const output = data.workflows ? { ...data, workflows } : workflows;
      fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf8');
      console.log(`✅ Enhanced ${enhancedCount}/${workflows.length} workflows`);
      console.log(`   Enhancements: ${[...new Set(allEnhancements)].join(', ')}`);
    } else {
      console.log(`ℹ️  No workflows needed enhancement`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
  });

  console.log('\n🎉 Enhancement complete!');
}

main();
