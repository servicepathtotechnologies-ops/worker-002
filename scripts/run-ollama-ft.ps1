# PowerShell script wrapper for Ollama fine-tuning
# Usage: From worker directory: .\scripts\run-ollama-ft.ps1
#        From project root: .\worker\scripts\run-ollama-ft.ps1
#
# Note: This script is a convenience wrapper. The npm script handles everything
#       gracefully, including falling back to Modelfile method when ollama-ft is not available.

Write-Host "Starting Ollama Fine-Tuning..." -ForegroundColor Green
Write-Host ""
Write-Host "   This script will run: npm run train:ollama-ft" -ForegroundColor Cyan
Write-Host "   The npm script will:" -ForegroundColor Cyan
Write-Host "   1. Prepare training data (if needed)" -ForegroundColor Cyan
Write-Host "   2. Create a Modelfile automatically" -ForegroundColor Cyan
Write-Host "   3. Attempt to create the model (or provide instructions)" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the worker directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkerDir = Split-Path -Parent $ScriptDir
$CurrentDir = Get-Location

if ($CurrentDir.Path -ne $WorkerDir) {
    Write-Host "Warning: Not in worker directory. Changing to worker directory..." -ForegroundColor Yellow
    Set-Location $WorkerDir
}

# Check if package.json exists
if (-not (Test-Path "package.json")) {
    Write-Host "Error: package.json not found. Make sure you're in the worker directory." -ForegroundColor Red
    exit 1
}

# Check if npm is available
try {
    $null = Get-Command npm -ErrorAction Stop
} catch {
    Write-Host "Error: npm is not installed or not in PATH." -ForegroundColor Red
    exit 1
}

Write-Host "Running npm script..." -ForegroundColor Green
Write-Host ""

# Run the npm script
npm run train:ollama-ft

$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Host "Training process completed successfully!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Training process exited with code $exitCode" -ForegroundColor Yellow
    Write-Host "Check the output above for details." -ForegroundColor Yellow
}

exit $exitCode
