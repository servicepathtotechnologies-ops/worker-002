#!/bin/bash
# Helper script to run ollama-ft training with proper configuration
# Usage: bash scripts/run-ollama-ft.sh

set -e

# Configuration
BASE_MODEL="${BASE_MODEL:-qwen2.5:14b-instruct-q4_K_M}"
FINE_TUNED_MODEL="${FINE_TUNED_MODEL:-ctrlchecks-workflow-builder}"
TRAINING_DATA="${TRAINING_DATA:-worker/data/training_data.jsonl}"
EPOCHS="${EPOCHS:-3}"
LEARNING_RATE="${LEARNING_RATE:-2e-5}"
BATCH_SIZE="${BATCH_SIZE:-4}"

# Check if ollama-ft is installed
if ! command -v ollama-ft &> /dev/null; then
    echo "❌ ollama-ft is not installed!"
    echo ""
    echo "📝 Install with:"
    echo "   pip install ollama-ft"
    echo ""
    exit 1
fi

# Check if training data exists
if [ ! -f "$TRAINING_DATA" ]; then
    echo "❌ Training data not found: $TRAINING_DATA"
    echo ""
    echo "📝 Prepare data first:"
    echo "   npm run train:prepare-data"
    echo ""
    exit 1
fi

echo "🚀 Starting ollama-ft fine-tuning..."
echo ""
echo "   Base Model: $BASE_MODEL"
echo "   Output Model: $FINE_TUNED_MODEL"
echo "   Training Data: $TRAINING_DATA"
echo "   Epochs: $EPOCHS"
echo "   Learning Rate: $LEARNING_RATE"
echo "   Batch Size: $BATCH_SIZE"
echo ""

# Run training
ollama-ft train \
  --base-model "$BASE_MODEL" \
  --output-model "$FINE_TUNED_MODEL" \
  --data "$TRAINING_DATA" \
  --epochs "$EPOCHS" \
  --learning-rate "$LEARNING_RATE" \
  --batch-size "$BATCH_SIZE"

echo ""
echo "✅ Fine-tuning complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Test the model: ollama run $FINE_TUNED_MODEL \"Your test prompt\""
echo "   2. Update environment variables"
echo "   3. Restart your worker service"
