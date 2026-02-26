# Setup script for Memory System (PowerShell)
# This script sets up the database and initializes the memory system

Write-Host "🧠 Setting up Memory System..." -ForegroundColor Cyan

# Check if DATABASE_URL is set
if (-not $env:DATABASE_URL) {
    Write-Host "❌ Error: DATABASE_URL environment variable is not set" -ForegroundColor Red
    Write-Host "   Please set it in your .env file:" -ForegroundColor Yellow
    Write-Host "   DATABASE_URL=postgresql://user:password@host:port/database" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ DATABASE_URL is set" -ForegroundColor Green

# Check if npx is available
try {
    $null = Get-Command npx -ErrorAction Stop
} catch {
    Write-Host "❌ Error: npx is not installed. Please install Node.js and npm." -ForegroundColor Red
    exit 1
}

# Generate Prisma client
Write-Host "📦 Generating Prisma client..." -ForegroundColor Cyan
npx prisma generate

# Run migrations
Write-Host "🔄 Running database migrations..." -ForegroundColor Cyan
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    npx prisma migrate dev --name init
}

Write-Host ""
Write-Host "✅ Memory System setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Next steps:" -ForegroundColor Yellow
Write-Host "   1. Ensure OPENAI_API_KEY is set in .env for vector search" -ForegroundColor White
Write-Host "   2. Start the server: npm run dev" -ForegroundColor White
Write-Host "   3. Test the API: curl http://localhost:3001/api/memory/cache/stats" -ForegroundColor White
Write-Host ""
