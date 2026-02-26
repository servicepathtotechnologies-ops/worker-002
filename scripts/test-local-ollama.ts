/**
 * Test Training Data with Local Ollama (if available)
 * Validates that examples work with Ollama format
 */

import * as fs from 'fs';
import * as path from 'path';

interface TrainingExample {
  prompt: string;
  completion: string;
}

async function main() {
  console.log('🧪 Testing training data with local Ollama...\n');

  const jsonlPath = path.join(__dirname, '../data/training_data.jsonl');
  
  if (!fs.existsSync(jsonlPath)) {
    console.error('❌ Training data file not found:', jsonlPath);
    process.exit(1);
  }

  // Check if Ollama is available locally
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`);
    if (!response.ok) {
      throw new Error('Ollama not responding');
    }
    console.log('✅ Local Ollama detected\n');
  } catch (error) {
    console.log('⚠️  Local Ollama not available');
    console.log('   This is OK - you can still validate the data format\n');
    console.log('   To test with Ollama:');
    console.log('   1. Install Ollama: https://ollama.ai');
    console.log('   2. Run: ollama serve');
    console.log('   3. Set: OLLAMA_BASE_URL=http://localhost:11434\n');
    
    // Still validate format
    validateFormat();
    return;
  }

  // Test with a few examples
  const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(l => l.trim());
  const examples: TrainingExample[] = lines.slice(0, 5).map(line => JSON.parse(line));

  console.log('📋 Testing sample examples:\n');

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    console.log(`Example ${i + 1}: ${example.prompt}`);
    
    try {
      // Test prompt format
      const testPrompt = example.prompt;
      const completion = JSON.parse(example.completion);
      
      console.log(`   ✅ Format valid`);
      console.log(`   Trigger: ${completion.trigger}`);
      console.log(`   Nodes: ${completion.nodes?.join(', ') || 'none'}`);
      console.log('');
    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  console.log('✅ Format validation complete!');
  console.log('\n💡 To test actual model generation, upload to AWS and train.');
}

function validateFormat() {
  console.log('🔍 Validating data format...\n');

  const jsonlPath = path.join(__dirname, '../data/training_data.jsonl');
  const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(l => l.trim());
  
  let valid = 0;
  let invalid = 0;

  lines.forEach((line, index) => {
    try {
      const example = JSON.parse(line);
      if (example.prompt && example.completion) {
        JSON.parse(example.completion); // Validate completion is JSON
        valid++;
      } else {
        invalid++;
      }
    } catch {
      invalid++;
    }
  });

  console.log(`   Valid: ${valid}`);
  console.log(`   Invalid: ${invalid}`);
  console.log(`   Total: ${lines.length}\n`);

  if (invalid === 0) {
    console.log('✅ All examples are valid!\n');
  } else {
    console.log(`⚠️  ${invalid} invalid examples found\n`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main, validateFormat };
