# Test 50 Random User Prompts
# Analyzes how well the system handles various prompts

Write-Host "Testing 50 Random User Prompts" -ForegroundColor Green
Write-Host ""

# Check if worker is running
$workerUrl = "http://localhost:3001"
try {
    $response = Invoke-WebRequest -Uri "$workerUrl/health" -Method GET -TimeoutSec 2 -ErrorAction Stop
    Write-Host "[OK] Worker is running on $workerUrl" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[WARNING] Worker is not running on $workerUrl" -ForegroundColor Yellow
    Write-Host "   The test will still run but will show expected results only" -ForegroundColor Yellow
    Write-Host "   Start worker with: cd worker && npm run dev" -ForegroundColor Cyan
    Write-Host ""
}

# Run the test
Write-Host "Running tests (this may take a few minutes)..." -ForegroundColor Cyan
Write-Host ""

# Already in worker directory, just run the script
npx ts-node scripts/test-50-prompts.ts

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[OK] Test completed!" -ForegroundColor Green
    Write-Host "Check results: worker/data/test-results-50-prompts.json" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "[ERROR] Test failed" -ForegroundColor Red
    exit 1
}
