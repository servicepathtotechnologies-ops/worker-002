# Monitoring Setup Script for Phase 2 (PowerShell)
# Configures dashboards, alerts, and metrics collection

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Phase 2 Monitoring Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')" -ForegroundColor Gray
Write-Host ""

# Configuration
$STAGING_DIR = if ($env:STAGING_DIR) { $env:STAGING_DIR } else { "C:\ctrlchecks-worker-staging" }
$MONITORING_DIR = Join-Path $STAGING_DIR "monitoring"
$LOG_DIR = if ($env:LOG_DIR) { $env:LOG_DIR } else { "C:\logs\ctrlchecks-worker" }

# Create directories
New-Item -ItemType Directory -Force -Path $MONITORING_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $LOG_DIR | Out-Null

# Log function
function Log-Message {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')] $Message"
}

Log-Message "Setting up monitoring for Phase 2..."

# Step 1: Create monitoring configuration
Log-Message "Step 1: Creating monitoring configuration..."

$metricsConfig = @{
    metrics = @{
        memory_usage = @{
            description = "Memory usage per workflow execution"
            unit = "MB"
            alert_threshold = 200
            baseline = 50
        }
        cache_hit_rate = @{
            description = "LRU cache hit rate percentage"
            unit = "percent"
            target = 80
            alert_threshold = 15
        }
        cache_miss_rate = @{
            description = "LRU cache miss rate percentage"
            unit = "percent"
            target = 15
            alert_threshold = 25
        }
        eviction_count = @{
            description = "Number of cache evictions"
            unit = "count"
            alert_threshold = 1000
        }
        workflow_execution_time = @{
            description = "Workflow execution time"
            unit = "ms"
            baseline = 1000
            alert_threshold = 5000
        }
        cache_size_utilization = @{
            description = "Cache size utilization percentage"
            unit = "percent"
            target = 70
            alert_threshold = 95
        }
    }
    alerts = @{
        cache_miss_rate_high = @{
            condition = "cache_miss_rate > 15"
            severity = "warning"
            message = "Cache miss rate exceeds 15%"
        }
        memory_usage_high = @{
            condition = "memory_usage > 2 * baseline"
            severity = "critical"
            message = "Memory usage exceeds 2x baseline"
        }
        workflow_failures_increased = @{
            condition = "workflow_failures > baseline * 1.1"
            severity = "critical"
            message = "Workflow failures increased by more than 10%"
        }
    }
}

$metricsConfig | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $MONITORING_DIR "metrics-config.json")
Log-Message "✅ Metrics configuration created"

# Step 2: Create metrics collection script
Log-Message "Step 2: Creating metrics collection script..."

$collectScript = @"
# Collect Phase 2 metrics from worker service
`$METRICS_URL = if (`$env:METRICS_URL) { `$env:METRICS_URL } else { "http://localhost:3001/metrics" }
`$OUTPUT_FILE = if (`$env:OUTPUT_FILE) { `$env:OUTPUT_FILE } else { "$LOG_DIR\metrics.json" }

try {
    `$response = Invoke-RestMethod -Uri `$METRICS_URL -ErrorAction Stop
    `$response | ConvertTo-Json -Depth 10 | Set-Content `$OUTPUT_FILE
    Write-Host "Metrics collected: `$OUTPUT_FILE"
} catch {
    Write-Host "Failed to collect metrics from `$METRICS_URL`: $_"
    exit 1
}
"@

$collectScript | Set-Content (Join-Path $MONITORING_DIR "collect-metrics.ps1")
Log-Message "✅ Metrics collection script created"

# Step 3: Create monitoring dashboard queries
Log-Message "Step 3: Creating monitoring dashboard queries..."

$dashboardQueries = @"
-- Phase 2 Monitoring Dashboard Queries
-- Use these queries in your monitoring dashboard (Grafana, DataDog, etc.)

-- Memory Usage Per Workflow
SELECT 
    workflow_id,
    AVG(memory_usage_mb) as avg_memory_mb,
    MAX(memory_usage_mb) as max_memory_mb,
    COUNT(*) as execution_count
FROM workflow_executions
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY workflow_id
ORDER BY avg_memory_mb DESC;

-- Cache Hit/Miss Rate
SELECT 
    DATE_TRUNC('hour', timestamp) as hour,
    AVG(cache_hit_rate) as avg_hit_rate,
    AVG(cache_miss_rate) as avg_miss_rate,
    SUM(cache_hits) as total_hits,
    SUM(cache_misses) as total_misses
FROM cache_metrics
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Eviction Count Timeline
SELECT 
    DATE_TRUNC('minute', timestamp) as minute,
    SUM(eviction_count) as total_evictions
FROM cache_metrics
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY minute
ORDER BY minute DESC;

-- Workflow Execution Time Comparison
SELECT 
    DATE_TRUNC('hour', timestamp) as hour,
    AVG(execution_time_ms) as avg_execution_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_execution_time,
    COUNT(*) as execution_count
FROM workflow_executions
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Cache Size Utilization
SELECT 
    DATE_TRUNC('hour', timestamp) as hour,
    AVG(cache_size_utilization) as avg_utilization,
    MAX(cache_size_utilization) as max_utilization
FROM cache_metrics
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
"@

$dashboardQueries | Set-Content (Join-Path $MONITORING_DIR "dashboard-queries.sql")
Log-Message "✅ Dashboard queries created"

# Step 4: Create log monitoring script
Log-Message "Step 4: Creating log monitoring script..."

$monitorLogsScript = @"
# Monitor Phase 2 logs for first 100 workflows
`$LOG_FILE = if (`$env:LOG_FILE) { `$env:LOG_FILE } else { "$LOG_DIR\staging.log" }
`$OUTPUT_FILE = if (`$env:OUTPUT_FILE) { `$env:OUTPUT_FILE } else { "$LOG_DIR\monitoring-report.txt" }

Write-Host "Monitoring logs for Phase 2 metrics..."
Write-Host "Log file: `$LOG_FILE"
Write-Host ""

if (Test-Path `$LOG_FILE) {
    `$content = Get-Content `$LOG_FILE -Raw
    
    # Count workflow executions
    `$workflowCount = ([regex]::Matches(`$content, "Executing workflow")).Count
    Write-Host "Total workflow executions: `$workflowCount"
    
    # Count cache hits/misses
    `$cacheHits = ([regex]::Matches(`$content, "Cache hit")).Count
    `$cacheMisses = ([regex]::Matches(`$content, "Cache miss")).Count
    Write-Host "Cache hits: `$cacheHits"
    Write-Host "Cache misses: `$cacheMisses"
    
    # Calculate hit rate
    if ((`$cacheHits + `$cacheMisses) -gt 0) {
        `$hitRate = [math]::Round((`$cacheHits * 100.0 / (`$cacheHits + `$cacheMisses)), 2)
        Write-Host "Cache hit rate: `$hitRate%"
    } else {
        Write-Host "Cache hit rate: N/A (no cache operations)"
        `$hitRate = "N/A"
    }
    
    # Count evictions
    `$evictions = ([regex]::Matches(`$content, "Cache eviction")).Count
    Write-Host "Cache evictions: `$evictions"
    
    # Count errors
    `$errors = ([regex]::Matches(`$content, "ERROR")).Count
    Write-Host "Errors: `$errors"
    
    # Save to output file
    `$report = @"
Phase 2 Monitoring Report
Generated: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')

Workflow Executions: `$workflowCount
Cache Hits: `$cacheHits
Cache Misses: `$cacheMisses
Cache Hit Rate: `$hitRate%
Cache Evictions: `$evictions
Errors: `$errors
"@
    `$report | Set-Content `$OUTPUT_FILE
    Write-Host ""
    Write-Host "Report saved to: `$OUTPUT_FILE"
} else {
    Write-Host "Log file not found: `$LOG_FILE"
}
"@

$monitorLogsScript | Set-Content (Join-Path $MONITORING_DIR "monitor-logs.ps1")
Log-Message "✅ Log monitoring script created"

# Step 5: Create setup summary
Log-Message "Step 5: Creating setup summary..."

$setupSummary = @"
==========================================
Phase 2 Monitoring Setup Summary
==========================================
Timestamp: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ')
Status: ✅ COMPLETE

Monitoring Components:
- Metrics Configuration: $MONITORING_DIR\metrics-config.json
- Dashboard Queries: $MONITORING_DIR\dashboard-queries.sql
- Log Monitoring: $MONITORING_DIR\monitor-logs.ps1
- Metrics Collection: $MONITORING_DIR\collect-metrics.ps1

Next Steps:
1. Run baseline collection:
   .\monitoring\collect-metrics.ps1

2. Set up log monitoring (first 100 workflows):
   .\monitoring\monitor-logs.ps1

3. Configure your monitoring system (Prometheus, DataDog, etc.):
   - Import alert rules from: monitoring\metrics-config.json
   - Use dashboard queries from: monitoring\dashboard-queries.sql

Metrics to Monitor:
- Memory usage per workflow (target: < 2x baseline)
- Cache hit rate (target: > 80%)
- Cache miss rate (target: < 15%)
- Eviction count (alert if > 1000)
- Workflow execution time (target: < 5s)
- Cache size utilization (target: < 95%)

Alerts Configured:
- High cache miss rate (> 15%)
- High memory usage (> 2x baseline)
- Increased workflow failures (> 10%)
==========================================
"@

$setupSummary | Set-Content (Join-Path $MONITORING_DIR "setup-summary.txt")
Write-Host $setupSummary

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ Monitoring Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Monitoring directory: $MONITORING_DIR"
Write-Host "Summary: $MONITORING_DIR\setup-summary.txt"
Write-Host ""
Write-Host "Next: Run baseline collection and start monitoring"
Write-Host "  .\monitoring\collect-metrics.ps1"
Write-Host ""
