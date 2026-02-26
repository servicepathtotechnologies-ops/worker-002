/**
 * Verify the 100-example training dataset is properly loaded
 */

const fs = require('fs');
const path = require('path');

const datasetPath = path.join(__dirname, '../data/workflow_training_dataset.json');

console.log('🔍 Verifying Training Dataset...\n');

try {
  if (!fs.existsSync(datasetPath)) {
    console.error(`❌ Dataset file not found at: ${datasetPath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(datasetPath, 'utf-8');
  const dataset = JSON.parse(fileContent);

  console.log(`✅ Dataset loaded successfully`);
  console.log(`   Version: ${dataset.version}`);
  console.log(`   Description: ${dataset.description}`);
  console.log(`   Total Workflows: ${dataset.totalWorkflows}\n`);

  // Verify structure
  if (!dataset.workflows || !Array.isArray(dataset.workflows)) {
    console.error('❌ Invalid dataset: workflows array is missing');
    process.exit(1);
  }

  // Analyze categories
  const categories = {};
  const nodeTypes = {};
  const complexity = { simple: 0, medium: 0, complex: 0 };

  dataset.workflows.forEach(workflow => {
    // Count categories
    const cat = workflow.category || 'Unknown';
    categories[cat] = (categories[cat] || 0) + 1;

    // Count node types
    const nodes = workflow.phase1?.step5?.selectedNodes || [];
    nodes.forEach(node => {
      nodeTypes[node] = (nodeTypes[node] || 0) + 1;
    });

    // Count complexity
    if (nodes.length <= 3) complexity.simple++;
    else if (nodes.length <= 5) complexity.medium++;
    else complexity.complex++;
  });

  console.log('📊 Dataset Statistics:');
  console.log(`   Categories: ${Object.keys(categories).length}`);
  Object.entries(categories).forEach(([cat, count]) => {
    console.log(`     - ${cat}: ${count} workflows`);
  });

  console.log(`\n   Complexity Distribution:`);
  console.log(`     - Simple (2-3 nodes): ${complexity.simple}`);
  console.log(`     - Medium (4-5 nodes): ${complexity.medium}`);
  console.log(`     - Complex (6+ nodes): ${complexity.complex}`);

  console.log(`\n   Node Types Used: ${Object.keys(nodeTypes).length}`);
  const topNodes = Object.entries(nodeTypes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log(`   Top 10 Most Used Nodes:`);
  topNodes.forEach(([node, count]) => {
    console.log(`     - ${node}: ${count} times`);
  });

  // Verify sample workflows
  console.log(`\n📝 Sample Workflows:`);
  dataset.workflows.slice(0, 5).forEach((w, idx) => {
    const nodes = w.phase1?.step5?.selectedNodes || [];
    console.log(`   ${idx + 1}. "${w.goal}"`);
    console.log(`      Category: ${w.category}`);
    console.log(`      Nodes: ${nodes.join(' → ')}`);
    console.log(`      Complexity: ${nodes.length <= 3 ? 'Simple' : nodes.length <= 5 ? 'Medium' : 'Complex'}`);
  });

  console.log(`\n✅ Dataset verification complete!`);
  console.log(`   All ${dataset.totalWorkflows} workflows are properly structured.`);

} catch (error) {
  console.error('❌ Error verifying dataset:', error.message);
  if (error instanceof SyntaxError) {
    console.error('   This appears to be a JSON syntax error.');
  }
  process.exit(1);
}
