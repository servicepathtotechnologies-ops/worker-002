/* eslint-disable no-console */
/**
 * Node Coverage Audit
 *
 * Compares node types defined in NodeLibrary (schemas) vs node types implemented
 * in the execution runtime (execute-workflow.ts).
 *
 * Usage:
 *   node scripts/node-coverage-audit.js
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const nodeLibraryPath = path.join(repoRoot, 'src', 'services', 'nodes', 'node-library.ts');
const executorPath = path.join(repoRoot, 'src', 'api', 'execute-workflow.ts');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function uniq(arr) {
  return Array.from(new Set(arr)).sort();
}

function extractNodeLibraryTypes(ts) {
  // Only capture NodeSchema.type from schema factory methods:
  // private createXxxSchema(): NodeSchema { return { type: 'foo', ... } }
  const re = /create[A-Za-z0-9_]+Schema\(\)\s*:\s*NodeSchema\s*\{\s*return\s*\{\s*type:\s*'([^']+)'/gms;
  const types = [];
  let m;
  while ((m = re.exec(ts))) {
    types.push(m[1]);
  }
  return uniq(types);
}

function extractExecutorCases(ts) {
  const re = /case\s+'([^']+)'\s*:/g;
  const types = [];
  let m;
  while ((m = re.exec(ts))) {
    types.push(m[1]);
  }
  return uniq(types);
}

function main() {
  const nodeLib = read(nodeLibraryPath);
  const executor = read(executorPath);

  const nodeTypes = extractNodeLibraryTypes(nodeLib);
  const execTypes = extractExecutorCases(executor);

  const missingInExecutor = nodeTypes.filter(t => !execTypes.includes(t));
  const extraInExecutor = execTypes.filter(t => !nodeTypes.includes(t));

  console.log('=== Node Coverage Audit ===');
  console.log(`NodeLibrary schemas: ${nodeTypes.length}`);
  console.log(`Executor cases:      ${execTypes.length}`);
  console.log('');

  console.log(`Missing in executor (${missingInExecutor.length}):`);
  missingInExecutor.forEach(t => console.log(`- ${t}`));
  console.log('');

  console.log(`Extra in executor (no schema match) (${extraInExecutor.length}):`);
  extraInExecutor.forEach(t => console.log(`- ${t}`));
  console.log('');
}

main();

