# PowerShell script to trigger webhooks for testing
# Usage: .\trigger-webhook.ps1 -WebhookUrl "https://..." -PayloadFile "payloads/test-1.1.json"

param(
    [Parameter(Mandatory=$true)]
    [string]$WebhookUrl,
    
    [Parameter(Mandatory=$true)]
    [string]$PayloadFile,
    
    [switch]$Verbose
)

# Check if payload file exists
if (-not (Test-Path $PayloadFile)) {
    Write-Host "Error: Payload file not found: $PayloadFile" -ForegroundColor Red
    exit 1
}

# Read payload
$payload = Get-Content $PayloadFile -Raw

if ($Verbose) {
    Write-Host "Webhook URL: $WebhookUrl" -ForegroundColor Cyan
    Write-Host "Payload File: $PayloadFile" -ForegroundColor Cyan
    Write-Host "Payload:" -ForegroundColor Yellow
    Write-Host $payload -ForegroundColor Gray
    Write-Host ""
}

# Send webhook
try {
    Write-Host "Sending webhook request..." -ForegroundColor Green
    
    $response = Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $payload -ContentType "application/json" -ErrorAction Stop
    
    Write-Host "✅ Webhook triggered successfully!" -ForegroundColor Green
    
    if ($Verbose -or $response) {
        Write-Host "Response:" -ForegroundColor Yellow
        $response | ConvertTo-Json -Depth 10 | Write-Host
    }
} catch {
    Write-Host "❌ Error triggering webhook:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Red
    }
    
    exit 1
}
