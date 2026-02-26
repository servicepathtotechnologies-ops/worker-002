# Training Dataset Creation Guide

This guide explains how to create, validate, and use training datasets for fine-tuning the autonomous workflow builder.

## Overview

The training dataset follows a 5-phase pipeline structure:
1. **Pre-processing**: Normalization, intent classification, node resolution
2. **Understanding & Planning**: System prompt generation, requirements extraction
3. **Structure Generation**: Pattern matching, node selection
4. **Node Configuration**: Field mapping, defaults
5. **Connection & Validation**: Wiring, validation, credential discovery

## Dataset Format

Each training example follows this structure:

```json
{
  "prompt": "User's natural language request",
  "workflow": {
    "summary": "Short description of what the workflow does",
    "nodes": [
      {
        "id": "unique_node_id",
        "type": "node_type",
        "config": {
          "field": "{{previous_node.output.field}}"
        }
      }
    ],
    "connections": [
      {
        "source": "node_id",
        "target": "node_id",
        "source_output": "output_field",
        "target_input": "input_field"
      }
    ],
    "required_credentials": ["service1", "service2"],
    "validation_status": "valid"
  },
  "metadata": {
    "category": "category_name",
    "complexity": "simple|medium|complex",
    "node_types": ["node1", "node2"]
  }
}
```

## Creating Training Data

### Step 1: Generate Base Dataset

Run the training dataset generator:

```bash
cd worker
npm run ts-node scripts/generate-training-dataset.ts
```

This creates:
- Seed examples covering all node types
- Synthetic variations
- Node type coverage examples
- Negative examples (for validation failure cases)

Output: `data/training_dataset_v2.json`

### Step 2: Validate Dataset

Validate all examples:

```bash
npm run ts-node scripts/validate-training-data.ts
```

This checks:
- ✅ All required fields present
- ✅ Connections reference valid nodes
- ✅ No orphan nodes
- ✅ No circular dependencies
- ✅ No placeholder values

### Step 3: Prepare for Fine-Tuning

Convert to fine-tuning formats:

```bash
npm run ts-node scripts/prepare-fine-tuning-data.ts
```

This generates:
- `data/fine-tuning/training_data_openai.jsonl` - OpenAI format
- `data/fine-tuning/training_data_anthropic.jsonl` - Anthropic format
- `data/fine-tuning/training_data_huggingface.jsonl` - Hugging Face format
- `data/fine-tuning/training_data_ollama.jsonl` - Ollama format
- `data/fine-tuning/few_shot_examples.json` - Few-shot examples

## Dataset Requirements

### Coverage Requirements

Your dataset should include:

1. **All Node Types** (30+ nodes)
   - Triggers: webhook, chat_trigger, form, schedule, etc.
   - Logic: if, switch, set, merge, wait, etc.
   - Integrations: hubspot, zoho, pipedrive, notion, airtable, etc.
   - HTTP & AI: http_request, ai_chat_model
   - Storage: google_sheets

2. **Varied Prompts**
   - Simple: Single action workflows
   - Medium: Multi-step with conditions
   - Complex: Multi-service integrations with logic

3. **Edge Cases**
   - Multiple logic nodes
   - Data transformations
   - Error handling
   - Conditional branching

4. **Negative Examples**
   - Ambiguous prompts
   - Incomplete requests
   - Invalid configurations

### Quality Guidelines

1. **Complete Configurations**
   - No placeholders (TODO, FIXME, PLACEHOLDER)
   - All required fields filled
   - Use `{{field}}` syntax for data mappings

2. **Valid Connections**
   - Every input has a source
   - Output types match input types
   - No broken links

3. **Realistic Examples**
   - Mimic real user requests
   - Use realistic field names
   - Include proper error handling

## Manual Creation Process

For high-quality examples, manually create workflows:

1. **Write the prompt** - Natural language description
2. **Design the workflow** - Plan nodes and connections
3. **Configure nodes** - Set all fields with proper mappings
4. **Validate** - Run validation script
5. **Add to dataset** - Include in training_dataset_v2.json

## Synthetic Generation

Use the generator script to create variations:

```typescript
// In generate-training-dataset.ts
const synthetic = generateSyntheticExamples(seedExample, count);
```

This creates variations by:
- Changing service names (Slack → Telegram)
- Varying schedules (9 AM → 10 AM)
- Modifying conditions
- Updating node IDs

## Fine-Tuning Process

### Option 1: Full Fine-Tuning

1. **Prepare data** (see Step 3 above)
2. **Choose platform**:
   - OpenAI: Use `training_data_openai.jsonl`
   - Anthropic: Use `training_data_anthropic.jsonl`
   - Hugging Face: Use `training_data_huggingface.jsonl`
   - Ollama: Use `training_data_ollama.jsonl`

3. **Fine-tune model**:
   ```bash
   # OpenAI
   openai api fine_tunes.create -t training_data_openai.jsonl
   
   # Hugging Face
   transformers-cli train --train_file training_data_huggingface.jsonl
   
   # Ollama
   ollama create my-model -f Modelfile
   ```

### Option 2: Few-Shot Prompting

Use `few_shot_examples.json` in your system prompt:

```typescript
const fewShotExamples = require('./data/fine-tuning/few_shot_examples.json');
const systemPrompt = `
${baseSystemPrompt}

Examples:
${fewShotExamples.map(ex => `
Prompt: ${ex.prompt}
Workflow: ${JSON.stringify(ex.workflow, null, 2)}
`).join('\n')}
`;
```

## Iteration Process

1. **Generate initial dataset** (100-200 examples)
2. **Validate** - Fix any errors
3. **Fine-tune** - Train initial model
4. **Test** - Run on held-out prompts
5. **Identify failures** - Find patterns that fail
6. **Add examples** - Create examples for failure cases
7. **Retrain** - Fine-tune with expanded dataset
8. **Repeat** - Continue until quality is acceptable

## Best Practices

1. **Start Small**: Begin with 100-200 high-quality examples
2. **Coverage First**: Ensure all node types are represented
3. **Quality Over Quantity**: Better to have fewer perfect examples
4. **Iterate**: Add examples based on real failures
5. **Validate Always**: Run validation before fine-tuning
6. **Version Control**: Track dataset versions and changes

## Troubleshooting

### Validation Errors

**"Missing node id"**
- Ensure every node has a unique `id` field

**"Orphan node"**
- Connect all nodes (except triggers) to the workflow

**"Circular dependency"**
- Check for loops in connections

**"Placeholder values"**
- Replace TODO/FIXME with actual values

### Fine-Tuning Issues

**"Format error"**
- Check JSONL format (one JSON object per line)
- Validate JSON structure

**"Low quality results"**
- Add more examples for failing patterns
- Increase dataset size
- Improve example quality

## Next Steps

1. Read [FINE_TUNING_GUIDE.md](./FINE_TUNING_GUIDE.md) for fine-tuning instructions
2. Review [VALIDATION_RULES.md](./VALIDATION_RULES.md) for validation details
3. Check [EXAMPLE_TEMPLATES.md](./EXAMPLE_TEMPLATES.md) for example templates
