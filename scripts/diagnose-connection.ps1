# PowerShell script to diagnose frontend-backend connection issues
# Usage: .\scripts\diagnose-connection.ps1

Write-Host "🔍 Diagnosing Frontend-Backend Connection Issues" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if backend is running
Write-Host "1. Checking backend process..." -ForegroundColor Yellow
$backendProcess = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*worker*" -or $_.CommandLine -like "*worker*" }
if ($backendProcess) {
    Write-Host "   ✅ Backend is running (PID: $($backendProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "   ❌ Backend is NOT running" -ForegroundColor Red
    Write-Host "      Start it: cd worker && npm run dev" -ForegroundColor Yellow
}

# Check port 3001
Write-Host "`n2. Checking port 3001..." -ForegroundColor Yellow
$port3001 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($port3001) {
    Write-Host "   ✅ Port 3001 is in use" -ForegroundColor Green
    $process = Get-Process -Id $port3001.OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "      Process: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Gray
    }
} else {
    Write-Host "   ❌ Nothing listening on port 3001" -ForegroundColor Red
}

# Test backend health
Write-Host "`n3. Testing backend health endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ Backend health endpoint responding" -ForegroundColor Green
        $healthData = $response.Content | ConvertFrom-Json
        Write-Host "      Status: $($healthData.status)" -ForegroundColor Gray
        Write-Host "      Environment: $($healthData.environment)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ❌ Backend health endpoint NOT responding" -ForegroundColor Red
    Write-Host "      Error: $($_.Exception.Message)" -ForegroundColor Gray
}

# Test CORS
Write-Host "`n4. Testing CORS headers..." -ForegroundColor Yellow
try {
    $headers = @{
        "Origin" = "http://localhost:8080"
    }
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -Method GET -Headers $headers -TimeoutSec 5 -ErrorAction Stop
    $corsHeader = $response.Headers['Access-Control-Allow-Origin']
    if ($corsHeader) {
        Write-Host "   ✅ CORS headers present: $corsHeader" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  No CORS headers found in response" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Could not test CORS (backend may not be running)" -ForegroundColor Red
}

# Check frontend API URL
Write-Host "`n5. Checking frontend API configuration..." -ForegroundColor Yellow
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) "ctrl_checks\.env.development"
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile
    $apiUrl = $envContent | Where-Object { $_ -match "VITE_API_URL|OLLAMA_BASE_URL" } | ForEach-Object { ($_ -split '=')[1] }
    if ($apiUrl) {
        Write-Host "   Frontend API URL: $apiUrl" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  No API URL found in .env.development" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  Frontend .env.development not found at: $envFile" -ForegroundColor Yellow
}

# Check frontend port
Write-Host "`n6. Checking frontend port 8080..." -ForegroundColor Yellow
$port8080 = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
if ($port8080) {
    Write-Host "   ✅ Port 8080 is in use (frontend may be running)" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Port 8080 is not in use (frontend may not be running)" -ForegroundColor Yellow
}

Write-Host "`n🛠️  Quick Fixes:" -ForegroundColor Cyan
Write-Host "   If backend not running: cd worker && npm run dev" -ForegroundColor White
Write-Host "   If port in use: Get-Process -Id <PID> | Stop-Process -Force" -ForegroundColor White
Write-Host "   Test manually: Invoke-WebRequest -Uri http://localhost:3001/health" -ForegroundColor White
Write-Host ""
