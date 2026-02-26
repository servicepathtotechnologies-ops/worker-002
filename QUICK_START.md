# 🚀 Quick Start Guide - Distributed Workflow Engine

## ✅ What's Working Now

Your distributed workflow engine is **fully operational**! Here's what you have:

- ✅ Database schema migrated
- ✅ Worker service processing jobs
- ✅ API server accepting requests
- ✅ Queue system (Redis) working
- ✅ Workflow execution completing successfully

## 📋 Daily Usage

### **1. Start Services (Every Time You Work)**

Open **3 PowerShell windows**:

**Window 1: Infrastructure** (Optional - only if using local Docker)
```powershell
cd worker
docker-compose -f docker-compose.distributed.yml up -d
```

**Window 2: Worker Service** (REQUIRED)
```powershell
cd worker
npm run dev:worker
```

**Window 3: API Server** (REQUIRED)
```powershell
cd worker
npm run dev
```

### **2. Execute a Workflow**

```powershell
$body = @{
  workflowId = "my-first-workflow"  # Or use workflow UUID
  input = @{
    message = "Hello, world!"
  }
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/distributed-execute-workflow" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body

$executionId = $response.execution_id
Write-Host "✅ Execution ID: $executionId"
```

### **3. Check Execution Status**

```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/execution-status/$executionId" | ConvertTo-Json
```

## 🎯 Next Steps

### **Immediate (Today)**

1. **Create More Workflows**
   - Use Supabase SQL Editor to create workflows in `workflow_definitions` table
   - Or use your frontend to create workflows

2. **Test Different Node Types**
   - Try workflows with different node types
   - Check which workers you need to add

3. **Monitor Executions**
   - Check execution status regularly
   - Watch worker service logs

### **Short Term (This Week)**

4. **Add More Workers**
   - Check `worker/src/services/workflow-executor/distributed/workers/`
   - Create workers for your custom node types
   - Register them in `worker-service.ts`

5. **Set Up Production Environment**
   - Move from local Docker to production services
   - Update `.env` with production credentials
   - Set up worker service as a system service (PM2, systemd)

6. **Integrate with Frontend**
   - Update your frontend to call `/api/distributed-execute-workflow`
   - Add execution status polling
   - Show real-time progress

### **Medium Term (This Month)**

7. **Migrate Existing Workflows**
   - Identify workflows using the old system
   - Convert them to `workflow_definitions` format
   - Test each migrated workflow

8. **Scale Your System**
   - Run multiple worker services
   - Add load balancing
   - Monitor performance

9. **Set Up Monitoring**
   - Monitor queue depth
   - Track execution times
   - Set up alerts for failures

## 🔧 Useful Commands

### **Check System Status**
```powershell
# Check if services are running
docker ps

# Check queue depth
docker exec ctrlchecks-redis redis-cli LLEN workflow-nodes

# Check Redis connection
docker exec ctrlchecks-redis redis-cli ping
```

### **Retry Stuck Execution**
```powershell
cd worker
npm run retry-execution EXECUTION_ID
```

### **View Logs**
- Worker Service: Check the terminal where you ran `npm run dev:worker`
- API Server: Check the terminal where you ran `npm run dev`
- Redis: `docker logs ctrlchecks-redis`
- MinIO: `docker logs ctrlchecks-minio`

## 📚 Key Files

- **API Endpoint**: `worker/src/api/distributed-execute-workflow.ts`
- **Worker Service**: `worker/src/services/workflow-executor/distributed/worker-service.ts`
- **Orchestrator**: `worker/src/services/workflow-executor/distributed/distributed-orchestrator.ts`
- **Workers**: `worker/src/services/workflow-executor/distributed/workers/`
- **Documentation**: `worker/STEP_BY_STEP_SETUP_GUIDE.md`

## 🎉 Success Indicators

You'll know everything is working when:
- ✅ Worker service shows: `[QueueClient] 👂 Listening for jobs on: workflow-nodes`
- ✅ API returns `execution_id` when you start a workflow
- ✅ Worker service processes jobs and shows completion messages
- ✅ Execution status shows `"status": "completed"`

## 🆘 Troubleshooting

**Problem: Execution stuck in pending**
- Solution: Make sure worker service is running
- Retry: `npm run retry-execution EXECUTION_ID`

**Problem: Worker can't find node type**
- Solution: Add a worker for that node type in `worker-service.ts`

**Problem: Queue connection failed**
- Solution: Check Redis is running: `docker exec ctrlchecks-redis redis-cli ping`

---

**You're all set!** 🚀 Start creating and executing workflows!
