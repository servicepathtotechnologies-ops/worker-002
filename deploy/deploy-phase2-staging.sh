#!/bin/bash
# Phase 2 Deployment Script - Staging Environment
# Deploys LRU cache implementation and Phase 2 changes to staging

set -e

echo "=========================================="
echo "Phase 2 Deployment to Staging"
echo "=========================================="
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Configuration
STAGING_DIR="${STAGING_DIR:-/opt/ctrlchecks-worker-staging}"
BACKUP_DIR="${BACKUP_DIR:-/opt/ctrlchecks-worker-backup}"
DEPLOYMENT_LOG="${DEPLOYMENT_LOG:-/var/log/phase2-deployment.log}"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://localhost:3001/health}"
STAGING_PORT="${STAGING_PORT:-3001}"

# Create directories
mkdir -p "$STAGING_DIR"
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$DEPLOYMENT_LOG")"

# Log function
log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1" | tee -a "$DEPLOYMENT_LOG"
}

# Error handler
error_exit() {
    log "ERROR: $1"
    echo "=========================================="
    echo "Deployment FAILED"
    echo "=========================================="
    echo "Check logs: $DEPLOYMENT_LOG"
    exit 1
}

# Step 1: Create deployment bundle
log "Step 1: Creating deployment bundle..."

cd "$(dirname "$0")/.." || error_exit "Failed to change to worker directory"

# Build TypeScript
log "Building TypeScript..."
npm run build || error_exit "Build failed"

# Verify build output
if [ ! -f "dist/index.js" ]; then
    error_exit "Build output not found: dist/index.js"
fi

# Verify Phase 2 files exist
PHASE2_FILES=(
    "dist/core/cache/lru-node-outputs-cache.js"
    "dist/api/execute-workflow.js"
)

for file in "${PHASE2_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        error_exit "Phase 2 file not found: $file"
    fi
done

log "✅ Build successful"

# Create deployment manifest
log "Creating deployment manifest..."
MANIFEST_FILE="deploy/phase2-manifest.json"
cat > "$MANIFEST_FILE" << EOF
{
  "phase": "Phase 2",
  "version": "2.0.0",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "changes": [
    "LRU cache implementation for node outputs",
    "Memory leak prevention",
    "Bounded memory usage",
    "Cache eviction logic"
  ],
  "files": [
    "dist/core/cache/lru-node-outputs-cache.js",
    "dist/api/execute-workflow.js",
    "dist/index.js"
  ],
  "environment_vars": [
    "LRU_CACHE_SIZE",
    "LRU_CACHE_ENABLED"
  ],
  "rollback_script": "deploy/rollback-phase2.sh"
}
EOF

# Generate hash of changes
log "Generating deployment hash..."
DEPLOYMENT_HASH=$(find dist -type f -name "*.js" -exec sha256sum {} \; | sha256sum | cut -d' ' -f1)
echo "  \"deployment_hash\": \"$DEPLOYMENT_HASH\"" >> "$MANIFEST_FILE"
echo "}" >> "$MANIFEST_FILE"

log "✅ Deployment manifest created: $MANIFEST_FILE"

# Step 2: Backup current staging (if exists)
if [ -d "$STAGING_DIR" ] && [ -f "$STAGING_DIR/dist/index.js" ]; then
    log "Step 2: Backing up current staging deployment..."
    BACKUP_TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
    BACKUP_PATH="$BACKUP_DIR/backup-$BACKUP_TIMESTAMP"
    mkdir -p "$BACKUP_PATH"
    cp -r "$STAGING_DIR"/* "$BACKUP_PATH/" 2>/dev/null || true
    log "✅ Backup created: $BACKUP_PATH"
else
    log "Step 2: No existing staging deployment to backup"
fi

# Step 3: Deploy to staging
log "Step 3: Deploying to staging environment..."

# Copy files to staging
log "Copying files to staging..."
rsync -av --exclude='node_modules' --exclude='.git' \
    dist/ \
    package.json \
    package-lock.json \
    env.example \
    "$STAGING_DIR/" || error_exit "Failed to copy files to staging"

# Copy deployment manifest
cp "$MANIFEST_FILE" "$STAGING_DIR/deploy/"

# Install production dependencies in staging
log "Installing production dependencies..."
cd "$STAGING_DIR" || error_exit "Failed to change to staging directory"
npm ci --only=production || error_exit "Failed to install dependencies"

# Check environment file
if [ ! -f "$STAGING_DIR/.env" ]; then
    log "⚠️  WARNING: .env file not found. Copying from env.example..."
    cp "$STAGING_DIR/env.example" "$STAGING_DIR/.env"
    log "⚠️  Please configure .env file before starting service"
fi

log "✅ Files deployed to staging"

# Step 4: Restart staging service (if systemd service exists)
if systemctl list-units --type=service | grep -q "ctrlchecks-worker-staging"; then
    log "Step 4: Restarting staging service..."
    sudo systemctl restart ctrlchecks-worker-staging || error_exit "Failed to restart service"
    
    # Wait for service to start
    sleep 5
    
    # Check service status
    if sudo systemctl is-active --quiet ctrlchecks-worker-staging; then
        log "✅ Service is running"
    else
        error_exit "Service failed to start. Check logs: sudo journalctl -u ctrlchecks-worker-staging -n 50"
    fi
else
    log "Step 4: No systemd service found. Manual start required:"
    log "   cd $STAGING_DIR && NODE_ENV=staging node dist/index.js"
fi

# Step 5: Post-deployment health checks
log "Step 5: Running post-deployment health checks..."

# Wait a bit for service to be ready
sleep 3

# Health check
log "Checking health endpoint..."
if curl -f "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
    log "✅ Health check passed"
else
    log "⚠️  Health check failed. Service may still be starting."
    log "   Check manually: curl $HEALTH_CHECK_URL"
fi

# Step 6: Run integration tests
log "Step 6: Running integration tests..."

cd "$(dirname "$0")/.." || error_exit "Failed to change to worker directory"

# Set staging environment
export NODE_ENV=staging
export STAGING_MODE=true

# Run memory leak reproduction test
log "Running memory-leak-reproduction test..."
if npm test -- memory-leak-reproduction 2>&1 | tee -a "$DEPLOYMENT_LOG"; then
    log "✅ Memory leak test passed"
else
    error_exit "Memory leak test failed"
fi

# Run performance benchmark test
log "Running performance-benchmark test..."
if npm test -- performance-benchmark 2>&1 | tee -a "$DEPLOYMENT_LOG"; then
    log "✅ Performance benchmark test passed"
else
    error_exit "Performance benchmark test failed"
fi

# Run LRU cache edge cases test
log "Running lru-cache-edge-cases test..."
if npm test -- lru-cache-edge-cases 2>&1 | tee -a "$DEPLOYMENT_LOG"; then
    log "✅ LRU cache edge cases test passed"
else
    error_exit "LRU cache edge cases test failed"
fi

log "✅ All integration tests passed"

# Step 7: Generate deployment summary
log "Step 7: Generating deployment summary..."

cat > "deploy/phase2-deployment-summary.txt" << EOF
==========================================
Phase 2 Deployment Summary
==========================================
Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Status: ✅ SUCCESS

Deployment Details:
- Staging Directory: $STAGING_DIR
- Backup Location: $BACKUP_DIR
- Deployment Hash: $DEPLOYMENT_HASH
- Health Check: $HEALTH_CHECK_URL

Files Deployed:
$(ls -lh "$STAGING_DIR/dist"/*.js 2>/dev/null | awk '{print "  - " $9 " (" $5 ")"}')

Test Results:
- Memory Leak Test: ✅ PASSED
- Performance Benchmark: ✅ PASSED
- LRU Cache Edge Cases: ✅ PASSED

Next Steps:
1. Monitor staging environment for 24 hours
2. Check metrics: Cache hit rate, memory usage
3. Review logs for any issues
4. If stable, proceed to production canary deployment

Rollback Command:
  ./deploy/rollback-phase2.sh

Monitoring:
  - Logs: sudo journalctl -u ctrlchecks-worker-staging -f
  - Health: curl $HEALTH_CHECK_URL
  - Metrics: Check monitoring dashboard
==========================================
EOF

cat "deploy/phase2-deployment-summary.txt"

echo ""
echo "=========================================="
echo "✅ Phase 2 Deployment Complete!"
echo "=========================================="
echo "Staging URL: $HEALTH_CHECK_URL"
echo "Deployment Log: $DEPLOYMENT_LOG"
echo "Summary: deploy/phase2-deployment-summary.txt"
echo ""
echo "Next: Run monitoring setup:"
echo "  ./deploy/monitoring-setup.sh"
echo ""
