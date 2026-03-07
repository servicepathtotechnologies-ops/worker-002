const fs = require('fs');

console.log('=== WORKFLOW ENHANCEMENT VERIFICATION ===\n');

const files = [
  { path: 'worker/data/modern_workflow_examples.json', name: 'Modern Examples' },
  { path: 'worker/data/workflow_training_dataset_300.json', name: 'Training Dataset 300' },
  { path: 'worker/data/workflow_training_dataset_100.json', name: 'Training Dataset 100' }
];

const newNodes = [
  'delay', 'timeout', 'return', 'execute_workflow', 'try_catch', 
  'retry', 'parallel', 'queue_push', 'queue_consume', 
  'cache_get', 'cache_set', 'oauth2_auth', 'api_key_auth'
];

let totalWorkflows = 0;
let totalWithNewNodes = 0;
const nodeStats = {};

files.forEach(({ path: filePath, name }) => {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const workflows = data.workflows || data;
    
    console.log(`\n📊 ${name}:`);
    console.log(`   Total workflows: ${workflows.length}`);
    
    let workflowsWithNewNodes = 0;
    const fileNodeStats = {};
    
    workflows.forEach(workflow => {
      const nodes = workflow.phase1?.step5?.selectedNodes || [];
      const hasNewNode = newNodes.some(n => nodes.includes(n));
      
      if (hasNewNode) {
        workflowsWithNewNodes++;
        newNodes.forEach(node => {
          if (nodes.includes(node)) {
            fileNodeStats[node] = (fileNodeStats[node] || 0) + 1;
            nodeStats[node] = (nodeStats[node] || 0) + 1;
          }
        });
      }
    });
    
    totalWorkflows += workflows.length;
    totalWithNewNodes += workflowsWithNewNodes;
    
    console.log(`   Workflows with new nodes: ${workflowsWithNewNodes}/${workflows.length} (${((workflowsWithNewNodes/workflows.length)*100).toFixed(1)}%)`);
    console.log(`   Node usage:`);
    Object.entries(fileNodeStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([node, count]) => {
        console.log(`     ${node.padEnd(20)}: ${count}`);
      });
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }
});

console.log(`\n=== OVERALL STATISTICS ===`);
console.log(`Total workflows: ${totalWorkflows}`);
console.log(`Workflows with new nodes: ${totalWithNewNodes} (${((totalWithNewNodes/totalWorkflows)*100).toFixed(1)}%)`);
console.log(`\nNode usage across all files:`);
Object.entries(nodeStats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([node, count]) => {
    console.log(`  ${node.padEnd(20)}: ${count} workflows`);
  });

const missingNodes = newNodes.filter(n => !nodeStats[n] || nodeStats[n] === 0);
if (missingNodes.length > 0) {
  console.log(`\n⚠️  Nodes not yet added: ${missingNodes.join(', ')}`);
} else {
  console.log(`\n✅ All 13 new nodes are present in sample workflows!`);
}
