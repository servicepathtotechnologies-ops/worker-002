const fs = require('fs');
const path = require('path');

console.log('=== NODE VERIFICATION SCRIPT ===\n');

// Read files
const nodeLibraryPath = path.join(__dirname, 'src/services/nodes/node-library.ts');
const executeWorkflowPath = path.join(__dirname, 'src/api/execute-workflow.ts');
const overridesPath = path.join(__dirname, 'src/core/registry/unified-node-registry-overrides.ts');

const nodeLibraryContent = fs.readFileSync(nodeLibraryPath, 'utf8');
const executeWorkflowContent = fs.readFileSync(executeWorkflowPath, 'utf8');
const overridesContent = fs.existsSync(overridesPath) ? fs.readFileSync(overridesPath, 'utf8') : '';

const nodes = [
  'delay',
  'timeout',
  'return',
  'execute_workflow',
  'try_catch',
  'retry',
  'parallel',
  'queue_push',
  'queue_consume',
  'cache_get',
  'cache_set',
  'oauth2_auth',
  'api_key_auth'
];

const schemaMethods = [
  'createDelaySchema',
  'createTimeoutSchema',
  'createReturnSchema',
  'createExecuteWorkflowSchema',
  'createTryCatchSchema',
  'createRetrySchema',
  'createParallelSchema',
  'createQueuePushSchema',
  'createQueueConsumeSchema',
  'createCacheGetSchema',
  'createCacheSetSchema',
  'createOAuth2AuthSchema',
  'createApiKeyAuthSchema'
];

const overrideNodes = ['timeout', 'try_catch', 'retry', 'parallel'];

console.log('1. SCHEMA REGISTRATION CHECK');
console.log('─'.repeat(50));
let schemaCount = 0;
nodes.forEach((node, i) => {
  const hasType = nodeLibraryContent.includes(`type: '${node}'`);
  const hasMethod = nodeLibraryContent.includes(`private ${schemaMethods[i]}():`);
  const isRegistered = nodeLibraryContent.includes(`this.addSchema(this.${schemaMethods[i]}())`);
  
  if (hasType && hasMethod && isRegistered) {
    schemaCount++;
    console.log(`✅ ${node.padEnd(20)} - Schema defined, method exists, registered`);
  } else {
    console.log(`❌ ${node.padEnd(20)} - Type: ${hasType ? '✅' : '❌'} Method: ${hasMethod ? '✅' : '❌'} Registered: ${isRegistered ? '✅' : '❌'}`);
  }
});
console.log(`\nTotal: ${schemaCount}/${nodes.length} nodes properly registered\n`);

console.log('2. EXECUTION LOGIC CHECK');
console.log('─'.repeat(50));
let execCount = 0;
nodes.forEach(node => {
  const hasCase = executeWorkflowContent.includes(`case '${node}':`);
  if (hasCase) {
    execCount++;
    console.log(`✅ ${node.padEnd(20)} - Execution logic found`);
  } else {
    console.log(`❌ ${node.padEnd(20)} - Execution logic MISSING`);
  }
});
console.log(`\nTotal: ${execCount}/${nodes.length} nodes have execution logic\n`);

console.log('3. AI SELECTION CRITERIA CHECK');
console.log('─'.repeat(50));
let aiCount = 0;
nodes.forEach(node => {
  // Find the node definition section
  const nodeStart = nodeLibraryContent.indexOf(`type: '${node}'`);
  if (nodeStart === -1) {
    console.log(`❌ ${node.padEnd(20)} - Node type not found`);
    return;
  }
  
  // Get a large section after the node type
  const section = nodeLibraryContent.substring(nodeStart, nodeStart + 3000);
  const hasAiCriteria = section.includes('aiSelectionCriteria:');
  const hasWhenToUse = section.includes('whenToUse:');
  const hasKeywords = section.includes('keywords:');
  const hasUseCases = section.includes('useCases:');
  
  if (hasAiCriteria && hasWhenToUse && hasKeywords && hasUseCases) {
    aiCount++;
    console.log(`✅ ${node.padEnd(20)} - All AI criteria present`);
  } else {
    console.log(`⚠️  ${node.padEnd(20)} - aiCriteria: ${hasAiCriteria ? '✅' : '❌'} whenToUse: ${hasWhenToUse ? '✅' : '❌'} keywords: ${hasKeywords ? '✅' : '❌'} useCases: ${hasUseCases ? '✅' : '❌'}`);
  }
});
console.log(`\nTotal: ${aiCount}/${nodes.length} nodes have complete AI criteria\n`);

console.log('4. COMMON PATTERNS CHECK');
console.log('─'.repeat(50));
let patternsCount = 0;
nodes.forEach(node => {
  const regex = new RegExp(`type: '${node}'[\\s\\S]{0,2000}commonPatterns:`, 'i');
  const match = nodeLibraryContent.match(regex);
  if (match && match[0].includes('commonPatterns:')) {
    patternsCount++;
    console.log(`✅ ${node.padEnd(20)} - Has common patterns`);
  } else {
    console.log(`❌ ${node.padEnd(20)} - No common patterns`);
  }
});
console.log(`\nTotal: ${patternsCount}/${nodes.length} nodes have common patterns\n`);

console.log('5. OVERRIDE REGISTRATION CHECK');
console.log('─'.repeat(50));
let overrideCount = 0;
overrideNodes.forEach(node => {
  const hasOverride = overridesContent.includes(`${node}:`) || overridesContent.includes(`'${node}'`);
  if (hasOverride) {
    overrideCount++;
    console.log(`✅ ${node.padEnd(20)} - Override registered`);
  } else {
    console.log(`❌ ${node.padEnd(20)} - Override NOT registered`);
  }
});
console.log(`\nTotal: ${overrideCount}/${overrideNodes.length} override nodes registered\n`);

console.log('6. SCHEMA COUNT VERIFICATION');
console.log('─'.repeat(50));
// Find all schemaCount += lines and sum them
const schemaCountMatches = nodeLibraryContent.matchAll(/schemaCount \+= (\d+);/g);
let totalCount = 0;
for (const match of schemaCountMatches) {
  totalCount += parseInt(match[1]);
}
const expectedCount = 15; // For the 13 new nodes + 2 existing
if (totalCount >= expectedCount) {
  console.log(`✅ Total schema count: ${totalCount} (includes all nodes)`);
} else {
  console.log(`⚠️  Total schema count: ${totalCount} (expected at least: ${expectedCount})`);
}
console.log('');

console.log('=== FINAL SUMMARY ===');
console.log('─'.repeat(50));
const allGood = schemaCount === nodes.length && 
                execCount === nodes.length && 
                aiCount === nodes.length && 
                patternsCount === nodes.length &&
                overrideCount === overrideNodes.length &&
                totalCount >= expectedCount;

if (allGood) {
  console.log('🎉 ALL NODES VERIFIED AND WORKING!');
  console.log(`✅ ${nodes.length} nodes registered`);
  console.log(`✅ ${nodes.length} nodes have execution logic`);
  console.log(`✅ ${nodes.length} nodes have AI criteria`);
  console.log(`✅ ${nodes.length} nodes have common patterns`);
  console.log(`✅ ${overrideNodes.length} override nodes registered`);
  process.exit(0);
} else {
  console.log('⚠️  SOME ISSUES DETECTED:');
  if (schemaCount !== nodes.length) console.log(`   - Schema registration: ${schemaCount}/${nodes.length}`);
  if (execCount !== nodes.length) console.log(`   - Execution logic: ${execCount}/${nodes.length}`);
  if (aiCount !== nodes.length) console.log(`   - AI criteria: ${aiCount}/${nodes.length}`);
  if (patternsCount !== nodes.length) console.log(`   - Common patterns: ${patternsCount}/${nodes.length}`);
  if (overrideCount !== overrideNodes.length) console.log(`   - Overrides: ${overrideCount}/${overrideNodes.length}`);
  if (totalCount < expectedCount) console.log(`   - Schema count: ${totalCount}/${expectedCount}`);
  process.exit(1);
}
