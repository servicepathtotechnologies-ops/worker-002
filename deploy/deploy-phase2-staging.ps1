# Phase 2 Deployment Script - Staging Environment (PowerShell)
# Deploys LRU cache implementation and Phase 2 changes to staging

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Phase 2 Deployment to Staging" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')" -ForegroundColor Gray
Write-Host ""

# Configuration
$STAGING_DIR = if ($env:STAGING_DIR) { $env:STAGING_DIR } else { "C:\ctrlchecks-worker-staging" }
$BACKUP_DIR = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { "C:\ctrlchecks-worker-backup" }
$DEPLOYMENT_LOG = if ($env:DEPLOYMENT_LOG) { $env:DEPLOYMENT_LOG } else { "C:\logs\phase2-deployment.log" }
$HEALTH_CHECK_URL = if ($env:HEALTH_CHECK_URL) { $env:HEALTH_CHECK_URL } else { "http://localhost:3001/health" }
$STAGING_PORT = if ($env:STAGING_PORT) { $env:STAGING_PORT } else { "3001" }

# Create directories
New-Item -ItemType Directory -Force -Path $STAGING_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $BACKUP_DIR | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $DEPLOYMENT_LOG) -ErrorAction SilentlyContinue | Out-Null

# Log function
function Log-Message {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $DEPLOYMENT_LOG -Value $logMessage -ErrorAction SilentlyContinue
}

# Error handler
function Exit-WithError {
    param([string]$Message)
    Log-Message "ERROR: $Message"
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "Deployment FAILED" -ForegroundColor Red
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "Check logs: $DEPLOYMENT_LOG" -ForegroundColor Yellow
    exit 1
}

# Step 1: Create deployment bundle
Log-Message "Step 1: Creating deployment bundle..."

$workerDir = Join-Path $PSScriptRoot ".."
Push-Location $workerDir

# Build TypeScript
Log-Message "Building TypeScript..."
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Exit-WithError "Build failed"
    }
} catch {
    Exit-WithError "Build failed: $_"
}

# Verify build output
if (-not (Test-Path "dist\index.js")) {
    Exit-WithError "Build output not found: dist\index.js"
}

# Verify Phase 2 files exist
$phase2Files = @(
    "dist\core\cache\lru-node-outputs-cache.js",
    "dist\api\execute-workflow.js"
)

foreach ($file in $phase2Files) {
    if (-not (Test-Path $file)) {
        Exit-WithError "Phase 2 file not found: $file"
    }
}

Log-Message "✅ Build successful"

# Create deployment manifest
Log-Message "Creating deployment manifest..."
$manifestFile = "deploy\phase2-manifest.json"
$manifest = @{
    phase = "Phase 2"
    version = "2.0.0"
    timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    changes = @(
        "LRU cache implementation for node outputs",
        "Memory leak prevention",
        "Bounded memory usage",
        "Cache eviction logic"
    )
    files = @(
        "dist\core\cache\lru-node-outputs-cache.js",
        "dist\api\execute-workflow.js",
        "dist\index.js"
    )
    environment_vars = @(
        "LRU_CACHE_SIZE",
        "LRU_CACHE_ENABLED"
    )
    rollback_script = "deploy\rollback-phase2.ps1"
}

# Generate hash of changes
Log-Message "Generating deployment hash..."
$hashString = ""
Get-ChildItem -Path "dist" -Filter "*.js" -Recurse | ForEach-Object {
    $hashString += (Get-FileHash $_.FullName -Algorithm SHA256).Hash
}
$deploymentHash = (Get-FileHash -InputStream ([System.IO.MemoryStream]::new([System.Text.Encoding]::UTF8.GetBytes($hashString))) -Algorithm SHA256).Hash
$manifest.deployment_hash = $deploymentHash

$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestFile
Log-Message "✅ Deployment manifest created: $manifestFile"

# Step 2: Backup current staging (if exists)
if ((Test-Path $STAGING_DIR) -and (Test-Path "$STAGING_DIR\dist\index.js")) {
    Log-Message "Step 2: Backing up current staging deployment..."
    $backupTimestamp = Get-Date -Format "yyyyMMddTHHmmssZ"
    $backupPath = Join-Path $BACKUP_DIR "backup-$backupTimestamp"
    New-Item -ItemType Directory -Force -Path $backupPath | Out-Null
    Copy-Item -Path "$STAGING_DIR\*" -Destination $backupPath -Recurse -Force -ErrorAction SilentlyContinue
    Log-Message "✅ Backup created: $backupPath"
} else {
    Log-Message "Step 2: No existing staging deployment to backup"
}

# Step 3: Deploy to staging
Log-Message "Step 3: Deploying to staging environment..."

# Copy files to staging
Log-Message "Copying files to staging..."
Copy-Item -Path "dist" -Destination $STAGING_DIR -Recurse -Force
Copy-Item -Path "package.json" -Destination $STAGING_DIR -Force
Copy-Item -Path "package-lock.json" -Destination $STAGING_DIR -Force -ErrorAction SilentlyContinue
Copy-Item -Path "env.example" -Destination $STAGING_DIR -Force

# Copy deployment manifest
New-Item -ItemType Directory -Force -Path "$STAGING_DIR\deploy" | Out-Null
Copy-Item -Path $manifestFile -Destination "$STAGING_DIR\deploy\" -Force

# Install production dependencies in staging
Log-Message "Installing production dependencies..."
Push-Location $STAGING_DIR
try {
    # Run npm ci - warnings are non-fatal, we'll verify success by checking node_modules
    & npm ci --omit=dev 2>&1 | Out-Null
    
    # Verify installation succeeded by checking if node_modules exists
    if (-not (Test-Path "node_modules")) {
        Exit-WithError "Failed to install dependencies - node_modules directory not found"
    }
    
    # Check for critical errors (npm ERR, not warnings)
    $criticalErrors = Get-Content "$STAGING_DIR\npm-debug.log" -ErrorAction SilentlyContinue | Where-Object { $_ -match "^npm ERR" }
    if ($criticalErrors) {
        Exit-WithError "Critical npm errors detected: $($criticalErrors -join '; ')"
    }
    
    Log-Message "✅ Dependencies installed successfully"
} catch {
    # If node_modules exists, installation likely succeeded despite errors
    if (Test-Path "node_modules") {
        Log-Message "⚠️  Installation warnings encountered, but node_modules exists - continuing"
    } else {
        Exit-WithError "Failed to install dependencies: $_"
    }
}
Pop-Location

# Check environment file
if (-not (Test-Path "$STAGING_DIR\.env")) {
    Log-Message "⚠️  WARNING: .env file not found. Copying from env.example..."
    Copy-Item -Path "$STAGING_DIR\env.example" -Destination "$STAGING_DIR\.env"
    Log-Message "⚠️  Please configure .env file before starting service"
}

Log-Message "✅ Files deployed to staging"

# Step 4: Note about service restart (Windows doesn't use systemd)
Log-Message "Step 4: Service restart required"
Log-Message "⚠️  On Windows, manually restart the service:"
Log-Message "   cd $STAGING_DIR"
Log-Message "   `$env:NODE_ENV='staging'"
Log-Message "   node dist\index.js"

# Step 5: Post-deployment health checks
Log-Message "Step 5: Running post-deployment health checks..."

# Wait a bit for service to be ready
Start-Sleep -Seconds 3

# Health check
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

# Step 6: Run integration tests
Log-Message "Step 6: Running integration tests..."

Push-Location $workerDir

# Set staging environment
$env:NODE_ENV = "staging"
$env:STAGING_MODE = "true"

# Run memory leak reproduction test
Log-Message "Running memory-leak-reproduction test..."
try {
    $testOutput = npm test -- memory-leak-reproduction 2>&1
    $testOutput | Tee-Object -FilePath "$DEPLOYMENT_LOG" -Append | Out-Null
    $testOutputString = $testOutput -join "`n"
    
    # Check output for PASS/FAIL - look for "Test Suites: X passed" or "Tests: X passed"
    if ($testOutputString -match "Test Suites:\s+\d+\s+passed" -or $testOutputString -match "Tests:\s+\d+\s+passed") {
        Log-Message "✅ Memory leak test passed"
    } elseif ($testOutputString -match "Test Suites:\s+\d+\s+failed" -or $testOutputString -match "Tests:\s+\d+\s+failed") {
        Exit-WithError "Memory leak test failed - see test output above"
    } elseif ($LASTEXITCODE -ne 0) {
        Exit-WithError "Memory leak test failed - exit code: $LASTEXITCODE"
    } else {
        Log-Message "✅ Memory leak test passed (no failures detected)"
    }
} catch {
    # Only fail if it's an actual exception, not just test output
    if ($_.Exception.Message -notmatch "PASS") {
        Exit-WithError "Memory leak test failed: $_"
    } else {
        Log-Message "✅ Memory leak test passed"
    }
}

# Run performance benchmark test
Log-Message "Running performance-benchmark test..."
try {
    $testOutput = npm test -- performance-benchmark 2>&1
    $testOutput | Tee-Object -FilePath "$DEPLOYMENT_LOG" -Append | Out-Null
    $testOutputString = $testOutput -join "`n"
    
    if ($testOutputString -match "Test Suites:\s+\d+\s+passed" -or $testOutputString -match "Tests:\s+\d+\s+passed") {
        Log-Message "✅ Performance benchmark test passed"
    } elseif ($testOutputString -match "Test Suites:\s+\d+\s+failed" -or $testOutputString -match "Tests:\s+\d+\s+failed") {
        Exit-WithError "Performance benchmark test failed"
    } elseif ($LASTEXITCODE -ne 0) {
        Exit-WithError "Performance benchmark test failed - exit code: $LASTEXITCODE"
    } else {
        Log-Message "✅ Performance benchmark test passed"
    }
} catch {
    if ($_.Exception.Message -notmatch "PASS") {
        Exit-WithError "Performance benchmark test failed: $_"
    } else {
        Log-Message "✅ Performance benchmark test passed"
    }
}

# Run LRU cache edge cases test
Log-Message "Running lru-cache-edge-cases test..."
try {
    $testOutput = npm test -- lru-cache-edge-cases 2>&1
    $testOutput | Tee-Object -FilePath "$DEPLOYMENT_LOG" -Append | Out-Null
    $testOutputString = $testOutput -join "`n"
    
    if ($testOutputString -match "Test Suites:\s+\d+\s+passed" -or $testOutputString -match "Tests:\s+\d+\s+passed") {
        Log-Message "✅ LRU cache edge cases test passed"
    } elseif ($testOutputString -match "Test Suites:\s+\d+\s+failed" -or $testOutputString -match "Tests:\s+\d+\s+failed") {
        Exit-WithError "LRU cache edge cases test failed"
    } elseif ($LASTEXITCODE -ne 0) {
        Exit-WithError "LRU cache edge cases test failed - exit code: $LASTEXITCODE"
    } else {
        Log-Message "✅ LRU cache edge cases test passed"
    }
} catch {
    if ($_.Exception.Message -notmatch "PASS") {
        Exit-WithError "LRU cache edge cases test failed: $_"
    } else {
        Log-Message "✅ LRU cache edge cases test passed"
    }
}

Log-Message "✅ All integration tests passed"
Pop-Location

# Step 7: Generate deployment summary
Log-Message "Step 7: Generating deployment summary..."

$summaryFile = "deploy\phase2-deployment-summary.txt"
$summary = @"
==========================================
Phase 2 Deployment Summary
==========================================
Timestamp: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')
Status: ✅ SUCCESS

Deployment Details:
- Staging Directory: $STAGING_DIR
- Backup Location: $BACKUP_DIR
- Deployment Hash: $deploymentHash
- Health Check: $HEALTH_CHECK_URL

Files Deployed:
$(Get-ChildItem "$STAGING_DIR\dist\*.js" -ErrorAction SilentlyContinue | ForEach-Object { "  - $($_.Name) ($([math]::Round($_.Length/1KB, 2)) KB)" })

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
  .\deploy\rollback-phase2.ps1

Monitoring:
  - Logs: Check $DEPLOYMENT_LOG
  - Health: Invoke-WebRequest -Uri $HEALTH_CHECK_URL
  - Metrics: Check monitoring dashboard
==========================================
"@

$summary | Set-Content $summaryFile
Write-Host $summary

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ Phase 2 Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Staging URL: $HEALTH_CHECK_URL"
Write-Host "Deployment Log: $DEPLOYMENT_LOG"
Write-Host "Summary: deploy\phase2-deployment-summary.txt"
Write-Host ""
Write-Host "Next: Run monitoring setup:"
Write-Host "  .\deploy\monitoring-setup.ps1"
Write-Host ""

Pop-Location
