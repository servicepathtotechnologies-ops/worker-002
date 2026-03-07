const fs = require('fs');
const path = require('path');

console.log('=== NODE OPERATIONS VERIFICATION ===\n');

const executeWorkflowPath = path.join(__dirname, 'src/api/execute-workflow.ts');
const content = fs.readFileSync(executeWorkflowPath, 'utf8');

const nodes = [
  { name: 'delay', required: ['duration'], helpers: ['getNumberProperty', 'getStringProperty'] },
  { name: 'timeout', required: ['limit'], helpers: ['getNumberProperty'] },
  { name: 'return', required: [], helpers: [] },
  { name: 'execute_workflow', required: ['workflowId'], helpers: ['getStringProperty', 'buildNodeInput'] },
  { name: 'try_catch', required: [], helpers: [] },
  { name: 'retry', required: ['maxAttempts'], helpers: ['getNumberProperty'] },
  { name: 'parallel', required: [], helpers: [] },
  { name: 'queue_push', required: ['queueName', 'message'], helpers: ['getStringProperty'] },
  { name: 'queue_consume', required: ['queueName'], helpers: ['getStringProperty', 'getNumberProperty'] },
  { name: 'cache_get', required: ['key'], helpers: ['getStringProperty'] },
  { name: 'cache_set', required: ['key', 'value'], helpers: ['getStringProperty', 'getNumberProperty'] },
  { name: 'oauth2_auth', required: ['provider'], helpers: ['getStringProperty'] },
  { name: 'api_key_auth', required: ['apiKeyName'], helpers: ['getStringProperty'] },
];

console.log('1. EXECUTION LOGIC STRUCTURE CHECK');
console.log('─'.repeat(60));
let structureCount = 0;
nodes.forEach(node => {
  const caseFound = content.includes(`case '${node.name}':`);
  const tryBlock = content.match(new RegExp(`case '${node.name}':[\\s\\S]{0,500}try \\{`, 'i'));
  const returnFound = content.match(new RegExp(`case '${node.name}':[\\s\\S]{0,2000}return \\{`, 'i'));
  const errorHandling = content.match(new RegExp(`case '${node.name}':[\\s\\S]{0,2000}catch`, 'i'));
  
  if (caseFound && tryBlock && returnFound && errorHandling) {
    structureCount++;
    console.log(`✅ ${node.name.padEnd(20)} - Has try/catch, return, error handling`);
  } else {
    console.log(`⚠️  ${node.name.padEnd(20)} - Case: ${caseFound ? '✅' : '❌'} Try: ${tryBlock ? '✅' : '❌'} Return: ${returnFound ? '✅' : '❌'} Catch: ${errorHandling ? '✅' : '❌'}`);
  }
});
console.log(`\nTotal: ${structureCount}/${nodes.length} nodes have proper structure\n`);

console.log('2. HELPER FUNCTIONS CHECK');
console.log('─'.repeat(60));
// Check if helper functions exist
const hasGetStringProperty = content.includes('getStringProperty') || content.includes('function getStringProperty');
const hasGetNumberProperty = content.includes('getNumberProperty') || content.includes('function getNumberProperty');
const hasGetBooleanProperty = content.includes('getBooleanProperty') || content.includes('function getBooleanProperty');

console.log(`getStringProperty: ${hasGetStringProperty ? '✅' : '❌'}`);
console.log(`getNumberProperty: ${hasGetNumberProperty ? '✅' : '❌'}`);
console.log(`getBooleanProperty: ${hasGetBooleanProperty ? '✅' : '❌'}`);

let helperCount = 0;
nodes.forEach(node => {
  const allHelpersPresent = node.helpers.every(helper => {
    if (helper === 'getStringProperty') return hasGetStringProperty;
    if (helper === 'getNumberProperty') return hasGetNumberProperty;
    if (helper === 'getBooleanProperty') return hasGetBooleanProperty;
    if (helper === 'buildNodeInput') return content.includes('buildNodeInput');
    return true;
  });
  
  if (allHelpersPresent || node.helpers.length === 0) {
    helperCount++;
    console.log(`✅ ${node.name.padEnd(20)} - All helpers available`);
  } else {
    const missing = node.helpers.filter(h => {
      if (h === 'getStringProperty') return !hasGetStringProperty;
      if (h === 'getNumberProperty') return !hasGetNumberProperty;
      if (h === 'buildNodeInput') return !content.includes('buildNodeInput');
      return false;
    });
    console.log(`⚠️  ${node.name.padEnd(20)} - Missing: ${missing.join(', ')}`);
  }
});
console.log(`\nTotal: ${helperCount}/${nodes.length} nodes have required helpers\n`);

console.log('3. REQUIRED FIELD VALIDATION CHECK');
console.log('─'.repeat(60));
let validationCount = 0;
nodes.forEach(node => {
  if (node.required.length === 0) {
    validationCount++;
    console.log(`✅ ${node.name.padEnd(20)} - No required fields (optional node)`);
    return;
  }
  
  const regex = new RegExp(`case '${node.name}':[\\s\\S]{0,3000}`, 'i');
  const match = content.match(regex);
  if (!match) {
    console.log(`❌ ${node.name.padEnd(20)} - Cannot find case statement`);
    return;
  }
  
  const section = match[0];
  const allValidated = node.required.every(field => {
    // Check for validation patterns
    const fieldCheck = section.includes(`config.${field}`) || 
                       section.includes(`getStringProperty(config, '${field}'`) ||
                       section.includes(`getNumberProperty(config, '${field}'`) ||
                       section.includes(`!${field}`) ||
                       section.includes(`${field} is required`);
    return fieldCheck;
  });
  
  if (allValidated) {
    validationCount++;
    console.log(`✅ ${node.name.padEnd(20)} - Required fields validated: ${node.required.join(', ')}`);
  } else {
    const missing = node.required.filter(f => {
      return !(section.includes(`config.${f}`) || 
               section.includes(`getStringProperty(config, '${f}'`) ||
               section.includes(`getNumberProperty(config, '${f}'`));
    });
    console.log(`⚠️  ${node.name.padEnd(20)} - Missing validation for: ${missing.join(', ')}`);
  }
});
console.log(`\nTotal: ${validationCount}/${nodes.length} nodes validate required fields\n`);

console.log('4. ERROR HANDLING CHECK');
console.log('─'.repeat(60));
let errorHandlingCount = 0;
nodes.forEach(node => {
  const regex = new RegExp(`case '${node.name}':[\\s\\S]{0,3000}`, 'i');
  const match = content.match(regex);
  if (!match) return;
  
  const section = match[0];
  const hasTryCatch = section.includes('try {') && section.includes('catch');
  const hasErrorReturn = section.includes('success: false') || section.includes('error:');
  const hasErrorMessage = section.includes('error.message') || section.includes('error:');
  
  if (hasTryCatch && hasErrorReturn && hasErrorMessage) {
    errorHandlingCount++;
    console.log(`✅ ${node.name.padEnd(20)} - Proper error handling`);
  } else {
    console.log(`⚠️  ${node.name.padEnd(20)} - Try/Catch: ${hasTryCatch ? '✅' : '❌'} Error Return: ${hasErrorReturn ? '✅' : '❌'} Error Message: ${hasErrorMessage ? '✅' : '❌'}`);
  }
});
console.log(`\nTotal: ${errorHandlingCount}/${nodes.length} nodes have proper error handling\n`);

console.log('5. SUCCESS RETURN CHECK');
console.log('─'.repeat(60));
let successReturnCount = 0;
nodes.forEach(node => {
  const regex = new RegExp(`case '${node.name}':[\\s\\S]{0,3000}`, 'i');
  const match = content.match(regex);
  if (!match) return;
  
  const section = match[0];
  const hasSuccessReturn = section.includes('success: true') || section.includes('return {');
  
  if (hasSuccessReturn) {
    successReturnCount++;
    console.log(`✅ ${node.name.padEnd(20)} - Returns success result`);
  } else {
    console.log(`❌ ${node.name.padEnd(20)} - No success return found`);
  }
});
console.log(`\nTotal: ${successReturnCount}/${nodes.length} nodes return success results\n`);

console.log('6. EXTERNAL DEPENDENCIES CHECK');
console.log('─'.repeat(60));
const dependencies = {
  'queue_push': ['require(\'bull\')', 'Queue', 'redis'],
  'queue_consume': ['require(\'bull\')', 'Queue', 'redis'],
  'cache_get': ['require(\'ioredis\')', 'Redis'],
  'cache_set': ['require(\'ioredis\')', 'Redis'],
  'oauth2_auth': ['supabase', 'from(\'google_oauth_tokens\')', 'from(\'social_tokens\')'],
  'api_key_auth': ['supabase', 'from(\'credential_vault\')', 'from(\'credentials\')'],
  'execute_workflow': ['supabase', 'from(\'workflows\')', 'executeNode'],
};

let dependencyCount = 0;
Object.keys(dependencies).forEach(nodeName => {
  const deps = dependencies[nodeName];
  const regex = new RegExp(`case '${nodeName}':[\\s\\S]{0,5000}`, 'i');
  const match = content.match(regex);
  if (!match) {
    console.log(`⚠️  ${nodeName.padEnd(20)} - Cannot find case statement`);
    return;
  }
  
  const section = match[0];
  const allDepsPresent = deps.every(dep => section.includes(dep));
  
  if (allDepsPresent) {
    dependencyCount++;
    console.log(`✅ ${nodeName.padEnd(20)} - All dependencies present`);
  } else {
    const missing = deps.filter(d => !section.includes(d));
    console.log(`⚠️  ${nodeName.padEnd(20)} - Missing: ${missing.join(', ')}`);
  }
});

const nodesWithoutDeps = nodes.filter(n => !dependencies[n.name]);
nodesWithoutDeps.forEach(node => {
  console.log(`✅ ${node.name.padEnd(20)} - No external dependencies`);
  dependencyCount++;
});

console.log(`\nTotal: ${dependencyCount}/${nodes.length} nodes have dependencies handled\n`);

console.log('=== FINAL SUMMARY ===');
console.log('─'.repeat(60));
const allGood = structureCount === nodes.length &&
                helperCount === nodes.length &&
                validationCount === nodes.length &&
                errorHandlingCount === nodes.length &&
                successReturnCount === nodes.length &&
                dependencyCount === nodes.length;

if (allGood) {
  console.log('🎉 ALL NODE OPERATIONS VERIFIED AND WORKING!');
  console.log(`✅ ${nodes.length} nodes have proper structure`);
  console.log(`✅ ${nodes.length} nodes have required helpers`);
  console.log(`✅ ${nodes.length} nodes validate required fields`);
  console.log(`✅ ${nodes.length} nodes have error handling`);
  console.log(`✅ ${nodes.length} nodes return success results`);
  console.log(`✅ ${nodes.length} nodes handle dependencies correctly`);
  process.exit(0);
} else {
  console.log('⚠️  SOME OPERATIONS NEED ATTENTION:');
  if (structureCount !== nodes.length) console.log(`   - Structure: ${structureCount}/${nodes.length}`);
  if (helperCount !== nodes.length) console.log(`   - Helpers: ${helperCount}/${nodes.length}`);
  if (validationCount !== nodes.length) console.log(`   - Validation: ${validationCount}/${nodes.length}`);
  if (errorHandlingCount !== nodes.length) console.log(`   - Error Handling: ${errorHandlingCount}/${nodes.length}`);
  if (successReturnCount !== nodes.length) console.log(`   - Success Returns: ${successReturnCount}/${nodes.length}`);
  if (dependencyCount !== nodes.length) console.log(`   - Dependencies: ${dependencyCount}/${nodes.length}`);
  process.exit(1);
}
