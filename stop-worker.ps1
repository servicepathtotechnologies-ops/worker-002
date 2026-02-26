# ============================================
# Stop Worker Service
# ============================================

Write-Host "Stopping Worker Service on port 3001..." -ForegroundColor Yellow
Write-Host ""

# Find process using port 3001
$processes = netstat -ano | findstr :3001

if ($processes) {
    Write-Host "Found process(es) using port 3001:" -ForegroundColor Cyan
    $processes | ForEach-Object {
        Write-Host "   $_" -ForegroundColor Gray
    }
    Write-Host ""
    
    # Extract PIDs
    $pids = $processes | ForEach-Object {
        if ($_ -match '\s+(\d+)$') {
            $matches[1]
        }
    } | Select-Object -Unique
    
    foreach ($pid in $pids) {
        try {
            $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "Stopping process $pid ($($process.ProcessName))..." -ForegroundColor Yellow
                Stop-Process -Id $pid -Force -ErrorAction Stop
                Write-Host "   [OK] Process stopped" -ForegroundColor Green
            }
        } catch {
            $errorMsg = $_.Exception.Message
            Write-Host "   [WARNING] Could not stop process $pid : $errorMsg" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "Waiting 3 seconds for port to be released..." -ForegroundColor Gray
    Start-Sleep -Seconds 3
    
    # Verify port is free
    $stillInUse = netstat -ano | findstr :3001
    if ($stillInUse) {
        Write-Host "[WARNING] Port 3001 may still be in use. Try manually:" -ForegroundColor Yellow
        Write-Host "   taskkill /PID <PID> /F" -ForegroundColor White
    } else {
        Write-Host "[OK] Port 3001 is now free!" -ForegroundColor Green
    }
} else {
    Write-Host "[OK] No process found using port 3001" -ForegroundColor Green
}

Write-Host ""
