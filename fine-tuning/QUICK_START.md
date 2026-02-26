# Quick Start: Training Dataset & Fine-Tuning

Get started with training dataset creation and fine-tuning in 5 minutes.

## Prerequisites

- Node.js and npm installed
- TypeScript configured
- Access to fine-tuning platform (OpenAI, Anthropic, Hugging Face, or Ollama)

## Step 1: Generate Training Dataset

```bash
cd worker
npm run train:generate
```

This creates `data/training_dataset_v2.json` with:
- 8+ seed examples
- 40+ synthetic variations
- Node type coverage
- Negative examples

**Time**: ~30 seconds

## Step 2: Validate Dataset

```bash
npm run train:validate
```

Checks for:
- Missing fields
- Invalid connections
- Orphan nodes
- Circular dependencies

**Fix any errors before proceeding!**

**Time**: ~10 seconds

## Step 3: Prepare Fine-Tuning Data

```bash
npm run train:prepare
```

Creates formatted files in `data/fine-tuning/`:
- `training_data_openai.jsonl`
- `training_data_anthropic.jsonl`
- `training_data_huggingface.jsonl`
- `training_data_ollama.jsonl`
- `few_shot_examples.json`

**Time**: ~5 seconds

## Step 4: Fine-Tune (Choose One)

### Option A: OpenAI

```bash
openai api fine_tunes.create \
  -t data/fine-tuning/training_data_openai.jsonl \
  -m gpt-3.5-turbo \
  --suffix "workflow-builder"
```

### Option B: Ollama (Local)

```bash
# Create Modelfile
cat > Modelfile << EOF
FROM qwen2.5:14b-instruct-q4_K_M
SYSTEM "You are an autonomous workflow builder..."
EOF

cat data/fine-tuning/training_data_ollama.jsonl >> Modelfile

# Create model
ollama create workflow-builder -f Modelfile
```

### Option C: Few-Shot Prompting (No Training)

Use `few_shot_examples.json` in your system prompt - no training needed!

## Step 5: Test

Test your fine-tuned model:

```typescript
const prompt = "When a form is submitted, save to Google Sheets";
const workflow = await generateWorkflow(prompt);
console.log(JSON.stringify(workflow, null, 2));
```

## What's Next?

- **Expand dataset**: Add more examples for better coverage
- **Iterate**: Test, identify failures, add examples, retrain
- **Monitor**: Track validation success rate

## Troubleshooting

**"Cannot find module 'fs'"**
- Ensure `@types/node` is installed: `npm install --save-dev @types/node`

**"Validation errors"**
- Fix errors in dataset before fine-tuning
- Check node IDs are unique
- Ensure all connections are valid

**"Low quality results"**
- Add more training examples
- Increase dataset size (aim for 500+)
- Improve example quality

## Full Documentation

- [README_COMPLETE.md](./README_COMPLETE.md) - Complete guide
- [TRAINING_DATASET_GUIDE.md](./TRAINING_DATASET_GUIDE.md) - Dataset creation details
- [FINE_TUNING_GUIDE.md](./FINE_TUNING_GUIDE.md) - Fine-tuning instructions
