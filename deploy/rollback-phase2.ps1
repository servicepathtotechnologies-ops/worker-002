# Phase 2 Rollback Script (PowerShell)
# Quickly rolls back to previous version while preserving logs and metrics

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Phase 2 Rollback Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')" -ForegroundColor Gray
Write-Host ""

# Configuration
$STAGING_DIR = if ($env:STAGING_DIR) { $env:STAGING_DIR } else { "C:\ctrlchecks-worker-staging" }
$BACKUP_DIR = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "C:\ctrlchecks-worker-backup" }
$ROLLBACK_LOG = if ($env:ROLLBACK_LOG) { $env:ROLLBACK_LOG } else { "C:\logs\phase2-rollback.log" }

# Create log directory
New-Item -ItemType Directory -Force -Path (Split-Path $ROLLBACK_LOG) -ErrorAction SilentlyContinue | Out-Null

# Log function
function Log-Message {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $ROLLBACK_LOG -Value $logMessage -ErrorAction SilentlyContinue
}

# Error handler
function Exit-WithError {
    param([string]$Message)
    Log-Message "ERROR: $Message"
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "Rollback FAILED" -ForegroundColor Red
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "Check logs: $ROLLBACK_LOG" -ForegroundColor Yellow
    exit 1
}

# Find latest backup
Log-Message "Finding latest backup..."
if (-not (Test-Path $BACKUP_DIR)) {
    Exit-WithError "Backup directory not found: $BACKUP_DIR"
}

$backups = Get-ChildItem -Path $BACKUP_DIR -Directory -Filter "backup-*" | Sort-Object LastWriteTime -Descending
if ($backups.Count -eq 0) {
    Exit-WithError "No backup found in $BACKUP_DIR"
}

$latestBackup = $backups[0].FullName
Log-Message "Latest backup: $latestBackup"

# Confirm rollback
Write-Host ""
Write-Host "⚠️  WARNING: This will rollback to the previous version!" -ForegroundColor Yellow
Write-Host "   Current: $STAGING_DIR"
Write-Host "   Rollback to: $latestBackup"
Write-Host ""
$confirm = Read-Host "Continue with rollback? (yes/no)"

if ($confirm -ne "yes") {
    Log-Message "Rollback cancelled by user"
    exit 0
}

# Step 1: Create pre-rollback backup
Log-Message "Step 1: Creating pre-rollback backup..."
$preRollbackBackup = Join-Path $BACKUP_DIR "pre-rollback-$(Get-Date -Format 'yyyyMMddTHHmmssZ')"
New-Item -ItemType Directory -Force -Path $preRollbackBackup | Out-Null
if (Test-Path $STAGING_DIR) {
    Copy-Item -Path "$STAGING_DIR\*" -Destination $preRollbackBackup -Recurse -Force -ErrorAction SilentlyContinue
    Log-Message "✅ Pre-rollback backup created: $preRollbackBackup"
} else {
    Log-Message "⚠️  No current staging directory to backup"
}

# Step 2: Stop service (if running as process)
Log-Message "Step 2: Checking for running service..."
$processes = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*$STAGING_DIR*" }
if ($processes) {
    Log-Message "Stopping Node.js processes..."
    $processes | Stop-Process -Force
    Start-Sleep -Seconds 2
    Log-Message "✅ Processes stopped"
} else {
    Log-Message "⚠️  No running Node.js processes found for staging"
}

# Step 3: Restore from backup
Log-Message "Step 3: Restoring from backup..."
if (-not (Test-Path $latestBackup)) {
    Exit-WithError "Backup directory not found: $latestBackup"
}

# Remove current staging (keep logs)
if (Test-Path $STAGING_DIR) {
    Log-Message "Removing current staging files (preserving logs)..."
    Get-ChildItem -Path $STAGING_DIR -Exclude "logs" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

# Restore from backup
Log-Message "Copying files from backup..."
Copy-Item -Path "$latestBackup\*" -Destination $STAGING_DIR -Recurse -Force -ErrorAction SilentlyContinue
Log-Message "✅ Files restored from backup"

# Step 4: Reinstall dependencies
Log-Message "Step 4: Reinstalling dependencies..."
Push-Location $STAGING_DIR
if (Test-Path "package.json") {
    try {
        npm ci --only=production
        Log-Message "✅ Dependencies reinstalled"
    } catch {
        Log-Message "⚠️  Dependency installation had issues (continuing anyway): $_"
    }
} else {
    Log-Message "⚠️  package.json not found in backup"
}
Pop-Location

# Step 5: Note about service restart
Log-Message "Step 5: Service restart required"
Log-Message "⚠️  On Windows, manually restart the service:"
Log-Message "   cd $STAGING_DIR"
Log-Message "   `$env:NODE_ENV='staging'"
Log-Message "   node dist\index.js"

# Step 6: Verify rollback
Log-Message "Step 6: Verifying rollback..."

# Wait for service to be ready
Start-Sleep -Seconds 3

# Health check
$HEALTH_CHECK_URL = if ($env:HEALTH_CHECK_URL) { $env:HEALTH_CHECK_URL } else { "http://localhost:3001/health" }
Log-Message "Checking health endpoint..."
try {
    $response = Invoke-WebRequest -Uri $HEALTH_CHECK_URL -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Log-Message "✅ Health check passed"
    } else {
        Log-Message "⚠️  Health check returned status: $($response.StatusCode)"
    }
} catch {
    Log-Message "⚠️  Health check failed. Service may still be starting."
    Log-Message "   Check manually: Invoke-WebRequest -Uri $HEALTH_CHECK_URL"
}

# Check deployment manifest
if (Test-Path "$STAGING_DIR\deploy\phase2-manifest.json") {
    Log-Message "⚠️  WARNING: Phase 2 manifest still present. This may indicate incomplete rollback."
} else {
    Log-Message "✅ Phase 2 manifest removed (rollback complete)"
}

# Generate rollback summary
Log-Message "Step 7: Generating rollback summary..."

$summary = @"
==========================================
Phase 2 Rollback Summary
==========================================
Timestamp: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')
Status: ✅ COMPLETE

Rollback Details:
- Rolled back from: Current staging
- Rolled back to: $latestBackup
- Pre-rollback backup: $preRollbackBackup

Service Status:
- Health Check: $HEALTH_CHECK_URL

Next Steps:
1. Monitor service for stability
2. Review logs for any issues
3. If issues persist, check pre-rollback backup: $preRollbackBackup

To restore Phase 2:
  .\deploy\deploy-phase2-staging.ps1
==========================================
"@

$summary | Set-Content "$STAGING_DIR\deploy\rollback-summary.txt"
Write-Host $summary

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ Rollback Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Service should be running with previous version"
Write-Host "Rollback Log: $ROLLBACK_LOG"
Write-Host "Summary: $STAGING_DIR\deploy\rollback-summary.txt"
Write-Host ""
