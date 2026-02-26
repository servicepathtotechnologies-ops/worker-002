/**
 * Prepare Training Data for Fine-Tuning
 * Converts workflow dataset to JSONL format for ollama-ft
 */

import * as fs from 'fs';
import * as path from 'path';

interface Workflow {
  id: string;
  goal: string;
  phase1: {
    step1: {
      userPrompt: string;
    };
    step5: {
      selectedNodes: string[];
      connections: string[];
    };
  };
}

function main() {
  console.log('📝 Preparing training data for fine-tuning...');

  // Read dataset
  const datasetPath = path.join(__dirname, '../data/workflow_training_dataset_300.json');
  
  if (!fs.existsSync(datasetPath)) {
    console.error(`❌ Dataset not found: ${datasetPath}`);
    console.log('💡 Run generate-200-examples.ts first!');
    process.exit(1);
  }

  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  const workflows: Workflow[] = dataset.workflows || [];

  console.log(`📊 Found ${workflows.length} workflows`);

  // Convert to JSONL format
  const jsonl: string[] = [];

  workflows.forEach((workflow, index) => {
    try {
      const prompt = workflow.phase1.step1.userPrompt || workflow.goal;
      const nodes = workflow.phase1.step5?.selectedNodes || [];
      const connections = workflow.phase1.step5?.connections || [];
      const trigger = nodes[0] || 'manual_trigger';
      const actionNodes = nodes.slice(1);

      // Create training example
      const trainingExample = {
        prompt: `Create a workflow: ${prompt}`,
        completion: JSON.stringify({
          trigger,
          nodes: actionNodes,
          connections,
          goal: workflow.goal,
        }),
      };

      jsonl.push(JSON.stringify(trainingExample));
    } catch (error) {
      console.warn(`⚠️  Skipping workflow ${workflow.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Write JSONL file
  const outputPath = path.join(__dirname, '../data/training_data.jsonl');
  fs.writeFileSync(outputPath, jsonl.join('\n'), 'utf-8');

  console.log(`✅ Created training_data.jsonl with ${jsonl.length} examples`);
  console.log(`📁 Location: ${outputPath}`);
  console.log(`📦 File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);

  // Show sample
  if (jsonl.length > 0) {
    console.log('\n📋 Sample training example:');
    console.log(JSON.parse(jsonl[0]));
  }
}

if (require.main === module) {
  main();
}

export { main };
