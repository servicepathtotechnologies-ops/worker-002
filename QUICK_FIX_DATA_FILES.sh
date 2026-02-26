#!/bin/bash
# Quick fix script to copy data files on AWS server
# Run this on your AWS server

echo "🔧 Fixing Missing Data Files"
echo "============================"
echo ""

cd /home/ubuntu/worker || cd /opt/ctrlchecks-worker/worker || {
    echo "❌ Could not find worker directory"
    exit 1
}

echo "📋 Step 1: Creating dist/data directory..."
mkdir -p dist/data
echo "✅ Directory created"
echo ""

echo "📋 Step 2: Copying data files..."
if [ -d "data" ]; then
    # Copy all JSON files
    cp data/*.json dist/data/ 2>/dev/null || true
    # Copy markdown files if any
    cp data/*.md dist/data/ 2>/dev/null || true
    
    echo "✅ Files copied"
else
    echo "⚠️  Data directory not found"
fi
echo ""

echo "📋 Step 3: Verifying files..."
if [ -f "dist/data/workflow_training_dataset_100.json" ]; then
    echo "✅ Training dataset found"
else
    echo "⚠️  Training dataset still missing"
fi

if [ -f "dist/data/website_knowledge.json" ]; then
    echo "✅ Knowledge base found"
else
    echo "⚠️  Knowledge base still missing"
fi
echo ""

echo "📋 Step 4: Restarting service..."
pm2 restart ctrlchecks-worker
echo ""

echo "✅ Fix complete!"
echo ""
echo "📋 Check logs: pm2 logs ctrlchecks-worker --lines 30"
echo ""
