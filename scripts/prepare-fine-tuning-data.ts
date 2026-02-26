/**
 * Prepare Fine-Tuning Data
 * 
 * Converts training dataset to the format required for fine-tuning:
 * - System prompt + User prompt + Assistant response (workflow JSON)
 * - JSONL format (one example per line)
 * - Compatible with OpenAI, Anthropic, Hugging Face, and Ollama fine-tuning
 */

import * as fs from 'fs';
import * as path from 'path';

interface TrainingExample {
  prompt: string;
  workflow: any;
  metadata?: any;
}

/**
 * Get the system prompt for workflow generation
 */
function getSystemPrompt(): string {
  return `You are an autonomous workflow builder AI. Your task is to convert a user's natural language prompt into a complete, executable workflow following a strict multi-phase pipeline. You must output a valid JSON workflow definition that includes nodes, connections, configurations, and required credentials.

Follow these phases:
1. Pre-processing: Normalize prompt, classify intent, identify nodes
2. Understanding & Planning: Extract requirements, determine structure
3. Structure Generation: Select nodes, build workflow graph
4. Node Configuration: Configure nodes with proper field mappings
5. Connection & Validation: Wire nodes, validate data flow
6. Credential Discovery: Identify required credentials

Output format:
{
  "summary": "string",
  "nodes": [{"id": "...", "type": "...", "config": {...}}],
  "connections": [{"source": "...", "target": "...", "source_output": "...", "target_input": "..."}],
  "required_credentials": ["..."],
  "validation_status": "valid" | "needs_attention"
}

Validation rules:
- All required fields must be filled
- Every input must have a source connection
- No orphan nodes
- No circular dependencies
- Correct IO mapping`;
}

/**
 * Format for OpenAI fine-tuning
 */
function formatOpenAI(example: TrainingExample): string {
  return JSON.stringify({
    messages: [
      { role: "system", content: getSystemPrompt() },
      { role: "user", content: example.prompt },
      { role: "assistant", content: JSON.stringify(example.workflow, null, 2) }
    ]
  });
}

/**
 * Format for Anthropic fine-tuning
 */
function formatAnthropic(example: TrainingExample): string {
  return JSON.stringify({
    messages: [
      { role: "user", content: `${getSystemPrompt()}\n\nUser prompt: ${example.prompt}` },
      { role: "assistant", content: JSON.stringify(example.workflow, null, 2) }
    ]
  });
}

/**
 * Format for Hugging Face / Generic JSONL
 */
function formatHuggingFace(example: TrainingExample): string {
  return JSON.stringify({
    instruction: getSystemPrompt(),
    input: example.prompt,
    output: JSON.stringify(example.workflow, null, 2)
  });
}

/**
 * Format for Ollama fine-tuning (Modelfile format)
 */
function formatOllama(example: TrainingExample): string {
  const prompt = example.prompt;
  const response = JSON.stringify(example.workflow, null, 2);
  
  return `<system>
${getSystemPrompt()}
</system>
<user>
${prompt}
</user>
<assistant>
${response}
</assistant>`;
}

/**
 * Main function
 */
function main() {
  console.log('📝 Preparing fine-tuning data...\n');
  
  const datasetPath = path.join(__dirname, '../data/training_dataset_v2.json');
  
  if (!fs.existsSync(datasetPath)) {
    console.error(`❌ Dataset not found: ${datasetPath}`);
    console.log('💡 Run generate-training-dataset.ts first!');
    process.exit(1);
  }
  
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  const examples: TrainingExample[] = dataset.examples || [];
  
  console.log(`📊 Processing ${examples.length} examples...\n`);
  
  const outputDir = path.join(__dirname, '../data/fine-tuning');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Generate different formats
  const formats = {
    openai: formatOpenAI,
    anthropic: formatAnthropic,
    huggingface: formatHuggingFace,
    ollama: formatOllama
  };
  
  Object.entries(formats).forEach(([formatName, formatter]) => {
    const lines: string[] = [];
    
    examples.forEach(example => {
      try {
        const formatted = formatter(example);
        lines.push(formatted);
      } catch (error) {
        console.warn(`⚠️  Skipping example in ${formatName} format: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    
    const outputPath = path.join(outputDir, `training_data_${formatName}.jsonl`);
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
    
    console.log(`✅ Created ${formatName} format: ${lines.length} examples`);
    console.log(`   📁 ${outputPath}`);
    console.log(`   📦 ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB\n`);
  });
  
  // Also create a combined format for few-shot prompting
  const fewShotExamples = examples.slice(0, 10).map(ex => ({
    prompt: ex.prompt,
    workflow: ex.workflow
  }));
  
  const fewShotPath = path.join(outputDir, 'few_shot_examples.json');
  fs.writeFileSync(fewShotPath, JSON.stringify(fewShotExamples, null, 2), 'utf-8');
  console.log(`✅ Created few-shot examples: ${fewShotExamples.length} examples`);
  console.log(`   📁 ${fewShotPath}\n`);
  
  console.log('✅ Fine-tuning data preparation complete!');
  console.log(`\n📂 All files saved to: ${outputDir}`);
}

if (require.main === module) {
  main();
}

export { main, getSystemPrompt, formatOpenAI, formatAnthropic, formatHuggingFace, formatOllama };
