// Validate that all exampleId references in datasets and templates
// correspond to canonical examples on disk, and detect orphaned examples.
//
// Usage:
//   node worker/scripts/validate-example-references.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const EXAMPLES_DIR = path.join(DATA_DIR, 'workflow_examples');

const DATASET_FILES = [
  'workflow_training_dataset.json',
  'workflow_training_dataset_100.json',
  'workflow_training_dataset_300.json'
];

function loadExamplesIndex() {
  const index = {};

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const raw = fs.readFileSync(full, 'utf-8');
        try {
          const ex = JSON.parse(raw);
          if (ex.id) {
            index[ex.id] = {
              file: full,
              meta: ex
            };
          }
        } catch {
          // Structural issues are handled by validate-workflow-examples.js
        }
      }
    }
  }

  walk(EXAMPLES_DIR);
  return index;
}

function collectDatasetExampleIds(examplesIndex) {
  const missing = [];
  const referenced = new Set();

  for (const name of DATASET_FILES) {
    const full = path.join(DATA_DIR, name);
    if (!fs.existsSync(full)) {
      continue;
    }

    const raw = fs.readFileSync(full, 'utf-8');
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error(`Failed to parse ${name}: ${err.message}`);
      continue;
    }

    if (!Array.isArray(data.workflows)) continue;

    for (const wf of data.workflows) {
      if (!wf.exampleId) continue;
      referenced.add(wf.exampleId);
      if (!examplesIndex[wf.exampleId]) {
        missing.push({
          source: name,
          workflowId: wf.id,
          exampleId: wf.exampleId
        });
      }
    }
  }

  return { missing, referenced };
}

function collectTemplateExampleIds(examplesIndex) {
  const tmplPath = path.join(DATA_DIR, 'workflow_templates.json');
  const missing = [];
  const referenced = new Set();

  if (!fs.existsSync(tmplPath)) {
    return { missing, referenced };
  }

  const raw = fs.readFileSync(tmplPath, 'utf-8');
  let templates;
  try {
    templates = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to parse workflow_templates.json: ${err.message}`);
    return { missing, referenced };
  }

  for (const [key, value] of Object.entries(templates)) {
    if (!value || !value.exampleId) continue;
    const exampleId = value.exampleId;
    referenced.add(exampleId);
    if (!examplesIndex[exampleId]) {
      missing.push({
        source: 'workflow_templates.json',
        templateKey: key,
        exampleId
      });
    }
  }

  return { missing, referenced };
}

function main() {
  const examplesIndex = loadExamplesIndex();
  const allExampleIds = new Set(Object.keys(examplesIndex));

  if (allExampleIds.size === 0) {
    console.error('No canonical workflow examples found on disk.');
    process.exitCode = 1;
    return;
  }

  const datasetInfo = collectDatasetExampleIds(examplesIndex);
  const templateInfo = collectTemplateExampleIds(examplesIndex);

  let hasErrors = false;

  if (datasetInfo.missing.length > 0) {
    hasErrors = true;
    console.error('\n❌ Missing examples referenced in training datasets:');
    for (const item of datasetInfo.missing) {
      console.error(
        `  - ${item.source}: workflow ${item.workflowId} references exampleId ${item.exampleId}, which does not exist on disk`
      );
    }
  }

  if (templateInfo.missing.length > 0) {
    hasErrors = true;
    console.error('\n❌ Missing examples referenced in workflow_templates.json:');
    for (const item of templateInfo.missing) {
      console.error(
        `  - template ${item.templateKey} references exampleId ${item.exampleId}, which does not exist on disk`
      );
    }
  }

  // Orphan detection: examples not referenced by any dataset/template
  const referenced = new Set([
    ...datasetInfo.referenced.values(),
    ...templateInfo.referenced.values()
  ]);
  const orphans = Array.from(allExampleIds).filter((id) => !referenced.has(id));

  if (orphans.length > 0) {
    console.warn('\n⚠️  Orphaned canonical examples (not referenced by datasets or templates):');
    for (const id of orphans) {
      const rel = path.relative(ROOT, examplesIndex[id].file);
      console.warn(`  - ${id} (${rel})`);
    }
  }

  if (!hasErrors) {
    console.log('\nAll exampleId references are valid.');
  } else {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

