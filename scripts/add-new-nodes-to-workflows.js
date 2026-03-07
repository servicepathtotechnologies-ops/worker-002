const fs = require('fs');
const path = require('path');

/**
 * Add new nodes to sample workflows intelligently
 * New nodes: delay, timeout, return, execute_workflow, try_catch, retry, 
 *            parallel, queue_push, queue_consume, cache_get, cache_set, 
 *            oauth2_auth, api_key_auth
 */

function addNodesToWorkflow(workflow) {
  let modified = false;
  const addedNodes = [];

  // Get workflow components
  const goal = (workflow.goal || '').toLowerCase();
  const category = (workflow.category || '').toLowerCase();
  const useCase = (workflow.use_case || '').toLowerCase();
  const description = (workflow.phase1?.step5?.structure?.description || '').toLowerCase();
  const fullText = `${goal} ${category} ${useCase} ${description}`;

  // Get existing structure
  if (!workflow.phase1?.step5) {
    return null; // Skip workflows without proper structure
  }

  const step5 = workflow.phase1.step5;
  const selectedNodes = step5.selectedNodes || [];
  const nodeConfigs = step5.nodeConfigurations || {};
  const connections = step5.connections || [];
  const structure = step5.structure || {};

  // Strategy 1: Add try_catch for error-prone workflows
  if ((fullText.includes('api') || fullText.includes('http') || fullText.includes('database') || 
       fullText.includes('external')) && !selectedNodes.includes('try_catch')) {
    selectedNodes.push('try_catch');
    nodeConfigs.try_catch = {};
    
    // Find a risky node to wrap
    const riskyNode = selectedNodes.find(n => 
      n.includes('http') || n.includes('api') || n.includes('database') || 
      n.includes('google') || n.includes('hubspot') || n.includes('slack')
    );
    
    if (riskyNode) {
      const riskyIndex = selectedNodes.indexOf(riskyNode);
      const prevNode = riskyIndex > 0 ? selectedNodes[riskyIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → try_catch (try)`);
      connections.push(`try_catch (try) → ${riskyNode}`);
      connections.push(`try_catch (catch) → slack_message`);
    }
    
    addedNodes.push('try_catch');
    modified = true;
  }

  // Strategy 2: Add retry for API calls
  if ((fullText.includes('api') || fullText.includes('http') || fullText.includes('retry')) && 
      !selectedNodes.includes('retry')) {
    const apiNode = selectedNodes.find(n => n.includes('http') || n.includes('api'));
    if (apiNode) {
      selectedNodes.push('retry');
      nodeConfigs.retry = {
        maxAttempts: 3,
        delayBetween: 1000,
        backoff: 'exponential'
      };
      
      const apiIndex = selectedNodes.indexOf(apiNode);
      const prevNode = apiIndex > 0 ? selectedNodes[apiIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → retry`);
      connections.push(`retry → ${apiNode}`);
      
      addedNodes.push('retry');
      modified = true;
    }
  }

  // Strategy 3: Add delay for rate limiting
  if ((fullText.includes('rate') || fullText.includes('throttle') || 
       (fullText.includes('api') && fullText.includes('multiple'))) && 
      !selectedNodes.includes('delay')) {
    const apiNode = selectedNodes.find(n => n.includes('api') || n.includes('http') || n.includes('google'));
    if (apiNode) {
      selectedNodes.push('delay');
      nodeConfigs.delay = { duration: 2000, unit: 'milliseconds' };
      
      const apiIndex = selectedNodes.indexOf(apiNode);
      const prevNode = apiIndex > 0 ? selectedNodes[apiIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → delay`);
      connections.push(`delay → ${apiNode}`);
      
      addedNodes.push('delay');
      modified = true;
    }
  }

  // Strategy 4: Add timeout for long operations
  if ((fullText.includes('timeout') || fullText.includes('long') || 
       fullText.includes('slow')) && !selectedNodes.includes('timeout')) {
    const slowNode = selectedNodes.find(n => 
      n.includes('ai_agent') || n.includes('database') || n.includes('api')
    );
    if (slowNode) {
      selectedNodes.push('timeout');
      nodeConfigs.timeout = { limit: 30000 };
      
      const slowIndex = selectedNodes.indexOf(slowNode);
      const prevNode = slowIndex > 0 ? selectedNodes[slowIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → timeout`);
      connections.push(`timeout (success) → ${slowNode}`);
      connections.push(`timeout (timeout) → slack_message`);
      
      addedNodes.push('timeout');
      modified = true;
    }
  }

  // Strategy 5: Add cache for data workflows
  if ((fullText.includes('cache') || fullText.includes('store') || 
       fullText.includes('session') || fullText.includes('temporary')) && 
      !selectedNodes.includes('cache_get') && !selectedNodes.includes('cache_set')) {
    const dataNode = selectedNodes.find(n => 
      n.includes('api') || n.includes('database') || n.includes('google_sheets')
    );
    if (dataNode) {
      selectedNodes.push('cache_get', 'cache_set');
      nodeConfigs.cache_get = { key: '{{$json.cacheKey}}', defaultValue: null };
      nodeConfigs.cache_set = { key: '{{$json.cacheKey}}', value: '{{$json}}', ttl: 3600 };
      
      const dataIndex = selectedNodes.indexOf(dataNode);
      const prevNode = dataIndex > 0 ? selectedNodes[dataIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → cache_get`);
      connections.push(`cache_get → ${dataNode}`);
      connections.push(`${dataNode} → cache_set`);
      
      addedNodes.push('cache_get', 'cache_set');
      modified = true;
    }
  }

  // Strategy 6: Add oauth2_auth for Google services
  if ((fullText.includes('google') || fullText.includes('oauth')) && 
      !selectedNodes.includes('oauth2_auth')) {
    const googleNode = selectedNodes.find(n => 
      n.includes('google') && !n.includes('oauth')
    );
    if (googleNode) {
      selectedNodes.push('oauth2_auth');
      nodeConfigs.oauth2_auth = { provider: 'google', action: 'getToken' };
      
      const googleIndex = selectedNodes.indexOf(googleNode);
      const prevNode = googleIndex > 0 ? selectedNodes[googleIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → oauth2_auth`);
      connections.push(`oauth2_auth → ${googleNode}`);
      
      addedNodes.push('oauth2_auth');
      modified = true;
    }
  }

  // Strategy 7: Add api_key_auth for API services
  if ((fullText.includes('openai') || fullText.includes('stripe') || 
       (fullText.includes('api') && !fullText.includes('oauth'))) && 
      !selectedNodes.includes('api_key_auth')) {
    const apiNode = selectedNodes.find(n => 
      n.includes('openai') || n.includes('stripe') || n.includes('http_request')
    );
    if (apiNode) {
      selectedNodes.push('api_key_auth');
      nodeConfigs.api_key_auth = { apiKeyName: 'openai' };
      
      const apiIndex = selectedNodes.indexOf(apiNode);
      const prevNode = apiIndex > 0 ? selectedNodes[apiIndex - 1] : selectedNodes[0];
      connections.push(`${prevNode} → api_key_auth`);
      connections.push(`api_key_auth → ${apiNode}`);
      
      addedNodes.push('api_key_auth');
      modified = true;
    }
  }

  // Strategy 8: Add parallel for multiple operations
  if ((fullText.includes('parallel') || fullText.includes('batch') || 
       fullText.includes('multiple') || fullText.includes('simultaneous')) && 
      !selectedNodes.includes('parallel')) {
    const actionNodes = selectedNodes.filter(n => 
      !['manual_trigger', 'webhook', 'if_else'].includes(n) && 
      (n.includes('google') || n.includes('slack') || n.includes('email'))
    );
    if (actionNodes.length >= 2) {
      selectedNodes.push('parallel');
      nodeConfigs.parallel = { mode: 'all' };
      
      const triggerNode = selectedNodes.find(n => n.includes('trigger') || n.includes('webhook')) || selectedNodes[0];
      connections.push(`${triggerNode} → parallel`);
      actionNodes.slice(0, 2).forEach(node => {
        connections.push(`parallel → ${node}`);
      });
      
      addedNodes.push('parallel');
      modified = true;
    }
  }

  // Strategy 9: Add return for early exit
  if ((fullText.includes('return') || fullText.includes('exit') || 
       fullText.includes('stop') || fullText.includes('terminate')) && 
      !selectedNodes.includes('return')) {
    selectedNodes.push('return');
    nodeConfigs.return = { includeInput: true };
    
    const lastActionNode = selectedNodes.filter(n => 
      !['manual_trigger', 'webhook', 'return'].includes(n)
    ).slice(-1)[0];
    
    if (lastActionNode) {
      connections.push(`${lastActionNode} → return`);
      addedNodes.push('return');
      modified = true;
    }
  }

  // Strategy 10: Add execute_workflow for modular workflows
  if ((fullText.includes('sub-workflow') || fullText.includes('modular') || 
       fullText.includes('reusable') || fullText.includes('call workflow')) && 
      !selectedNodes.includes('execute_workflow')) {
    selectedNodes.push('execute_workflow');
    nodeConfigs.execute_workflow = {
      workflowId: '{{$json.subWorkflowId}}',
      input: '{{$json}}',
      waitForCompletion: true
    };
    
    const midNode = selectedNodes[Math.floor(selectedNodes.length / 2)];
    if (midNode && !['manual_trigger', 'webhook'].includes(midNode)) {
      connections.push(`${midNode} → execute_workflow`);
      addedNodes.push('execute_workflow');
      modified = true;
    }
  }

  // Strategy 11: Add queue nodes for background jobs
  if ((fullText.includes('queue') || fullText.includes('background') || 
       fullText.includes('worker') || fullText.includes('job')) && 
      !selectedNodes.includes('queue_push') && !selectedNodes.includes('queue_consume')) {
    selectedNodes.push('queue_push', 'queue_consume');
    nodeConfigs.queue_push = { queueName: 'tasks', message: '{{$json}}' };
    nodeConfigs.queue_consume = { queueName: 'tasks', timeout: 60000 };
    
    const triggerNode = selectedNodes.find(n => n.includes('trigger') || n.includes('webhook')) || selectedNodes[0];
    connections.push(`${triggerNode} → queue_consume`);
    connections.push(`queue_consume → ai_agent`);
    connections.push(`ai_agent → queue_push`);
    
    addedNodes.push('queue_push', 'queue_consume');
    modified = true;
  }

  if (modified) {
    // Update description
    const currentDesc = structure.description || '';
    const nodeList = addedNodes.join(', ');
    structure.description = `${currentDesc} [Enhanced with: ${nodeList}]`;
    
    // Update use_case if exists
    if (workflow.use_case) {
      workflow.use_case = `${workflow.use_case} [Uses: ${nodeList}]`;
    }

    return { workflow, addedNodes };
  }

  return null;
}

function main() {
  console.log('🚀 Adding new nodes to sample workflows...\n');

  const files = [
    { path: 'worker/data/modern_workflow_examples.json', name: 'Modern Examples' },
    { path: 'worker/data/workflow_training_dataset_300.json', name: 'Training Dataset 300' },
    { path: 'worker/data/workflow_training_dataset_100.json', name: 'Training Dataset 100' },
    { path: 'worker/data/workflow_training_dataset.json', name: 'Training Dataset' }
  ];

  let totalEnhanced = 0;
  let totalWorkflows = 0;

  files.forEach(({ path: filePath, name }) => {
    try {
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        return;
      }

      console.log(`\n📝 Processing: ${name} (${filePath})`);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      const workflows = data.workflows || data;

      if (!Array.isArray(workflows)) {
        console.log(`⚠️  Invalid format: ${filePath}`);
        return;
      }

      totalWorkflows += workflows.length;
      let enhancedCount = 0;
      const allAddedNodes = [];

      workflows.forEach((workflow, index) => {
        const result = addNodesToWorkflow(workflow);
        if (result) {
          enhancedCount++;
          totalEnhanced++;
          allAddedNodes.push(...result.addedNodes);
          workflows[index] = result.workflow;
        }
      });

      if (enhancedCount > 0) {
        // Write back
        const output = data.workflows ? { ...data, workflows } : workflows;
        fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf8');
        console.log(`✅ Enhanced ${enhancedCount}/${workflows.length} workflows`);
        const uniqueNodes = [...new Set(allAddedNodes)];
        console.log(`   Added nodes: ${uniqueNodes.join(', ')}`);
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
}

main();
