// Validation script for canonical workflow examples
// Run with: node worker/scripts/validate-workflow-examples.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXAMPLES_DIR = path.join(ROOT, 'data', 'workflow_examples');
const NODE_LIBRARY_PATH = path.join(ROOT, 'data', 'node-library.v1.json');

function loadNodeLibrary() {
  try {
    const raw = fs.readFileSync(NODE_LIBRARY_PATH, 'utf-8');
    const json = JSON.parse(raw);
    // Expect shape: { nodes: [{ type, configSchema?, credentials? }, ...] }
    const map = new Map();
    if (Array.isArray(json.nodes)) {
      for (const node of json.nodes) {
        if (node.type) {
          map.set(node.type, node);
        }
      }
    }
    return map;
  } catch (err) {
    console.error('Failed to load node library from', NODE_LIBRARY_PATH, err.message);
    process.exitCode = 1;
    return new Map();
  }
}

function collectExampleFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectExampleFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

function validateExample(filePath, nodeLibrary) {
  const errors = [];
  const raw = fs.readFileSync(filePath, 'utf-8');

  let example;
  try {
    example = JSON.parse(raw);
  } catch (err) {
    errors.push(`Invalid JSON: ${err.message}`);
    return errors;
  }

  const requiredTopLevel = ['id', 'category', 'useCase', 'title', 'description', 'nodes', 'edges'];
  for (const key of requiredTopLevel) {
    if (!(key in example)) {
      errors.push(`Missing top-level field: ${key}`);
    }
  }

  if (!Array.isArray(example.nodes) || example.nodes.length === 0) {
    errors.push('nodes must be a non-empty array');
    return errors;
  }

  const nodeIds = new Set();

  for (const node of example.nodes) {
    if (!node.id) {
      errors.push('Node missing id');
      continue;
    }
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);

    if (!node.type) {
      errors.push(`Node ${node.id} missing type`);
      continue;
    }

    const def = nodeLibrary.get(node.type);
    if (!def) {
      errors.push(`Node ${node.id} has unknown type: ${node.type}`);
    }

    if (node.requiredFields && Array.isArray(node.requiredFields)) {
      for (const field of node.requiredFields) {
        if (!node.config || !(field in node.config)) {
          errors.push(`Node ${node.id} is missing required config field: ${field}`);
        }
      }
    }

    if (!Array.isArray(node.credentials)) {
      errors.push(`Node ${node.id} must declare credentials as an array (can be empty).`);
    }
  }

  if (!Array.isArray(example.edges) || example.edges.length === 0) {
    errors.push('edges must be a non-empty array');
  } else {
    for (const edge of example.edges) {
      if (!edge.source || !edge.target) {
        errors.push('Edge missing source or target');
        continue;
      }
      if (!nodeIds.has(edge.source)) {
        errors.push(`Edge source does not exist: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        errors.push(`Edge target does not exist: ${edge.target}`);
      }
    }
  }

  return errors;
}

function main() {
  const nodeLibrary = loadNodeLibrary();
  const files = collectExampleFiles(EXAMPLES_DIR);

  if (files.length === 0) {
    console.warn('No workflow example files found in', EXAMPLES_DIR);
    return;
  }

  let totalErrors = 0;

  for (const file of files) {
    const relative = path.relative(ROOT, file);
    const errors = validateExample(file, nodeLibrary);
    if (errors.length > 0) {
      totalErrors += errors.length;
      console.error(`\n❌ ${relative}`);
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
    } else {
      console.log(`✅ ${relative}`);
    }
  }

  if (totalErrors > 0) {
    console.error(`\nValidation failed with ${totalErrors} error(s).`);
    process.exitCode = 1;
  } else {
    console.log('\nAll workflow examples are valid.');
  }
}

if (require.main === module) {
  main();
}

