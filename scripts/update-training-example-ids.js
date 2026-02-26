// Script to add exampleId/useCase mappings to training datasets
// Usage:
//   node worker/scripts/update-training-example-ids.js
//
// This script is intentionally conservative:
// - It only adds exampleId/useCase where we have a clear canonical match.
// - It preserves all existing structural fields (selectedNodes, nodeConfigurations, etc.).

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
            index[ex.id] = ex;
          }
        } catch {
          // ignore invalid example here; validate-workflow-examples.js will catch it
        }
      }
    }
  }

  walk(EXAMPLES_DIR);
  return index;
}

const examplesIndex = loadExamplesIndex();

// Mapping function: decide exampleId for a workflow based on goal/category.
// This can be expanded over time as more canonical examples are added.
function inferExampleId(workflow) {
  if (!workflow || !workflow.goal) return null;
  const goal = String(workflow.goal).toLowerCase();
  const category = String(workflow.category || '').toLowerCase();

  // Canonical examples we currently have:
  // - crm_lead_capture_hubspot_v1
  // - email_form_to_email_confirmation_v1
  // - sheets_scheduled_api_to_sheets_v1
  // - ai_chatbot_with_memory_gemini_v1
  // - webhook_to_slack_notification_v1
  // - database_db_backup_to_drive_v1

  if (goal.includes('lead management') || goal.includes('lead capture') || category === 'crm') {
    return 'crm_lead_capture_hubspot_v1';
  }

  if (
    goal.includes('form to email automation') ||
    goal.includes('email confirmation') ||
    (category === 'communication' && goal.includes('email'))
  ) {
    return 'email_form_to_email_confirmation_v1';
  }

  if (
    goal.includes('scheduled api to sheets') ||
    goal.includes('api data to sheets') ||
    (category === 'data sync' && goal.includes('sheets'))
  ) {
    return 'sheets_scheduled_api_to_sheets_v1';
  }

  if (goal.includes('ai chatbot with memory') || (category === 'ai chatbot' && goal.includes('chatbot'))) {
    return 'ai_chatbot_with_memory_gemini_v1';
  }

  if (goal.includes('db backup automation') || (category === 'backup' && goal.includes('backup'))) {
    return 'database_db_backup_to_drive_v1';
  }

  if (
    goal.includes('webhook data intake and notification') ||
    (category === 'data integration' && goal.includes('webhook'))
  ) {
    return 'webhook_to_slack_notification_v1';
  }

  // Fallback: do not infer if not clearly mappable
  return null;
}

function applyMappingsToDataset(datasetPath) {
  const fullPath = path.join(DATA_DIR, datasetPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`Skipping missing dataset: ${datasetPath}`);
    return;
  }

  const raw = fs.readFileSync(fullPath, 'utf-8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to parse ${datasetPath}:`, err.message);
    return;
  }

  if (!Array.isArray(data.workflows)) {
    console.warn(`Dataset ${datasetPath} has no workflows array; skipping.`);
    return;
  }

  let updatedCount = 0;

  for (const wf of data.workflows) {
    if (wf.exampleId) continue; // do not override existing mappings

    const exampleId = inferExampleId(wf);
    if (!exampleId) continue;

    const example = examplesIndex[exampleId];
    if (!example) {
      console.warn(
        `Inferred exampleId ${exampleId} for ${wf.id} in ${datasetPath}, but example not found on disk; skipping.`
      );
      continue;
    }

    wf.exampleId = exampleId;
    if (!wf.useCase && example.useCase) {
      wf.useCase = example.useCase;
    }
    updatedCount += 1;
  }

  if (updatedCount > 0) {
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Updated ${updatedCount} workflows in ${datasetPath} with exampleId/useCase.`);
  } else {
    console.log(`No workflows updated in ${datasetPath}.`);
  }
}

function main() {
  if (!Object.keys(examplesIndex).length) {
    console.error('No canonical examples found; aborting.');
    process.exitCode = 1;
    return;
  }

  for (const file of DATASET_FILES) {
    applyMappingsToDataset(file);
  }
}

if (require.main === module) {
  main();
}

