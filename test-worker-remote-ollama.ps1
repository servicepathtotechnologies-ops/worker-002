# ============================================
# Test Worker with Remote AWS Ollama
# Run this script from the worker directory
# ============================================

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Test Worker with Remote AWS Ollama" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Since we're in worker directory, paths are relative
$envPath = ".env"

# Check if .env exists, otherwise use 'env'
if (-not (Test-Path $envPath)) {
    $envPath = "env"
}

if (-not (Test-Path $envPath)) {
    Write-Host "[ERROR] Environment file not found at: $envPath" -ForegroundColor Red
    Write-Host "   Please make sure you're in the worker directory" -ForegroundColor Yellow
    exit 1
}

# ============================================
# Step 1: Configure for Remote Ollama
# ============================================
Write-Host "[STEP 1] Configuring Worker for Remote AWS Ollama..." -ForegroundColor Yellow
Write-Host ""

# Get remote Ollama URL
$remoteOllamaUrl = "http://ollama.ctrlchecks.ai:8000"
$input = Read-Host "Enter AWS Ollama URL (default: $remoteOllamaUrl)"
if (-not [string]::IsNullOrWhiteSpace($input)) {
    $remoteOllamaUrl = $input
}

Write-Host "   Using Ollama URL: $remoteOllamaUrl" -ForegroundColor Cyan
Write-Host ""

# Read environment file
$envLines = Get-Content $envPath
$needsUpdate = $false
$newLines = @()

foreach ($line in $envLines) {
    if ($line -match "^OLLAMA_BASE_URL=") {
        $newLines += "OLLAMA_BASE_URL=$remoteOllamaUrl"
        $needsUpdate = $true
        Write-Host "   [OK] Updated OLLAMA_BASE_URL to $remoteOllamaUrl" -ForegroundColor Green
    } elseif ($line -match "^OLLAMA_BASE_URL=") {
        $newLines += "OLLAMA_BASE_URL=$remoteOllamaUrl"
        $needsUpdate = $true
        Write-Host "   [OK] Updated OLLAMA_BASE_URL to $remoteOllamaUrl" -ForegroundColor Green
    } elseif ($line -match "^FASTAPI_OLLAMA_URL=") {
        $newLines += "FASTAPI_OLLAMA_URL=$remoteOllamaUrl"
        $needsUpdate = $true
        Write-Host "   [OK] Updated FASTAPI_OLLAMA_URL to $remoteOllamaUrl" -ForegroundColor Green
    } else {
        $newLines += $line
    }
}

# Add missing entries if they don't exist
$hasOllamaBase = $newLines | Where-Object { $_ -match "^OLLAMA_BASE_URL=" }
$hasFastApi = $newLines | Where-Object { $_ -match "^FASTAPI_OLLAMA_URL=" }

if (-not $hasOllamaBase) {
    $newLines += "OLLAMA_BASE_URL=$remoteOllamaUrl"
    $needsUpdate = $true
    Write-Host "   [OK] Added OLLAMA_BASE_URL=$remoteOllamaUrl" -ForegroundColor Green
}
if (-not $hasOllamaBase) {
    $newLines += "OLLAMA_BASE_URL=$remoteOllamaUrl"
    $needsUpdate = $true
    Write-Host "   [OK] Added OLLAMA_BASE_URL=$remoteOllamaUrl" -ForegroundColor Green
}
if (-not $hasFastApi) {
    $newLines += "FASTAPI_OLLAMA_URL=$remoteOllamaUrl"
    $needsUpdate = $true
    Write-Host "   [OK] Added FASTAPI_OLLAMA_URL=$remoteOllamaUrl" -ForegroundColor Green
}

# Save if updated
if ($needsUpdate) {
    Set-Content -Path $envPath -Value ($newLines -join "`n")
    Write-Host ""
    Write-Host "   [OK] Environment file updated!" -ForegroundColor Green
}

Write-Host ""

# ============================================
# Step 2: Check Remote Ollama Connection
# ============================================
Write-Host "[STEP 2] Testing Remote Ollama Connection..." -ForegroundColor Yellow
Write-Host ""

try {
    Write-Host "   Testing connection to $remoteOllamaUrl..." -ForegroundColor Gray
    $healthCheck = Invoke-WebRequest -Uri "$remoteOllamaUrl/health" -Method GET -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    if ($healthCheck.StatusCode -eq 200) {
        Write-Host "   [OK] Remote Ollama is accessible!" -ForegroundColor Green
    }
} catch {
    Write-Host "   [WARNING] Could not reach remote Ollama: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "   Continuing anyway..." -ForegroundColor Gray
}

# Check available models
try {
    Write-Host "   Fetching available models..." -ForegroundColor Gray
    $modelsResponse = Invoke-RestMethod -Uri "$remoteOllamaUrl/api/tags" -Method GET -TimeoutSec 10 -ErrorAction Stop
    if ($modelsResponse.models) {
        Write-Host "   [OK] Found $($modelsResponse.models.Count) model(s):" -ForegroundColor Green
        foreach ($model in $modelsResponse.models) {
            Write-Host "      - $($model.name)" -ForegroundColor Cyan
        }
    }
} catch {
    Write-Host "   [WARNING] Could not fetch models: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# ============================================
# Step 3: Check Fine-Tuned Model Config
# ============================================
Write-Host "[STEP 3] Checking Fine-Tuned Model Configuration..." -ForegroundColor Yellow
Write-Host ""

$envContent = Get-Content $envPath -Raw
$envLinesForCheck = Get-Content $envPath

if ($envContent -match "USE_FINE_TUNED_MODEL=(true|false)") {
    $useFineTuned = $matches[1]
    if ($useFineTuned -eq "true") {
        Write-Host "   [OK] Fine-tuned model is ENABLED" -ForegroundColor Green
    } else {
        Write-Host "   [WARNING] Fine-tuned model is DISABLED" -ForegroundColor Yellow
    }
} else {
    Write-Host "   [WARNING] USE_FINE_TUNED_MODEL not set (defaults to false)" -ForegroundColor Yellow
}

$fineTunedLine = $envLinesForCheck | Where-Object { $_ -match "^FINE_TUNED_MODEL=" }
if ($fineTunedLine) {
    $modelName = ($fineTunedLine -split "=")[1].Trim()
    Write-Host "   Fine-tuned model name: $modelName" -ForegroundColor Cyan
} else {
    Write-Host "   Fine-tuned model name: (not set, defaults to 'ctrlchecks-workflow-builder')" -ForegroundColor Gray
}

Write-Host ""

# ============================================
# Step 4: Check if Worker is Running
# ============================================
Write-Host "[STEP 4] Checking Worker Service..." -ForegroundColor Yellow
Write-Host ""

$workerPort = 3001
try {
    $workerCheck = Invoke-WebRequest -Uri "http://localhost:$workerPort/health" -Method GET -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    Write-Host "   [OK] Worker is already running on port $workerPort" -ForegroundColor Green
    $workerRunning = $true
} catch {
    Write-Host "   [WARNING] Worker is not running on port $workerPort" -ForegroundColor Yellow
    $workerRunning = $false
}

Write-Host ""

# ============================================
# Step 5: Start Worker if Not Running
# ============================================
if (-not $workerRunning) {
    Write-Host "[STEP 5] Starting Worker Service..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Starting Worker on port $workerPort..." -ForegroundColor Cyan
    Write-Host "   Connecting to: $remoteOllamaUrl" -ForegroundColor Cyan
    Write-Host ""
    
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; Write-Host '[STARTING] Worker Service Starting...' -ForegroundColor Green; Write-Host 'Port: $workerPort' -ForegroundColor Cyan; Write-Host 'Ollama: $remoteOllamaUrl' -ForegroundColor Cyan; Write-Host ''; npm run dev" -WindowStyle Normal
    
    Write-Host "   Waiting for Worker to start (this may take 30-60 seconds on first run)..." -ForegroundColor Yellow
    Write-Host "   Checking every 5 seconds..." -ForegroundColor Gray
    
    $maxWaitTime = 60  # Maximum wait time in seconds
    $checkInterval = 5  # Check every 5 seconds
    $waited = 0
    $workerReady = $false
    
    while ($waited -lt $maxWaitTime -and -not $workerReady) {
        Start-Sleep -Seconds $checkInterval
        $waited += $checkInterval
        Write-Host "   ... waiting ($waited seconds)" -ForegroundColor Gray
        
        try {
            $workerCheck = Invoke-WebRequest -Uri "http://localhost:$workerPort/health" -Method GET -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($workerCheck.StatusCode -eq 200) {
                Write-Host "   [OK] Worker is now running!" -ForegroundColor Green
                $workerReady = $true
            }
        } catch {
            # Worker not ready yet, continue waiting
        }
    }
    
    if (-not $workerReady) {
        Write-Host "   [WARNING] Worker did not start within $maxWaitTime seconds." -ForegroundColor Yellow
        Write-Host "   Please check the Worker window for errors." -ForegroundColor Yellow
        Write-Host "   You can manually test once Worker is ready." -ForegroundColor Yellow
    }
} else {
    Write-Host "[OK] Worker is already running. Using existing instance." -ForegroundColor Green
    $workerReady = $true
}

Write-Host ""

# ============================================
# Step 6: Test Worker with Sample Request
# ============================================
Write-Host "[STEP 6] Testing Worker with Sample Request..." -ForegroundColor Yellow
Write-Host ""

# Only test if worker is ready
if (-not $workerReady) {
    Write-Host "   [SKIPPED] Worker is not ready. Skipping test." -ForegroundColor Yellow
    Write-Host "   Please wait for Worker to start, then run the test manually." -ForegroundColor Yellow
} else {
    Write-Host "   Testing workflow generation endpoint..." -ForegroundColor Gray
    Write-Host ""

    $testBody = @{
        prompt = "Create a workflow to send a daily email report"
        config = @{}
    } | ConvertTo-Json

    try {
        Write-Host "   Sending test request to Worker..." -ForegroundColor Gray
        $response = Invoke-RestMethod -Uri "http://localhost:$workerPort/api/generate-workflow" `
            -Method POST `
            -ContentType "application/json" `
            -Body $testBody `
            -TimeoutSec 60 `
            -ErrorAction Stop
    
    Write-Host "   [OK] Worker responded successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Response preview:" -ForegroundColor Cyan
    if ($response.workflow) {
        Write-Host "      - Workflow ID: $($response.workflow.id)" -ForegroundColor White
        Write-Host "      - Nodes: $($response.workflow.nodes.Count)" -ForegroundColor White
        Write-Host "      - Connections: $($response.workflow.connections.Count)" -ForegroundColor White
    } else {
        Write-Host "      $($response | ConvertTo-Json -Depth 2)" -ForegroundColor White
    }
    } catch {
        Write-Host "   [ERROR] Error testing Worker:" -ForegroundColor Red
        Write-Host "      $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "      Response: $responseBody" -ForegroundColor Red
        }
        Write-Host ""
        Write-Host "   [TROUBLESHOOTING]" -ForegroundColor Yellow
        Write-Host "   1. Check the Worker window for startup errors" -ForegroundColor White
        Write-Host "   2. Verify Worker is listening on port $workerPort" -ForegroundColor White
        Write-Host "   3. Check if dependencies are installed: npm install" -ForegroundColor White
        Write-Host "   4. Try starting Worker manually: npm run dev" -ForegroundColor White
    }
}

Write-Host ""

# ============================================
# Summary
# ============================================
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Test Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Service URLs:" -ForegroundColor Cyan
Write-Host "   - Worker Service:    http://localhost:$workerPort" -ForegroundColor White
Write-Host "   - Remote Ollama:     $remoteOllamaUrl" -ForegroundColor White
Write-Host ""
Write-Host "Test Commands:" -ForegroundColor Cyan
Write-Host ""
Write-Host "   # Test Worker health" -ForegroundColor Gray
Write-Host "   Invoke-RestMethod -Uri http://localhost:$workerPort/health" -ForegroundColor White
Write-Host ""
Write-Host "   # Test workflow generation" -ForegroundColor Gray
Write-Host '   $body = @{ prompt = "Your test prompt"; config = @{} } | ConvertTo-Json' -ForegroundColor White
Write-Host "   Invoke-RestMethod -Uri http://localhost:$workerPort/api/generate-workflow -Method POST -ContentType 'application/json' -Body `$body" -ForegroundColor White
Write-Host ""
Write-Host "   # Test remote Ollama directly" -ForegroundColor Gray
Write-Host "   Invoke-RestMethod -Uri $remoteOllamaUrl/health" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host '   1. Check Worker logs in the PowerShell window' -ForegroundColor White
Write-Host '   2. Test with different prompts' -ForegroundColor White
Write-Host '   3. Verify fine-tuned model is being used (check logs)' -ForegroundColor White
Write-Host '   4. If results are not accurate, adjust settings in .env file' -ForegroundColor White
Write-Host ""
