#!/bin/bash
# Phase 2 Rollback Script
# Quickly rolls back to previous version while preserving logs and metrics

set -e

echo "=========================================="
echo "Phase 2 Rollback Script"
echo "=========================================="
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Configuration
STAGING_DIR="${STAGING_DIR:-/opt/ctrlchecks-worker-staging}"
BACKUP_DIR="${BACKUP_DIR:-/opt/ctrlchecks-worker-backup}"
ROLLBACK_LOG="${ROLLBACK_LOG:-/var/log/phase2-rollback.log}"

# Create log directory
mkdir -p "$(dirname "$ROLLBACK_LOG")"

# Log function
log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1" | tee -a "$ROLLBACK_LOG"
}

# Error handler
error_exit() {
    log "ERROR: $1"
    echo "=========================================="
    echo "Rollback FAILED"
    echo "=========================================="
    echo "Check logs: $ROLLBACK_LOG"
    exit 1
}

# Find latest backup
log "Finding latest backup..."
if [ ! -d "$BACKUP_DIR" ]; then
    error_exit "Backup directory not found: $BACKUP_DIR"
fi

LATEST_BACKUP=$(ls -td "$BACKUP_DIR"/backup-* 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
    error_exit "No backup found in $BACKUP_DIR"
fi

log "Latest backup: $LATEST_BACKUP"

# Confirm rollback
echo ""
echo "⚠️  WARNING: This will rollback to the previous version!"
echo "   Current: $STAGING_DIR"
echo "   Rollback to: $LATEST_BACKUP"
echo ""
read -p "Continue with rollback? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    log "Rollback cancelled by user"
    exit 0
fi

# Step 1: Create pre-rollback backup (in case we need to restore this version)
log "Step 1: Creating pre-rollback backup..."
PRE_ROLLBACK_BACKUP="$BACKUP_DIR/pre-rollback-$(date -u +"%Y%m%dT%H%M%SZ")"
mkdir -p "$PRE_ROLLBACK_BACKUP"
if [ -d "$STAGING_DIR" ]; then
    cp -r "$STAGING_DIR"/* "$PRE_ROLLBACK_BACKUP/" 2>/dev/null || true
    log "✅ Pre-rollback backup created: $PRE_ROLLBACK_BACKUP"
else
    log "⚠️  No current staging directory to backup"
fi

# Step 2: Stop service
log "Step 2: Stopping staging service..."
if systemctl list-units --type=service | grep -q "ctrlchecks-worker-staging"; then
    sudo systemctl stop ctrlchecks-worker-staging || log "⚠️  Service stop failed (may not be running)"
    sleep 2
    log "✅ Service stopped"
else
    log "⚠️  No systemd service found. Manual stop required."
fi

# Step 3: Restore from backup
log "Step 3: Restoring from backup..."
if [ ! -d "$LATEST_BACKUP" ]; then
    error_exit "Backup directory not found: $LATEST_BACKUP"
fi

# Remove current staging (keep logs)
if [ -d "$STAGING_DIR" ]; then
    log "Removing current staging files (preserving logs)..."
    find "$STAGING_DIR" -type f ! -path "*/logs/*" ! -name "*.log" -delete 2>/dev/null || true
    find "$STAGING_DIR" -type d -empty -delete 2>/dev/null || true
fi

# Restore from backup
log "Copying files from backup..."
cp -r "$LATEST_BACKUP"/* "$STAGING_DIR/" 2>/dev/null || error_exit "Failed to restore from backup"

log "✅ Files restored from backup"

# Step 4: Reinstall dependencies (if package.json changed)
log "Step 4: Reinstalling dependencies..."
cd "$STAGING_DIR" || error_exit "Failed to change to staging directory"
if [ -f "package.json" ]; then
    npm ci --only=production || log "⚠️  Dependency installation had issues (continuing anyway)"
    log "✅ Dependencies reinstalled"
else
    log "⚠️  package.json not found in backup"
fi

# Step 5: Restart service
log "Step 5: Restarting service..."
if systemctl list-units --type=service | grep -q "ctrlchecks-worker-staging"; then
    sudo systemctl start ctrlchecks-worker-staging || error_exit "Failed to start service"
    
    # Wait for service to start
    sleep 5
    
    # Check service status
    if sudo systemctl is-active --quiet ctrlchecks-worker-staging; then
        log "✅ Service is running"
    else
        error_exit "Service failed to start. Check logs: sudo journalctl -u ctrlchecks-worker-staging -n 50"
    fi
else
    log "⚠️  No systemd service found. Manual start required:"
    log "   cd $STAGING_DIR && NODE_ENV=staging node dist/index.js"
fi

# Step 6: Verify rollback
log "Step 6: Verifying rollback..."

# Wait for service to be ready
sleep 3

# Health check
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://localhost:3001/health}"
log "Checking health endpoint..."
if curl -f "$HEALTH_CHECK_URL" > /dev/null 2>&1; then
    log "✅ Health check passed"
else
    log "⚠️  Health check failed. Service may still be starting."
    log "   Check manually: curl $HEALTH_CHECK_URL"
fi

# Check deployment manifest (if exists)
if [ -f "$STAGING_DIR/deploy/phase2-manifest.json" ]; then
    log "⚠️  WARNING: Phase 2 manifest still present. This may indicate incomplete rollback."
else
    log "✅ Phase 2 manifest removed (rollback complete)"
fi

# Generate rollback summary
log "Step 7: Generating rollback summary..."

cat > "$STAGING_DIR/deploy/rollback-summary.txt" << EOF
==========================================
Phase 2 Rollback Summary
==========================================
Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Status: ✅ COMPLETE

Rollback Details:
- Rolled back from: Current staging
- Rolled back to: $LATEST_BACKUP
- Pre-rollback backup: $PRE_ROLLBACK_BACKUP

Service Status:
- Service: $(systemctl is-active ctrlchecks-worker-staging 2>/dev/null || echo "unknown")
- Health Check: $HEALTH_CHECK_URL

Next Steps:
1. Monitor service for stability
2. Review logs for any issues
3. If issues persist, check pre-rollback backup: $PRE_ROLLBACK_BACKUP

To restore Phase 2:
  ./deploy/deploy-phase2-staging.sh
==========================================
EOF

cat "$STAGING_DIR/deploy/rollback-summary.txt"

echo ""
echo "=========================================="
echo "✅ Rollback Complete!"
echo "=========================================="
echo "Service should be running with previous version"
echo "Rollback Log: $ROLLBACK_LOG"
echo "Summary: $STAGING_DIR/deploy/rollback-summary.txt"
echo ""
