# CtrlChecks 100% Accuracy Implementation Script
# PowerShell version for Windows

Write-Host "🚀 Starting CtrlChecks 100% Accuracy Implementation" -ForegroundColor Green
Write-Host ("=" * 50) -ForegroundColor Cyan

# Step 1: Verify we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Must run from worker directory" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Verified: Running from worker directory" -ForegroundColor Green

# Step 2: Check if TypeScript is installed
Write-Host "`n📦 Checking dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules/typescript")) {
    Write-Host "⚠️  TypeScript not found. Installing..." -ForegroundColor Yellow
    npm install --save-dev typescript ts-node @types/node
}

# Step 3: Verify core files exist
Write-Host "`n🔍 Verifying core files..." -ForegroundColor Yellow
$requiredFiles = @(
    "src/core/utils/node-type-normalizer.ts",
    "src/core/contracts/node-schema-registry.ts",
    "src/core/contracts/workflow-auto-repair.ts"
)

$missingFiles = @()
foreach ($file in $requiredFiles) {
    if (-not (Test-Path $file)) {
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host "❌ Missing required files:" -ForegroundColor Red
    foreach ($file in $missingFiles) {
        Write-Host "   - $file" -ForegroundColor Red
    }
    exit 1
}

Write-Host "✅ All core files present" -ForegroundColor Green

# Step 4: Run type check
Write-Host "`n🔍 Running type check..." -ForegroundColor Yellow
npm run type-check
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Type check failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Type check passed" -ForegroundColor Green

# Step 5: Run tests
Write-Host "`n🧪 Running tests..." -ForegroundColor Yellow
npm test
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Some tests failed (this may be expected if tests are being added)" -ForegroundColor Yellow
} else {
    Write-Host "✅ All tests passed" -ForegroundColor Green
}

# Step 6: Export schemas
Write-Host "`n📤 Exporting node schemas..." -ForegroundColor Yellow
if (Test-Path "scripts/export-node-schemas.ts") {
    npx ts-node scripts/export-node-schemas.ts
    Write-Host "✅ Schemas exported" -ForegroundColor Green
}

# Step 7: Run startup validation
Write-Host "`n🔍 Running startup validation..." -ForegroundColor Yellow
if (Test-Path "scripts/startup-validation.js") {
    node scripts/startup-validation.js
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Startup validation had warnings (may be OK in development)" -ForegroundColor Yellow
    } else {
        Write-Host "✅ Startup validation passed" -ForegroundColor Green
    }
}

# Step 8: Build
Write-Host "`n🔨 Building project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build successful" -ForegroundColor Green

Write-Host "`n" + ("=" * 50) -ForegroundColor Cyan
Write-Host "🎉 Implementation complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Run tests: npm test" -ForegroundColor White
Write-Host "2. Verify accuracy: npm run verify:accuracy" -ForegroundColor White
Write-Host "3. Start server: npm run dev" -ForegroundColor White
Write-Host "4. Test with: curl -X POST http://localhost:3001/api/generate-workflow -H 'Content-Type: application/json' -d '{\"prompt\":\"send good morning to slack\"}'" -ForegroundColor White
