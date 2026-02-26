#!/bin/bash
# Fix Port 3001 Conflict - Run on AWS Server
# This script will fix the port conflict issue

set -e

echo "🔍 =========================================="
echo "🔍 Fixing Port 3001 Conflict"
echo "🔍 =========================================="
echo ""

# Step 1: Find what's using port 3001
echo "📋 Step 1: Finding processes using port 3001..."
echo ""
PROCESSES=$(sudo lsof -i :3001 2>/dev/null || echo "")
if [ -z "$PROCESSES" ]; then
    echo "✅ Port 3001 appears to be free"
else
    echo "⚠️  Found processes using port 3001:"
    echo "$PROCESSES"
    echo ""
fi

# Step 2: Stop all PM2 processes
echo "📋 Step 2: Stopping all PM2 processes..."
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true
echo "✅ PM2 processes stopped"
echo ""

# Step 3: Kill any node processes
echo "📋 Step 3: Killing any remaining node processes..."
pkill -f "node.*index.js" 2>/dev/null || true
pkill -f "node.*3001" 2>/dev/null || true
pkill -f "npm run build" 2>/dev/null || true
echo "✅ Node processes killed"
echo ""

# Step 4: Stop systemd service if running
echo "📋 Step 4: Stopping systemd service (if running)..."
sudo systemctl stop ctrlchecks-worker 2>/dev/null || true
echo "✅ Systemd service stopped"
echo ""

# Step 5: Wait a moment
echo "📋 Step 5: Waiting for processes to fully terminate..."
sleep 3
echo ""

# Step 6: Force kill if still in use
echo "📋 Step 6: Force killing any remaining processes on port 3001..."
sudo fuser -k 3001/tcp 2>/dev/null || true
sleep 2
echo "✅ Port cleanup complete"
echo ""

# Step 7: Verify port is free
echo "📋 Step 7: Verifying port 3001 is free..."
REMAINING=$(sudo lsof -i :3001 2>/dev/null || echo "")
if [ -z "$REMAINING" ]; then
    echo "✅ Port 3001 is now free!"
else
    echo "⚠️  Port still in use:"
    echo "$REMAINING"
    echo "❌ Please manually kill these processes"
    exit 1
fi
echo ""

# Step 8: Navigate to worker directory
echo "📋 Step 8: Navigating to worker directory..."
cd /home/ubuntu/worker || cd /opt/ctrlchecks-worker/worker || {
    echo "❌ Could not find worker directory"
    echo "Please run this script from the worker directory or update the path"
    exit 1
}
echo "✅ In worker directory: $(pwd)"
echo ""

# Step 9: Update PM2 config to use single instance
echo "📋 Step 9: Checking PM2 configuration..."
if [ -f "ecosystem.config.js" ]; then
    echo "⚠️  Found ecosystem.config.js with instances: 2"
    echo "💡 Recommendation: Change to instances: 1 to avoid port conflicts"
    echo "   Edit ecosystem.config.js and change 'instances: 2' to 'instances: 1'"
fi
echo ""

# Step 10: Start PM2 service
echo "📋 Step 10: Starting PM2 service..."
echo ""

# Check if ecosystem.config.js exists
if [ -f "ecosystem.config.js" ]; then
    pm2 start ecosystem.config.js
else
    echo "⚠️  No ecosystem.config.js found, starting manually..."
    pm2 start "npm" --name "ctrlchecks-worker" -- run start
fi

echo ""
echo "📋 Step 11: Checking PM2 status..."
pm2 status
echo ""

echo "📋 Step 12: Viewing recent logs..."
echo "----------------------------------------"
pm2 logs ctrlchecks-worker --lines 30 --nostream
echo "----------------------------------------"
echo ""

# Step 13: Check for success
echo "📋 Step 13: Verifying service started successfully..."
sleep 2

# Check logs for success message
if pm2 logs ctrlchecks-worker --lines 50 --nostream | grep -q "Server running on port 3001"; then
    echo "✅ Service started successfully!"
    echo "✅ Server is running on port 3001"
elif pm2 logs ctrlchecks-worker --lines 50 --nostream | grep -q "Port 3001 is already in use"; then
    echo "❌ Port conflict still exists!"
    echo "❌ Please check logs: pm2 logs ctrlchecks-worker"
    exit 1
else
    echo "⚠️  Could not verify service status"
    echo "📋 Check logs: pm2 logs ctrlchecks-worker"
fi

echo ""
echo "🔍 =========================================="
echo "✅ Fix Complete!"
echo "🔍 =========================================="
echo ""
echo "📋 Next Steps:"
echo "1. Monitor logs: pm2 logs ctrlchecks-worker -f"
echo "2. Check health: curl https://worker.ctrlchecks.ai/health"
echo "3. If still issues, check: pm2 status"
echo ""
