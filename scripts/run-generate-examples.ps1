# Generate 200+ Training Examples
# Run this script to add 200+ examples to the training dataset

Write-Host "🚀 Generating 200+ workflow training examples..." -ForegroundColor Green

# Check if Node.js is available
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Navigate to worker directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$workerPath = Join-Path $scriptPath ".."
Set-Location $workerPath

# Run the TypeScript file
Write-Host "📝 Running example generation script..." -ForegroundColor Cyan
npx ts-node scripts/generate-200-examples.ts

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Examples generated successfully!" -ForegroundColor Green
    Write-Host "📁 Check: worker/data/workflow_training_dataset_300.json" -ForegroundColor Cyan
} else {
    Write-Host "❌ Failed to generate examples" -ForegroundColor Red
    exit 1
}
