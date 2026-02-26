#!/bin/bash
# Bash script to create Ollama model on remote server
# This script sets OLLAMA_BASE_URL and creates the model

MODEL_NAME="${1:-ctrlchecks-workflow-builder}"
MODELFILE_PATH="${2:-worker/data/Modelfile}"
OLLAMA_BASE_URL="${3:-http://ollama.ctrlchecks.ai:8000}"

echo "🚀 Creating Ollama model on remote server..."
echo "   Model: $MODEL_NAME"
echo "   Modelfile: $MODELFILE_PATH"
echo "   Ollama Base URL: $OLLAMA_BASE_URL"
echo ""

# Check if Modelfile exists
if [ ! -f "$MODELFILE_PATH" ]; then
    echo "❌ Error: Modelfile not found at $MODELFILE_PATH"
    echo "   Run: npm run train:prepare-data first"
    exit 1
fi

# Extract hostname:port from URL (OLLAMA_BASE_URL env var format)
# Remove http:// or https:// prefix
OLLAMA_BASE_URL_ENV=$(echo "$OLLAMA_BASE_URL" | sed 's|^https\?://||')

echo "📝 Setting OLLAMA_BASE_URL=$OLLAMA_BASE_URL_ENV"
export OLLAMA_BASE_URL="$OLLAMA_BASE_URL_ENV"

echo "🔧 Running: ollama create $MODEL_NAME -f $MODELFILE_PATH"
echo ""

# Run ollama create command
if ollama create "$MODEL_NAME" -f "$MODELFILE_PATH"; then
    echo ""
    echo "✅ Model created successfully!"
    echo "   Model name: $MODEL_NAME"
    echo ""
    echo "🧪 Test the model:"
    echo "   ollama run $MODEL_NAME \"Create a workflow to send daily emails\""
    exit 0
else
    echo ""
    echo "❌ Failed to create model. Exit code: $?"
    echo ""
    echo "💡 Troubleshooting:"
    echo "   1. Make sure Ollama CLI is installed"
    echo "   2. Check if the remote server is accessible: $OLLAMA_BASE_URL"
    echo "   3. Verify the Modelfile exists: $MODELFILE_PATH"
    exit 1
fi
