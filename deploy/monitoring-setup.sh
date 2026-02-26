#!/bin/bash
# Monitoring Setup Script for Phase 2
# Configures dashboards, alerts, and metrics collection

set -e

echo "=========================================="
echo "Phase 2 Monitoring Setup"
echo "=========================================="
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo ""

# Configuration
STAGING_DIR="${STAGING_DIR:-/opt/ctrlchecks-worker-staging}"
MONITORING_DIR="${MONITORING_DIR:-$STAGING_DIR/monitoring}"
LOG_DIR="${LOG_DIR:-/var/log/ctrlchecks-worker}"

# Create directories
mkdir -p "$MONITORING_DIR"
mkdir -p "$LOG_DIR"

# Log function
log() {
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $1"
}

log "Setting up monitoring for Phase 2..."

# Step 1: Create monitoring configuration
log "Step 1: Creating monitoring configuration..."

cat > "$MONITORING_DIR/metrics-config.json" << 'EOF'
{
  "metrics": {
    "memory_usage": {
      "description": "Memory usage per workflow execution",
      "unit": "MB",
      "alert_threshold": 200,
      "baseline": 50
    },
    "cache_hit_rate": {
      "description": "LRU cache hit rate percentage",
      "unit": "percent",
      "target": 80,
      "alert_threshold": 15
    },
    "cache_miss_rate": {
      "description": "LRU cache miss rate percentage",
      "unit": "percent",
      "target": 15,
      "alert_threshold": 25
    },
    "eviction_count": {
      "description": "Number of cache evictions",
      "unit": "count",
      "alert_threshold": 1000
    },
    "workflow_execution_time": {
      "description": "Workflow execution time",
      "unit": "ms",
      "baseline": 1000,
      "alert_threshold": 5000
    },
    "cache_size_utilization": {
      "description": "Cache size utilization percentage",
      "unit": "percent",
      "target": 70,
      "alert_threshold": 95
    }
  },
  "alerts": {
    "cache_miss_rate_high": {
      "condition": "cache_miss_rate > 15",
      "severity": "warning",
      "message": "Cache miss rate exceeds 15%"
    },
    "memory_usage_high": {
      "condition": "memory_usage > 2 * baseline",
      "severity": "critical",
      "message": "Memory usage exceeds 2x baseline"
    },
    "workflow_failures_increased": {
      "condition": "workflow_failures > baseline * 1.1",
      "severity": "critical",
      "message": "Workflow failures increased by more than 10%"
    }
  }
}
EOF

log "✅ Metrics configuration created"

# Step 2: Create Prometheus metrics endpoint script (if using Prometheus)
log "Step 2: Creating metrics collection script..."

cat > "$MONITORING_DIR/collect-metrics.sh" << 'EOF'
#!/bin/bash
# Collect Phase 2 metrics from worker service

METRICS_URL="${METRICS_URL:-http://localhost:3001/metrics}"
OUTPUT_FILE="${OUTPUT_FILE:-/var/log/ctrlchecks-worker/metrics.json}"

# Collect metrics
curl -s "$METRICS_URL" | jq '.' > "$OUTPUT_FILE" 2>/dev/null || {
    echo "Failed to collect metrics from $METRICS_URL"
    exit 1
}

echo "Metrics collected: $OUTPUT_FILE"
EOF

chmod +x "$MONITORING_DIR/collect-metrics.sh"
log "✅ Metrics collection script created"

# Step 3: Create monitoring dashboard queries
log "Step 3: Creating monitoring dashboard queries..."

cat > "$MONITORING_DIR/dashboard-queries.sql" << 'EOF'
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
EOF

log "✅ Dashboard queries created"

# Step 4: Create alert rules configuration
log "Step 4: Creating alert rules..."

cat > "$MONITORING_DIR/alert-rules.yml" << 'EOF'
# Phase 2 Alert Rules
# For use with Prometheus Alertmanager or similar

groups:
  - name: phase2_alerts
    interval: 30s
    rules:
      # Cache Miss Rate Alert
      - alert: HighCacheMissRate
        expr: cache_miss_rate > 15
        for: 5m
        labels:
          severity: warning
          phase: "2"
        annotations:
          summary: "Cache miss rate exceeds 15%"
          description: "Cache miss rate is {{ $value }}%, target is < 15%"

      # Memory Usage Alert
      - alert: HighMemoryUsage
        expr: memory_usage_mb > (baseline_memory_mb * 2)
        for: 10m
        labels:
          severity: critical
          phase: "2"
        annotations:
          summary: "Memory usage exceeds 2x baseline"
          description: "Memory usage is {{ $value }}MB, baseline is {{ $baseline_memory_mb }}MB"

      # Workflow Failures Alert
      - alert: IncreasedWorkflowFailures
        expr: (workflow_failures / workflow_total) > 0.1
        for: 5m
        labels:
          severity: critical
          phase: "2"
        annotations:
          summary: "Workflow failures increased by more than 10%"
          description: "Failure rate is {{ $value | humanizePercentage }}"

      # Cache Eviction Alert
      - alert: HighEvictionRate
        expr: rate(cache_evictions_total[5m]) > 1000
        for: 5m
        labels:
          severity: warning
          phase: "2"
        annotations:
          summary: "High cache eviction rate"
          description: "Eviction rate is {{ $value }} per 5 minutes"
EOF

log "✅ Alert rules created"

# Step 5: Create log monitoring script
log "Step 5: Creating log monitoring script..."

cat > "$MONITORING_DIR/monitor-logs.sh" << 'EOF'
#!/bin/bash
# Monitor Phase 2 logs for first 100 workflows

LOG_FILE="${LOG_FILE:-/var/log/ctrlchecks-worker/staging.log}"
OUTPUT_FILE="${OUTPUT_FILE:-/var/log/ctrlchecks-worker/monitoring-report.txt}"

echo "Monitoring logs for Phase 2 metrics..."
echo "Log file: $LOG_FILE"
echo ""

# Count workflow executions
WORKFLOW_COUNT=$(grep -c "Executing workflow" "$LOG_FILE" 2>/dev/null || echo "0")
echo "Total workflow executions: $WORKFLOW_COUNT"

# Count cache hits/misses
CACHE_HITS=$(grep -c "Cache hit" "$LOG_FILE" 2>/dev/null || echo "0")
CACHE_MISSES=$(grep -c "Cache miss" "$LOG_FILE" 2>/dev/null || echo "0")
echo "Cache hits: $CACHE_HITS"
echo "Cache misses: $CACHE_MISSES"

# Calculate hit rate
if [ $((CACHE_HITS + CACHE_MISSES)) -gt 0 ]; then
    HIT_RATE=$(echo "scale=2; $CACHE_HITS * 100 / ($CACHE_HITS + $CACHE_MISSES)" | bc)
    echo "Cache hit rate: ${HIT_RATE}%"
else
    echo "Cache hit rate: N/A (no cache operations)"
fi

# Count evictions
EVICTIONS=$(grep -c "Cache eviction" "$LOG_FILE" 2>/dev/null || echo "0")
echo "Cache evictions: $EVICTIONS"

# Count errors
ERRORS=$(grep -c "ERROR" "$LOG_FILE" 2>/dev/null || echo "0")
echo "Errors: $ERRORS"

# Save to output file
{
    echo "Phase 2 Monitoring Report"
    echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo ""
    echo "Workflow Executions: $WORKFLOW_COUNT"
    echo "Cache Hits: $CACHE_HITS"
    echo "Cache Misses: $CACHE_MISSES"
    echo "Cache Hit Rate: ${HIT_RATE}%"
    echo "Cache Evictions: $EVICTIONS"
    echo "Errors: $ERRORS"
} > "$OUTPUT_FILE"

echo ""
echo "Report saved to: $OUTPUT_FILE"
EOF

chmod +x "$MONITORING_DIR/monitor-logs.sh"
log "✅ Log monitoring script created"

# Step 6: Create baseline metrics collection
log "Step 6: Creating baseline metrics collection script..."

cat > "$MONITORING_DIR/collect-baseline.sh" << 'EOF'
#!/bin/bash
# Collect baseline metrics for Phase 2
# Run this after deployment to establish baseline

BASELINE_FILE="${BASELINE_FILE:-$MONITORING_DIR/baseline-metrics.json}"
DURATION="${DURATION:-300}"  # 5 minutes

echo "Collecting baseline metrics for $DURATION seconds..."

# Start metrics collection
START_TIME=$(date +%s)
END_TIME=$((START_TIME + DURATION))

METRICS=()

while [ $(date +%s) -lt $END_TIME ]; do
    # Collect current metrics (adjust based on your metrics endpoint)
    METRIC=$(curl -s http://localhost:3001/metrics 2>/dev/null | jq '.' || echo "{}")
    METRICS+=("$METRIC")
    sleep 10
done

# Calculate baseline
cat > "$BASELINE_FILE" << BASELINE_EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "duration_seconds": $DURATION,
  "baseline": {
    "memory_usage_mb": $(echo "${METRICS[@]}" | jq -s 'map(.memory_usage_mb // 0) | add / length'),
    "cache_hit_rate": $(echo "${METRICS[@]}" | jq -s 'map(.cache_hit_rate // 0) | add / length'),
    "workflow_execution_time_ms": $(echo "${METRICS[@]}" | jq -s 'map(.execution_time_ms // 0) | add / length')
  }
}
BASELINE_EOF

echo "Baseline metrics saved to: $BASELINE_FILE"
cat "$BASELINE_FILE"
EOF

chmod +x "$MONITORING_DIR/collect-baseline.sh"
log "✅ Baseline collection script created"

# Step 7: Create monitoring dashboard HTML (simple version)
log "Step 7: Creating simple monitoring dashboard..."

cat > "$MONITORING_DIR/dashboard.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Phase 2 Monitoring Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .metric { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .metric h3 { margin-top: 0; }
        .status-ok { color: green; }
        .status-warning { color: orange; }
        .status-critical { color: red; }
    </style>
</head>
<body>
    <h1>Phase 2 Monitoring Dashboard</h1>
    <p>Last updated: <span id="lastUpdate"></span></p>
    
    <div class="metric">
        <h3>Memory Usage</h3>
        <p>Current: <span id="memory">Loading...</span> MB</p>
        <p>Baseline: <span id="memoryBaseline">-</span> MB</p>
        <p class="status-ok" id="memoryStatus">OK</p>
    </div>
    
    <div class="metric">
        <h3>Cache Hit Rate</h3>
        <p>Current: <span id="hitRate">Loading...</span>%</p>
        <p>Target: > 80%</p>
        <p class="status-ok" id="hitRateStatus">OK</p>
    </div>
    
    <div class="metric">
        <h3>Cache Miss Rate</h3>
        <p>Current: <span id="missRate">Loading...</span>%</p>
        <p>Target: < 15%</p>
        <p class="status-ok" id="missRateStatus">OK</p>
    </div>
    
    <div class="metric">
        <h3>Eviction Count</h3>
        <p>Total: <span id="evictions">Loading...</span></p>
    </div>
    
    <script>
        function updateMetrics() {
            fetch('/metrics')
                .then(r => r.json())
                .then(data => {
                    document.getElementById('memory').textContent = data.memory_usage_mb || 'N/A';
                    document.getElementById('hitRate').textContent = data.cache_hit_rate || 'N/A';
                    document.getElementById('missRate').textContent = data.cache_miss_rate || 'N/A';
                    document.getElementById('evictions').textContent = data.eviction_count || '0';
                    document.getElementById('lastUpdate').textContent = new Date().toLocaleString();
                })
                .catch(e => console.error('Failed to fetch metrics:', e));
        }
        
        updateMetrics();
        setInterval(updateMetrics, 30000); // Update every 30 seconds
    </script>
</body>
</html>
EOF

log "✅ Monitoring dashboard created"

# Step 8: Create setup summary
log "Step 8: Creating setup summary..."

cat > "$MONITORING_DIR/setup-summary.txt" << EOF
==========================================
Phase 2 Monitoring Setup Summary
==========================================
Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Status: ✅ COMPLETE

Monitoring Components:
- Metrics Configuration: $MONITORING_DIR/metrics-config.json
- Dashboard Queries: $MONITORING_DIR/dashboard-queries.sql
- Alert Rules: $MONITORING_DIR/alert-rules.yml
- Log Monitoring: $MONITORING_DIR/monitor-logs.sh
- Baseline Collection: $MONITORING_DIR/collect-baseline.sh
- Metrics Collection: $MONITORING_DIR/collect-metrics.sh
- Dashboard: $MONITORING_DIR/dashboard.html

Next Steps:
1. Run baseline collection:
   ./monitoring/collect-baseline.sh

2. Set up log monitoring (first 100 workflows):
   ./monitoring/monitor-logs.sh

3. Configure your monitoring system (Prometheus, DataDog, etc.):
   - Import alert rules from: monitoring/alert-rules.yml
   - Use dashboard queries from: monitoring/dashboard-queries.sql

4. Access simple dashboard (if served):
   http://localhost:3001/monitoring/dashboard.html

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
- High eviction rate (> 1000/5min)
==========================================
EOF

cat "$MONITORING_DIR/setup-summary.txt"

echo ""
echo "=========================================="
echo "✅ Monitoring Setup Complete!"
echo "=========================================="
echo "Monitoring directory: $MONITORING_DIR"
echo "Summary: $MONITORING_DIR/setup-summary.txt"
echo ""
echo "Next: Run baseline collection and start monitoring"
echo "  ./monitoring/collect-baseline.sh"
echo ""
