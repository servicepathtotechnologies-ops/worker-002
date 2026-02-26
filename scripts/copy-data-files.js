#!/usr/bin/env node
/**
 * Copy data files to dist directory after build
 * This ensures data files are available in production
 */

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../data');
const destDir = path.join(__dirname, '../dist/data');

console.log('📋 Copying data files to dist directory...');

// Create dest directory if it doesn't exist
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  console.log(`✅ Created directory: ${destDir}`);
}

// Files to copy
const filesToCopy = [
  'workflow_training_dataset_100.json',
  'workflow_training_dataset.json',
  'website_knowledge.json',
  'node_reference.json',
  'node-library.v1.json',
  'workflow_templates.json',
  'form_templates.json',
  'webhook_configs.json',
  'prompt_templates.json',
  'agent_personas.json',
  'autonomous-workflow-agent-prompt.md'
];

let copiedCount = 0;
let skippedCount = 0;

filesToCopy.forEach(file => {
  const source = path.join(sourceDir, file);
  const dest = path.join(destDir, file);
  
  if (fs.existsSync(source)) {
    try {
      fs.copyFileSync(source, dest);
      console.log(`✅ Copied: ${file}`);
      copiedCount++;
    } catch (error) {
      console.error(`❌ Failed to copy ${file}:`, error.message);
    }
  } else {
    console.warn(`⚠️  File not found (skipping): ${file}`);
    skippedCount++;
  }
});

console.log(`\n📊 Summary: ${copiedCount} copied, ${skippedCount} skipped`);
console.log('✅ Data files copy complete!\n');
