# Fine-Tuning Guide for Autonomous Workflow Builder

Complete guide to fine-tuning your model for better workflow generation.

## Overview

Fine-tuning improves the model's ability to:
- Generate correct workflows from natural language
- Follow the 5-phase pipeline consistently
- Produce valid JSON with proper connections
- Handle edge cases and complex scenarios

## Prerequisites

1. **Training Dataset**: Created and validated (see [TRAINING_DATASET_GUIDE.md](./TRAINING_DATASET_GUIDE.md))
2. **Base Model**: Choose a capable model (Llama 3, Mistral, GPT-3.5, Claude, etc.)
3. **Fine-Tuning Platform**: OpenAI, Anthropic, Hugging Face, or Ollama

## Step-by-Step Process

### Step 1: Prepare Training Data

```bash
cd worker

# Generate dataset
npm run ts-node scripts/generate-training-dataset.ts

# Validate
npm run ts-node scripts/validate-training-data.ts

# Prepare for fine-tuning
npm run ts-node scripts/prepare-fine-tuning-data.ts
```

This creates formatted files in `data/fine-tuning/`:
- `training_data_openai.jsonl`
- `training_data_anthropic.jsonl`
- `training_data_huggingface.jsonl`
- `training_data_ollama.jsonl`

### Step 2: Choose Fine-Tuning Method

#### Option A: OpenAI Fine-Tuning

```bash
# Install OpenAI CLI
pip install openai

# Fine-tune
openai api fine_tunes.create \
  -t data/fine-tuning/training_data_openai.jsonl \
  -m gpt-3.5-turbo \
  --suffix "workflow-builder"

# Check status
openai api fine_tunes.follow -i ft-xxxxx

# Use fine-tuned model
# Update your code to use: gpt-3.5-turbo:ft-org:workflow-builder-xxxxx
```

#### Option B: Anthropic Fine-Tuning

```bash
# Use Anthropic API
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d @data/fine-tuning/training_data_anthropic.jsonl
```

#### Option C: Hugging Face

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
from datasets import load_dataset

# Load dataset
dataset = load_dataset('json', data_files='data/fine-tuning/training_data_huggingface.jsonl')

# Load model
model = AutoModelForCausalLM.from_pretrained("mistralai/Mistral-7B-v0.1")
tokenizer = AutoTokenizer.from_pretrained("mistralai/Mistral-7B-v0.1")

# Fine-tune
training_args = TrainingArguments(
    output_dir="./results",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    save_steps=500,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset['train'],
)

trainer.train()
```

#### Option D: Ollama (Local)

```bash
# Create Modelfile
cat > Modelfile << EOF
FROM qwen2.5:14b-instruct-q4_K_M
SYSTEM "You are an autonomous workflow builder..."
EOF

# Add training examples
cat data/fine-tuning/training_data_ollama.jsonl >> Modelfile

# Create model
ollama create workflow-builder -f Modelfile

# Test
ollama run workflow-builder "Create a workflow to send Slack notifications"
```

### Step 3: Evaluate Results

Test on held-out examples:

```typescript
// test-fine-tuned-model.ts
const testPrompts = [
  "When a form is submitted, save to Google Sheets",
  "Every day at 9am, check GitHub issues and post to Slack",
  // ... more test cases
];

testPrompts.forEach(prompt => {
  const workflow = await generateWorkflow(prompt);
  const validation = validateWorkflow(workflow);
  
  console.log(`Prompt: ${prompt}`);
  console.log(`Valid: ${validation.valid}`);
  console.log(`Errors: ${validation.errors.length}`);
});
```

### Step 4: Iterate

Based on evaluation results:

1. **Identify failure patterns**
   - Which prompts fail?
   - What types of errors?
   - Missing node types?

2. **Add training examples**
   - Create examples for failure cases
   - Add to dataset
   - Re-validate

3. **Retrain**
   - Fine-tune with expanded dataset
   - Evaluate again
   - Repeat until quality is acceptable

## Few-Shot Prompting Alternative

If fine-tuning is too resource-intensive, use few-shot prompting:

```typescript
import * as fs from 'fs';

const fewShotExamples = JSON.parse(
  fs.readFileSync('data/fine-tuning/few_shot_examples.json', 'utf-8')
);

const systemPrompt = `
You are an autonomous workflow builder AI. Convert natural language prompts into executable workflows.

Examples:
${fewShotExamples.slice(0, 5).map(ex => `
Prompt: ${ex.prompt}
Workflow: ${JSON.stringify(ex.workflow, null, 2)}
`).join('\n')}

Now generate a workflow for the user's prompt.
`;

// Use in your API call
const response = await ollama.generate({
  model: 'qwen2.5:14b-instruct-q4_K_M',
  prompt: systemPrompt + '\n\nUser: ' + userPrompt,
});
```

## Configuration

### Update Worker Configuration

After fine-tuning, update your worker config:

```typescript
// worker/src/core/config.ts
export const config = {
  ai: {
    model: process.env.FINE_TUNED_MODEL || 'qwen2.5:14b-instruct-q4_K_M',
    useFineTuned: process.env.USE_FINE_TUNED_MODEL === 'true',
    // ... other config
  }
};
```

### Environment Variables

```bash
# .env
USE_FINE_TUNED_MODEL=true
FINE_TUNED_MODEL=workflow-builder  # or your model name
OLLAMA_HOST=http://localhost:11434
```

## Best Practices

1. **Start with 100-200 examples** - Quality over quantity
2. **Cover all node types** - Ensure comprehensive coverage
3. **Include negative examples** - Teach model to recognize invalid requests
4. **Validate before training** - Fix errors in dataset first
5. **Test on held-out data** - Don't test on training examples
6. **Iterate based on failures** - Add examples for patterns that fail
7. **Monitor quality** - Track validation success rate over time

## Troubleshooting

### Low Quality Results

**Problem**: Model generates invalid workflows

**Solutions**:
- Add more examples for failing patterns
- Increase dataset size (aim for 500+ examples)
- Improve example quality (remove placeholders, fix connections)
- Use more capable base model

### Format Errors

**Problem**: Model doesn't output valid JSON

**Solutions**:
- Add JSON schema examples to system prompt
- Include more examples with proper JSON formatting
- Use structured output mode if available

### Missing Nodes

**Problem**: Model doesn't use certain node types

**Solutions**:
- Add more examples using those node types
- Include them in seed examples
- Explicitly mention in system prompt

## Next Steps

1. Generate your training dataset
2. Validate all examples
3. Choose fine-tuning platform
4. Fine-tune model
5. Evaluate results
6. Iterate based on failures

For dataset creation, see [TRAINING_DATASET_GUIDE.md](./TRAINING_DATASET_GUIDE.md)
