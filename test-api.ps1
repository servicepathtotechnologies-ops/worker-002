# PowerShell Script for Testing API Endpoints
# Usage: .\test-api.ps1

$baseUrl = "http://localhost:3001"

Write-Host ""
Write-Host "Testing CtrlChecks API Endpoints" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "1. Testing Health Check..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/health" -UseBasicParsing
    $health = $response.Content | ConvertFrom-Json
    Write-Host "   Status: $($health.status)" -ForegroundColor Green
    Write-Host "   Backend: $($health.backend)" -ForegroundColor Green
    Write-Host "   Ollama: $($health.ollama)" -ForegroundColor Green
    Write-Host "   Models: $($health.models.Count) loaded" -ForegroundColor Green
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: List AI Models
Write-Host "2. Testing AI Models Endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/ai/models" -UseBasicParsing
    $models = $response.Content | ConvertFrom-Json
    Write-Host "   Found $($models.models.Count) models" -ForegroundColor Green
    Write-Host "   Recommended: $($models.recommended -join ', ')" -ForegroundColor Cyan
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""

# Test 3: AI Text Generation
Write-Host "3. Testing AI Text Generation..." -ForegroundColor Yellow
try {
    $body = @{
        prompt = "Hello, how are you?"
        model = "qwen2.5:3b"
    } | ConvertTo-Json

    $response = Invoke-WebRequest -Uri "$baseUrl/api/ai/generate" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -UseBasicParsing

    $result = $response.Content | ConvertFrom-Json
    if ($result.success) {
        Write-Host "   Generation successful!" -ForegroundColor Green
        $preview = $result.result.content
        if ($preview.Length -gt 100) {
            $preview = $preview.Substring(0, 100) + "..."
        }
        Write-Host "   Response: $preview" -ForegroundColor Cyan
        Write-Host "   Model: $($result.result.model)" -ForegroundColor Cyan
    } else {
        Write-Host "   Generation failed: $($result.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
    Write-Host "   Tip: Make sure Ollama is running and qwen2.5:3b model is loaded" -ForegroundColor Yellow
}

Write-Host ""

# Test 4: AI Chat
Write-Host "4. Testing AI Chat Endpoint..." -ForegroundColor Yellow
try {
    $body = @{
        messages = @(
            @{
                role = "user"
                content = "What is 2+2?"
            }
        )
        model = "qwen2.5:3b"
    } | ConvertTo-Json -Depth 10

    $response = Invoke-WebRequest -Uri "$baseUrl/api/ai/chat" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -UseBasicParsing

    $result = $response.Content | ConvertFrom-Json
    if ($result.success) {
        Write-Host "   Chat successful!" -ForegroundColor Green
        $preview = $result.result.content
        if ($preview.Length -gt 100) {
            $preview = $preview.Substring(0, 100) + "..."
        }
        Write-Host "   Response: $preview" -ForegroundColor Cyan
    } else {
        Write-Host "   Chat failed: $($result.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""

# Test 5: AI Metrics
Write-Host "5. Testing AI Metrics Endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/ai/metrics" -UseBasicParsing
    $metrics = $response.Content | ConvertFrom-Json
    Write-Host "   Metrics retrieved" -ForegroundColor Green
    Write-Host "   Total Requests: $($metrics.metrics.totalRequests)" -ForegroundColor Cyan
    Write-Host "   Success Rate: $([math]::Round($metrics.metrics.successRate, 1))%" -ForegroundColor Cyan
    Write-Host "   Avg Response Time: $([math]::Round($metrics.metrics.averageResponseTime, 0))ms" -ForegroundColor Cyan
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Testing Complete!" -ForegroundColor Green
Write-Host ""
