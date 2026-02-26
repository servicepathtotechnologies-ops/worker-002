# Complete Fine-Tuning Guide for Autonomous Workflow Builder

This guide provides everything you need to create training datasets and fine-tune your model for better workflow generation.

## Quick Start

```bash
# 1. Generate training dataset
npm run train:generate

# 2. Validate dataset
npm run train:validate

# 3. Prepare for fine-tuning
npm run train:prepare

# 4. Fine-tune (choose your platform)
# See FINE_TUNING_GUIDE.md for platform-specific instructions
```

## Overview

The training system follows your 5-phase pipeline:

1. **Pre-processing**: Normalize prompt, classify intent, identify nodes
2. **Understanding & Planning**: Extract requirements, generate system prompt
3. **Structure Generation**: Pattern matching, node selection
4. **Node Configuration**: Configure nodes with field mappings
5. **Connection & Validation**: Wire nodes, validate data flow
6. **Credential Discovery**: Identify required credentials

## File Structure

```
worker/
├── scripts/
│   ├── generate-training-dataset.ts    # Generate training examples
│   ├── validate-training-data.ts       # Validate dataset quality
│   └── prepare-fine-tuning-data.ts     # Convert to fine-tuning formats
├── data/
│   ├── training_dataset_v2.json       # Generated dataset
│   └── fine-tuning/
│       ├── training_data_openai.jsonl
│       ├── training_data_anthropic.jsonl
│       ├── training_data_huggingface.jsonl
│       ├── training_data_ollama.jsonl
│       └── few_shot_examples.json
└── fine-tuning/
    ├── README_COMPLETE.md              # This file
    ├── TRAINING_DATASET_GUIDE.md       # Dataset creation guide
    └── FINE_TUNING_GUIDE.md            # Fine-tuning instructions
```

## Step-by-Step Process

### Step 1: Generate Training Dataset

The generator creates:
- **Seed examples**: High-quality examples covering all node types
- **Synthetic variations**: Variations of seed examples
- **Node coverage**: Examples ensuring all node types are represented
- **Negative examples**: Invalid prompts for validation training

```bash
npm run train:generate
```

Output: `data/training_dataset_v2.json`

**What's included:**
- 8+ seed examples (simple, medium, complex)
- 40+ synthetic variations
- Node type coverage examples
- Negative examples

### Step 2: Validate Dataset

Validates all examples for:
- ✅ Required fields present
- ✅ Valid node IDs (unique)
- ✅ Connections reference existing nodes
- ✅ No orphan nodes
- ✅ No circular dependencies
- ✅ No placeholder values

```bash
npm run train:validate
```

**Fix any errors before proceeding!**

### Step 3: Prepare Fine-Tuning Data

Converts dataset to multiple formats:
- **OpenAI**: For OpenAI fine-tuning API
- **Anthropic**: For Claude fine-tuning
- **Hugging Face**: For open-source models
- **Ollama**: For local Ollama fine-tuning
- **Few-shot**: Examples for few-shot prompting

```bash
npm run train:prepare
```

Output: `data/fine-tuning/*.jsonl`

### Step 4: Fine-Tune Model

Choose your platform:

#### OpenAI
```bash
openai api fine_tunes.create \
  -t data/fine-tuning/training_data_openai.jsonl \
  -m gpt-3.5-turbo
```

#### Ollama (Local)
```bash
ollama create workflow-builder -f Modelfile
```

#### Hugging Face
```python
from transformers import Trainer, TrainingArguments
# See FINE_TUNING_GUIDE.md for full example
```

See [FINE_TUNING_GUIDE.md](./FINE_TUNING_GUIDE.md) for detailed instructions.

## Dataset Format

Each training example:

```json
{
  "prompt": "User's natural language request",
  "workflow": {
    "summary": "What the workflow does",
    "nodes": [
      {
        "id": "unique_id",
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
    "required_credentials": ["service1"],
    "validation_status": "valid"
  },
  "metadata": {
    "category": "category_name",
    "complexity": "simple|medium|complex",
    "node_types": ["node1", "node2"]
  }
}
```

## Coverage Requirements

Your dataset should include:

### Node Types (30+)
- **Triggers**: webhook, chat_trigger, form, schedule, manual_trigger, interval
- **Logic**: if, switch, set, merge, wait, filter, loop, limit, aggregate, sort
- **Integrations**: hubspot, zoho, pipedrive, notion, airtable, clickup, gmail, slack, telegram, outlook, google_calendar, linkedin, github
- **HTTP & AI**: http_request, ai_chat_model, ai_agent
- **Storage**: google_sheets

### Complexity Levels
- **Simple**: 1-2 nodes, single action
- **Medium**: 3-5 nodes, conditional logic
- **Complex**: 6+ nodes, multiple services, complex logic

### Edge Cases
- Multiple conditional branches
- Data transformations
- Error handling
- Nested logic
- Multi-service integrations

## Best Practices

1. **Start Small**: Begin with 100-200 high-quality examples
2. **Coverage First**: Ensure all node types represented
3. **Quality Over Quantity**: Better fewer perfect examples
4. **Iterate**: Add examples based on real failures
5. **Validate Always**: Run validation before fine-tuning
6. **Version Control**: Track dataset versions

## Iteration Process

1. **Generate initial dataset** (100-200 examples)
2. **Validate** - Fix errors
3. **Fine-tune** - Train model
4. **Test** - Run on held-out prompts
5. **Identify failures** - Find patterns that fail
6. **Add examples** - Create examples for failures
7. **Retrain** - Fine-tune with expanded dataset
8. **Repeat** - Continue until quality acceptable

## Troubleshooting

### Validation Errors

**"Missing node id"**
- Ensure every node has unique `id`

**"Orphan node"**
- Connect all nodes (except triggers)

**"Circular dependency"**
- Check for loops in connections

**"Placeholder values"**
- Replace TODO/FIXME with actual values

### Fine-Tuning Issues

**"Low quality results"**
- Add more examples for failing patterns
- Increase dataset size (aim for 500+)
- Improve example quality

**"Format error"**
- Check JSONL format (one JSON per line)
- Validate JSON structure

## Next Steps

1. **Generate Dataset**: `npm run train:generate`
2. **Validate**: `npm run train:validate`
3. **Prepare**: `npm run train:prepare`
4. **Fine-Tune**: See [FINE_TUNING_GUIDE.md](./FINE_TUNING_GUIDE.md)
5. **Evaluate**: Test on held-out examples
6. **Iterate**: Add examples for failures

## Documentation

- [TRAINING_DATASET_GUIDE.md](./TRAINING_DATASET_GUIDE.md) - Detailed dataset creation
- [FINE_TUNING_GUIDE.md](./FINE_TUNING_GUIDE.md) - Platform-specific fine-tuning
- [README.md](./README.md) - Original fine-tuning overview

## Support

For issues or questions:
1. Check validation errors first
2. Review example format
3. Ensure all node types covered
4. Check fine-tuning platform documentation
