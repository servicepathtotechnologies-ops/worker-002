# PowerShell script to create Ollama model on remote server
# This script sets OLLAMA_BASE_URL and creates the model

param(
    [string]$ModelName = "ctrlchecks-workflow-builder",
    [string]$ModelfilePath = "",
    [string]$OllamaBaseUrl = "http://ollama.ctrlchecks.ai:8000"
)

# Get the script directory and resolve Modelfile path
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workerDir = Split-Path -Parent $scriptDir

# If ModelfilePath not provided, use default relative to worker directory
if ([string]::IsNullOrEmpty($ModelfilePath)) {
    $ModelfilePath = Join-Path $workerDir "data\Modelfile"
}

# Resolve to absolute path
$ModelfilePath = Resolve-Path $ModelfilePath -ErrorAction SilentlyContinue
if (-not $ModelfilePath) {
    # Try relative to current directory
    $ModelfilePath = Join-Path (Get-Location) "data\Modelfile"
    $ModelfilePath = Resolve-Path $ModelfilePath -ErrorAction SilentlyContinue
}

Write-Host "🚀 Creating Ollama model on remote server..." -ForegroundColor Cyan
Write-Host "   Model: $ModelName" -ForegroundColor Yellow
Write-Host "   Modelfile: $ModelfilePath" -ForegroundColor Yellow
Write-Host "   Ollama Base URL: $OllamaBaseUrl" -ForegroundColor Yellow
Write-Host ""

# Check if Modelfile exists
if (-not (Test-Path $ModelfilePath)) {
    Write-Host "❌ Error: Modelfile not found at $ModelfilePath" -ForegroundColor Red
    Write-Host "   Expected location: $workerDir\data\Modelfile" -ForegroundColor Yellow
    Write-Host "   Run: npm run train:prepare-data first" -ForegroundColor Yellow
    exit 1
}

# Extract hostname:port from URL (OLLAMA_BASE_URL env var format)
$url = [System.Uri]$OllamaBaseUrl
$ollamaBaseUrlEnv = $url.Host
if ($url.Port) {
    $ollamaBaseUrlEnv += ":$($url.Port)"
}

Write-Host "📝 Setting OLLAMA_BASE_URL=$ollamaBaseUrlEnv" -ForegroundColor Cyan
$env:OLLAMA_BASE_URL = $ollamaBaseUrlEnv

Write-Host "🔧 Running: ollama create $ModelName -f $ModelfilePath" -ForegroundColor Cyan
Write-Host ""

try {
    # Run ollama create command
    ollama create $ModelName -f $ModelfilePath
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Model created successfully!" -ForegroundColor Green
        Write-Host "   Model name: $ModelName" -ForegroundColor Green
        Write-Host ""
        Write-Host "🧪 Test the model:" -ForegroundColor Cyan
        Write-Host "   ollama run $ModelName `"Create a workflow to send daily emails`"" -ForegroundColor Yellow
    } else {
        Write-Host ""
        Write-Host "❌ Failed to create model. Exit code: $LASTEXITCODE" -ForegroundColor Red
        Write-Host ""
        Write-Host "💡 Troubleshooting:" -ForegroundColor Yellow
        Write-Host "   1. Make sure Ollama CLI is installed" -ForegroundColor White
        Write-Host "   2. Check if the remote server is accessible: $OllamaBaseUrl" -ForegroundColor White
        Write-Host "   3. Verify the Modelfile exists: $ModelfilePath" -ForegroundColor White
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Make sure Ollama CLI is installed and accessible" -ForegroundColor Yellow
    exit 1
}
