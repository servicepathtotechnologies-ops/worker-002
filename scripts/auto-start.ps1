# PowerShell script to auto-start backend server with retry logic
# Usage: .\scripts\auto-start.ps1

$MAX_RETRIES = 3
$RETRY_DELAY = 5
$WORKER_DIR = Split-Path $PSScriptRoot -Parent

Write-Host "🤖 Auto-starting Backend Server" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if already running
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -Method GET -TimeoutSec 2 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Backend is already running" -ForegroundColor Green
        exit 0
    }
} catch {
    # Backend is not running, continue
}

for ($i = 1; $i -le $MAX_RETRIES; $i++) {
    Write-Host "Attempt $i of $MAX_RETRIES..." -ForegroundColor Yellow
    
    # Change to worker directory
    Push-Location $WORKER_DIR
    
    # Start backend in background
    Write-Host "Starting backend server..." -ForegroundColor Yellow
    $backendJob = Start-Job -ScriptBlock {
        Set-Location $using:WORKER_DIR
        npm run dev 2>&1 | Out-File -FilePath "$using:WORKER_DIR\backend.log" -Append
    }
    
    Write-Host "Backend job started (Job ID: $($backendJob.Id))" -ForegroundColor Gray
    
    # Wait for startup
    Write-Host "Waiting for backend to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    
    # Check if started successfully
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Backend started successfully" -ForegroundColor Green
            Write-Host "📄 Logs: $WORKER_DIR\backend.log" -ForegroundColor Gray
            Write-Host "🌐 URL: http://localhost:3001" -ForegroundColor Gray
            Write-Host "🔗 Health: http://localhost:3001/health" -ForegroundColor Gray
            Pop-Location
            exit 0
        }
    } catch {
        Write-Host "❌ Backend failed to start (attempt $i)" -ForegroundColor Red
        
        if ($i -lt $MAX_RETRIES) {
            Write-Host "Waiting $RETRY_DELAY seconds before retry..." -ForegroundColor Yellow
            Start-Sleep -Seconds $RETRY_DELAY
        } else {
            Write-Host "💥 Failed to start backend after $MAX_RETRIES attempts" -ForegroundColor Red
            Write-Host "📄 Check logs: Get-Content $WORKER_DIR\backend.log" -ForegroundColor Yellow
            Pop-Location
            exit 1
        }
    }
    
    Pop-Location
}
