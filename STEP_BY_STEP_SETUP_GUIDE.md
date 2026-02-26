# 🚀 Step-by-Step Setup Guide: Distributed Workflow Engine

## 📋 What We've Built

We've converted your workflow system from a **monolithic, in-memory system** to a **distributed, queue-based system**. This means:

- ✅ Workflows can run across multiple servers
- ✅ If a server crashes, workflows continue running
- ✅ Large files (embeddings, documents) are stored in object storage
- ✅ Workflows can be monitored and recovered automatically

## 🎯 What You Need to Do (Step-by-Step)

### **Step 1: Run the Database Migrations** ⚠️ REQUIRED

**What this does:** Adds new tables and columns to your Supabase database for the distributed workflow system.

**How to do it:**

1. Open your **Supabase Dashboard**
2. Go to **SQL Editor**

**Migration 1: Create distributed workflow tables**
3. Open the file: `worker/migrations/001_distributed_workflow_engine.sql`
4. **Copy the entire contents** of that file
5. **Paste it into the SQL Editor**
6. Click **Run** (or press Ctrl+Enter)

**Expected result:** You should see:
```
Distributed workflow engine schema migration completed successfully!
```

**Migration 2: Fix foreign key constraint** (IMPORTANT - fixes the constraint error)
7. Open the file: `worker/migrations/002_fix_executions_workflow_id_fkey.sql`
8. **Copy the entire contents** of that file
9. **Paste it into the SQL Editor**
10. Click **Run** (or press Ctrl+Enter)

**Expected result:** You should see:
```
Fixed executions.workflow_id foreign key constraint!
```

**Migration 3: Add missing execution_steps columns** (IMPORTANT - fixes the created_at error)
11. Open the file: `worker/migrations/003_add_missing_execution_steps_columns.sql`
12. **Copy the entire contents** of that file
13. **Paste it into the SQL Editor**
14. Click **Run** (or press Ctrl+Enter)

**Expected result:** You should see:
```
Added all missing columns to execution_steps table!
```

**If you get an error:** 
- Make sure you're running it in the Supabase SQL Editor
- Check that you have the correct database selected
- The migrations are idempotent (safe to run multiple times)

---

### **Step 2: Start Infrastructure Services** (Optional for Local Testing)

**What this does:** Starts PostgreSQL, MinIO (object storage), RabbitMQ, and Redis locally for testing.

**How to do it:**

1. Open **PowerShell** or **Terminal**
2. Navigate to the worker directory:
   ```powershell
   cd worker
   ```
3. Start Docker services:
   ```powershell
   docker-compose -f docker-compose.distributed.yml up -d
   ```

**Expected result:** You should see:
```
Creating ctrlchecks-postgres ... done
Creating ctrlchecks-minio ... done
Creating ctrlchecks-rabbitmq ... done
Creating ctrlchecks-redis ... done
```

**Note:** If you're using Supabase (cloud), you can skip this step and configure your `.env` to use Supabase's PostgreSQL and your own S3/MinIO.

---

### **Step 3: Configure Environment Variables** ⚠️ REQUIRED

**What this does:** Tells your application where to find the queue, database, and object storage.

**How to do it:**

1. Open `worker/.env` file (or create it from `worker/env.example`)
2. Add these lines (adjust values if needed):

```env
# ============================================
# DISTRIBUTED WORKFLOW ENGINE CONFIGURATION
# ============================================

# Queue System (choose one: 'redis' or 'rabbitmq')
QUEUE_TYPE=redis
QUEUE_HOST=localhost
QUEUE_PORT=6379
QUEUE_NAME=workflow-nodes

# Object Storage (MinIO/S3)
# For local MinIO (from docker-compose):
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_NAME=ctrlchecks-workflows
S3_REGION=us-east-1

# If using AWS S3 instead:
# S3_ENDPOINT=  (leave empty for AWS)
# S3_ACCESS_KEY=your-aws-access-key
# S3_SECRET_KEY=your-aws-secret-key
# S3_BUCKET_NAME=your-bucket-name
# S3_REGION=us-east-1

# Your existing Supabase config should already be here:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Save the file.**

---

### **Step 4: Install Dependencies** ✅ (Already Done)

**What this does:** Installs the new packages needed for the distributed workflow engine.

**Status:** ✅ **Already completed!** (We fixed the zod dependency issue earlier)

If you need to reinstall:
```powershell
cd worker
npm install
```

---

### **Step 5: Start the Worker Service** (New Component)

**What this does:** Starts a background service that processes workflow jobs from the queue.

**How to do it:**

1. Open a **new PowerShell/Terminal window**
2. Navigate to worker directory:
   ```powershell
   cd worker
   ```
3. Start the worker service:
   ```powershell
   npm run dev:worker
   ```

**Expected result:** You should see:
```
🚀 Starting Distributed Workflow Worker Service...
📋 Node types: all
[QueueClient] ✅ Connected to Redis
[WorkerService] 🚀 Starting worker service...
[WorkerService] ✅ Worker service started
[QueueClient] 👂 Listening for jobs on: workflow-nodes
```

**Keep this window open** - the worker needs to keep running to process jobs.

---

### **Step 6: Start the API Server** (Main Application)

**What this does:** Starts your main Express.js server that handles API requests.

**How to do it:**

1. Open **another PowerShell/Terminal window**
2. Navigate to worker directory:
   ```powershell
   cd worker
   ```
3. Start the API server:
   ```powershell
   npm run dev
   ```

**Expected result:** You should see:
```
🚀 CtrlChecks Worker Backend
✅ Server running on port 3001
📡 Environment: development
...
POST /api/distributed-execute-workflow - Distributed workflow engine
GET  /api/execution-status/:executionId - Get execution status
```

**Keep this window open** - the API server needs to keep running.

---

### **Step 7: Test the System** 🧪

**What this does:** Tests that everything is working correctly.

**How to do it:**

1. **Test 1: Health Check**
   - Open your browser
   - Go to: `http://localhost:3001/health`
   - You should see a JSON response with status information

2. **Test 2: Start a Workflow Execution**
   
   ⚠️ **IMPORTANT:** You need a real workflow ID from your database. The `"test-workflow"` in the examples below is just a placeholder - replace it with an actual workflow ID.
   
   **How to get a workflow ID:**
   
   **Option A: From Supabase Dashboard**
   1. Go to your Supabase Dashboard
   2. Navigate to **Table Editor** → **workflows** table
   3. Find a workflow and copy its `id` (UUID format)
   
   **Option B: Query via SQL**
   ```sql
   SELECT id, name FROM workflows LIMIT 5;
   ```
   
   **Option C: Create a simple test workflow via SQL**
   
   ⚠️ **Note:** The `workflows` table requires `user_id`. You need to get your user ID first:
   ```sql
   -- First, get your user ID (replace 'your-email@example.com' with your actual email)
   SELECT id FROM auth.users WHERE email = 'your-email@example.com';
   ```
   
   Then create the workflow (replace `YOUR_USER_ID` with the ID from above):
   ```sql
   INSERT INTO workflows (name, nodes, edges, user_id, status)
   VALUES (
     'Test Workflow',
     '[{"id": "start", "type": "manual_trigger", "label": "Start", "data": {"type": "manual_trigger"}}]'::jsonb,
     '[]'::jsonb,
     'YOUR_USER_ID'::uuid,
     'active'
   )
   RETURNING id;
   ```
   
   Copy the returned `id` and use it in the API call below.
   
   **Alternative: Use workflow_definitions table (simpler, no user_id required)**
   ```sql
   INSERT INTO workflow_definitions (name, definition, is_active)
   VALUES (
     'test-workflow',
     '{"nodes": [{"id": "start", "type": "manual_trigger", "label": "Start", "data": {"type": "manual_trigger"}}], "edges": []}'::jsonb,
     true
   )
   RETURNING name;
   ```
   Use the returned `name` as the `workflowId` in the API call (the orchestrator checks `workflow_definitions` first by name).
   
   ---
   
   **Now make the API call:**
   
   **curl example (Linux/Mac/Git Bash):**
     ```bash
     # Replace YOUR_WORKFLOW_ID with the actual UUID from above
     curl -X POST http://localhost:3001/api/distributed-execute-workflow \
       -H "Content-Type: application/json" \
       -d '{
         "workflowId": "YOUR_WORKFLOW_ID",
         "input": {
           "message": "Hello, world!"
         }
       }'
     ```
   
   **PowerShell example (Windows):**
     ```powershell
     # If using workflow_definitions table (by name):
     $body = @{
       workflowId = "my-first-workflow"  # Use the name you created
       input = @{
         message = "Hello, world!"
       }
     } | ConvertTo-Json
     
     # Execute the workflow
     $response = Invoke-RestMethod -Uri "http://localhost:3001/api/distributed-execute-workflow" `
       -Method POST `
       -ContentType "application/json" `
       -Body $body
     
     # Display the response
     $response | ConvertTo-Json
     
     # Save execution ID for checking status later
     $executionId = $response.execution_id
     Write-Host "✅ Execution started! ID: $executionId"
     ```
     
     **Or if using workflows table (by UUID):**
     ```powershell
     # Replace YOUR_WORKFLOW_UUID with the actual UUID from workflows table
     $body = @{
       workflowId = "YOUR_WORKFLOW_UUID"  # UUID format: "a1b2c3d4-..."
       input = @{
         message = "Hello, world!"
       }
     } | ConvertTo-Json
     
     Invoke-RestMethod -Uri "http://localhost:3001/api/distributed-execute-workflow" `
       -Method POST `
       -ContentType "application/json" `
       -Body $body
     ```
   
   **Or using Invoke-WebRequest (PowerShell):**
     ```powershell
     # Replace YOUR_WORKFLOW_ID with the actual UUID from above
     $body = '{"workflowId":"YOUR_WORKFLOW_ID","input":{"message":"Hello, world!"}}'
     
     Invoke-WebRequest -Uri "http://localhost:3001/api/distributed-execute-workflow" `
       -Method POST `
       -ContentType "application/json" `
       -Body $body | Select-Object -ExpandProperty Content
     ```
   
   **Expected response (success):**
     ```json
     {
       "success": true,
       "execution_id": "abc123...",
       "status": "started",
       "message": "Workflow execution started. Use /api/execution-status/:id to check progress."
     }
     ```
   
   **If you get an error:**
     ```json
     {
       "error": "Workflow definition not found: YOUR_WORKFLOW_ID"
     }
     ```
     → Make sure you're using a valid workflow ID from your database (not "test-workflow")

3. **Test 3: Check Execution Status**
   - Make a GET request to: `http://localhost:3001/api/execution-status/{execution_id}`
   - Replace `{execution_id}` with the ID from Test 2
   - You should see execution status and progress

---

## 📊 What's Running Now?

After completing all steps, you should have:

1. ✅ **Database** - Supabase (cloud) or local PostgreSQL
2. ✅ **Queue** - Redis or RabbitMQ (for job distribution)
3. ✅ **Object Storage** - MinIO or S3 (for large files)
4. ✅ **Worker Service** - Processing jobs from the queue
5. ✅ **API Server** - Handling HTTP requests

---

## 🔍 Troubleshooting

### **Quick Reference: Testing Services with Docker**

Since `redis-cli` and `rabbitmq-diagnostics` aren't installed on Windows, use Docker commands:

```powershell
# Check if services are running
docker ps

# Test Redis connection
docker exec ctrlchecks-redis redis-cli ping
# Expected: PONG

# Check Redis queue depth
docker exec ctrlchecks-redis redis-cli LLEN workflow-nodes

# Test RabbitMQ connection
docker exec ctrlchecks-rabbitmq rabbitmq-diagnostics ping
# Expected: Ping succeeded

# View Redis logs
docker logs ctrlchecks-redis

# View RabbitMQ logs
docker logs ctrlchecks-rabbitmq

# View MinIO logs
docker logs ctrlchecks-minio

# Access MinIO Console (browser)
# http://localhost:9001 (minioadmin/minioadmin)

# Access RabbitMQ Management UI (browser)
# http://localhost:15672 (guest/guest)
```

---

### **Problem: Worker service won't start**

**Check:**
- Is Redis/RabbitMQ running? (`docker ps` to check)
- Are queue environment variables set correctly?
- Check the error message in the worker terminal

**Solution:**
```powershell
# Start Redis if using docker-compose
docker-compose -f docker-compose.distributed.yml up -d redis
```

---

### **Problem: "Queue connection failed"**

**Check:**
- `QUEUE_HOST` and `QUEUE_PORT` in `.env`
- Is the queue service running?

**Solution:**
```powershell
# Test Redis connection (using Docker - works on Windows/Linux/Mac)
docker exec ctrlchecks-redis redis-cli ping
# Expected output: PONG

# If using RabbitMQ instead:
docker exec ctrlchecks-rabbitmq rabbitmq-diagnostics ping
# Expected output: Ping succeeded
```

---

### **Problem: "Object storage not configured"**

**Check:**
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` in `.env`
- Is MinIO running? (if using local)

**Solution:**
```powershell
# Start MinIO if using docker-compose
docker-compose -f docker-compose.distributed.yml up -d minio
# Access MinIO console at http://localhost:9001
```

---

### **Problem: "Execution stuck in pending"**

**Check:**
- Is the worker service running? (Step 5)
- Check worker service logs for errors
- Check queue depth (Redis): `docker exec ctrlchecks-redis redis-cli LLEN workflow-nodes`
- Check queue depth (RabbitMQ): Access http://localhost:15672 (guest/guest) and check queue

**Solution:**
- Make sure worker service is running
- Check that the workflow has valid nodes
- Check database for error messages

**Quick Fix - Retry Stuck Execution:**
```powershell
# Retry a stuck execution (replace EXECUTION_ID with your actual execution ID)
cd worker
npm run retry-execution EXECUTION_ID
```

Or use npx:
```powershell
npx ts-node scripts/retry-stuck-execution.ts EXECUTION_ID
```

This will re-queue all pending steps for the execution. Make sure your worker service is running first!

---

### **Problem: "Queue shows 0 but I executed a workflow"**

**This is NORMAL!** Here's why:

1. **Queue depth of 0 means:**
   - ✅ No jobs are waiting (they were processed immediately)
   - ✅ OR no workflows have been executed yet

2. **To verify your workflow executed:**
   ```powershell
   # Check execution status (use the execution_id from API response)
   Invoke-RestMethod -Uri "http://localhost:3001/api/execution-status/YOUR_EXECUTION_ID"
   
   # Or check database directly (in Supabase SQL Editor):
   SELECT id, workflow_id, status, current_node, started_at, completed_at 
   FROM executions 
   ORDER BY started_at DESC 
   LIMIT 5;
   ```

3. **If execution status shows "completed":**
   - ✅ Everything worked! The queue processed it quickly
   - The queue is empty because the job was consumed and processed

4. **If execution status shows "pending" or "running":**
   - Check if worker service is running (Terminal 2)
   - Check worker service logs for errors
   - Verify the workflow has valid node types that workers can process

5. **Expected behavior:**
   - Queue depth: `0` (normal - jobs are processed quickly)
   - Execution status: `"completed"` (if workflow finished)
   - Worker logs: Show processing messages

---

## 🎯 Next Steps After Setup

### **Phase 1: Verify Everything Works** ✅

1. **Complete the Setup Checklist**
   - [ ] Run database migration (Step 1)
   - [ ] Configure environment variables (Step 3)
   - [ ] Start infrastructure services (Step 2 - optional)
   - [ ] Start worker service (Step 5)
   - [ ] Start API server (Step 6)
   - [ ] Run all tests (Step 7)

2. **Create Your First Real Workflow**
   - Use the `workflow_definitions` table (easiest):
     ```sql
     INSERT INTO workflow_definitions (name, definition, is_active)
     VALUES (
       'my-first-workflow',
       '{
         "nodes": [
           {"id": "start", "type": "manual_trigger", "label": "Start", "data": {"type": "manual_trigger"}},
           {"id": "node1", "type": "ollama_embed", "label": "Generate Embedding", "data": {"type": "ollama_embed"}}
         ],
         "edges": [
           {"id": "e1", "source": "start", "target": "node1"}
         ]
       }'::jsonb,
       true
     )
     RETURNING name;
     ```
   - Execute it using the API (replace `my-first-workflow` with your workflow name)

### **Phase 2: Production Readiness** 🚀

3. **Set Up Monitoring**
   - Monitor queue depth: `docker exec ctrlchecks-redis redis-cli LLEN workflow-nodes`
   - Check execution status regularly via API
   - Set up alerts for stuck executions
   - Monitor worker service logs

4. **Configure Production Environment**
   - Use production Supabase database
   - Set up production Redis/RabbitMQ (not local Docker)
   - Configure production S3 bucket (not local MinIO)
   - Update `.env` with production credentials
   - Set up worker service as a system service (PM2, systemd, etc.)

5. **Enable Recovery System**
   - The `RecoveryManager` automatically recovers stuck executions
   - Configure recovery intervals in your worker service
   - Monitor recovery logs

### **Phase 3: Advanced Usage** 🔧

6. **Migrate Existing Workflows**
   - Identify workflows currently using the old system
   - Convert them to `workflow_definitions` format
   - Test each migrated workflow
   - Gradually switch traffic from old to new system

7. **Add More Worker Types**
   - Check existing workers: `worker/src/services/workflow-executor/distributed/workers/`
   - Create new workers for custom node types:
     ```typescript
     // Example: worker/src/services/workflow-executor/distributed/workers/custom-worker.ts
     import { NodeWorker } from '../node-worker';
     
     export class CustomWorker extends NodeWorker {
       protected async executeNodeLogic(inputs, executionId, nodeId) {
         // Your custom logic here
         return { outputs: {...}, metadata: {...} };
       }
     }
     ```
   - Register in `worker-service.ts`

8. **Scale Your System**
   - Run multiple worker services (different terminals or servers)
   - Each worker can process jobs independently
   - Workers are stateless - scale horizontally easily
   - Use load balancer for API server

### **Phase 4: Integration** 🔗

9. **Integrate with Frontend**
   - Update your frontend to call `/api/distributed-execute-workflow`
   - Poll `/api/execution-status/:id` for progress
   - Display execution status in real-time

10. **Set Up Webhooks/Notifications**
    - Add webhook endpoints for execution completion
    - Send notifications when workflows finish
    - Integrate with your notification system

### **Phase 5: Optimization** ⚡

11. **Performance Tuning**
    - Monitor execution times
    - Optimize slow nodes
    - Adjust worker prefetch settings
    - Tune queue settings

12. **Storage Optimization**
    - Review what's stored in DB vs object storage
    - Adjust `MAX_DB_SIZE` threshold if needed
    - Clean up old execution artifacts

---

## 📋 Quick Reference Commands

**Start Everything (in order):**

**Step 1: Start Infrastructure** ✅ (You've done this!)
```powershell
cd worker
docker-compose -f docker-compose.distributed.yml up -d
# Expected: All 4 containers running (postgres, minio, rabbitmq, redis)
```

**Step 2: Start Worker Service** (Open a NEW PowerShell window)
```powershell
cd worker
npm run dev:worker
# Expected output:
# 🚀 Starting Distributed Workflow Worker Service...
# [QueueClient] ✅ Connected to Redis
# [WorkerService] 🚀 Starting worker service...
# [WorkerService] ✅ Worker service started
# [QueueClient] 👂 Listening for jobs on: workflow-nodes
# Keep this window open!
```

**Step 3: Start API Server** (Open ANOTHER PowerShell window)
```powershell
cd worker
npm run dev
# Expected output:
# 🚀 CtrlChecks Worker Backend
# ✅ Server running on port 3001
# POST /api/distributed-execute-workflow - Distributed workflow engine
# Keep this window open!
```

**Step 4: Test the System**
```powershell
# Execute your workflow (use the workflow name you created, e.g., "my-first-workflow")
$body = @{
  workflowId = "my-first-workflow"
  input = @{
    message = "Hello, world!"
  }
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/distributed-execute-workflow" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body

# Save execution ID
$executionId = $response.execution_id
Write-Host "✅ Execution started! ID: $executionId"

# Check status
Invoke-RestMethod -Uri "http://localhost:3001/api/execution-status/$executionId"
```

**Monitor System:**
```powershell
# 1. Check if Redis is working
docker exec ctrlchecks-redis redis-cli ping
# Expected output: PONG

# 2. Check queue depth (0 = empty, >0 = jobs waiting)
docker exec ctrlchecks-redis redis-cli LLEN workflow-nodes
# Expected output: 0 (if no workflows running) or number of pending jobs
# If you just executed a workflow, you might see 1 or more briefly, then 0 after processing

# 3. View worker service logs (in Terminal 2 where you ran npm run dev:worker)
# You should see messages like:
# [QueueClient] ✅ Connected to Redis
# [QueueClient] 👂 Listening for jobs on: workflow-nodes
# [WorkerService] ✅ Processing job: {execution_id: "...", node_id: "..."}
# [NodeWorker:ollama_embed] ✅ Completed node node1 for execution abc123...

# 4. Check execution status (replace YOUR_EXECUTION_ID with actual ID from API response)
Invoke-RestMethod -Uri "http://localhost:3001/api/execution-status/YOUR_EXECUTION_ID"
# Expected output: JSON with execution status, steps, and progress

# 5. List all executions in database (run in Supabase SQL Editor)
# SELECT id, workflow_id, status, current_node, started_at, completed_at 
# FROM executions 
# ORDER BY started_at DESC 
# LIMIT 10;

# 6. Check execution steps (run in Supabase SQL Editor)
# SELECT execution_id, node_id, node_type, status, error, completed_at
# FROM execution_steps
# WHERE execution_id = 'YOUR_EXECUTION_ID'
# ORDER BY sequence;
```

**Complete Testing Flow:**

1. **Execute your workflow** (you created `my-first-workflow`):
   ```powershell
   $body = @{
     workflowId = "my-first-workflow"
     input = @{
       message = "Hello, world!"
     }
   } | ConvertTo-Json
   
   $response = Invoke-RestMethod -Uri "http://localhost:3001/api/distributed-execute-workflow" `
     -Method POST `
     -ContentType "application/json" `
     -Body $body
   
   # Save the execution_id
   $executionId = $response.execution_id
   Write-Host "Execution ID: $executionId"
   ```

2. **Check what happened:**
   ```powershell
   # Check queue (should briefly show 1, then 0 after processing)
   docker exec ctrlchecks-redis redis-cli LLEN workflow-nodes
   
   # Check execution status
   Invoke-RestMethod -Uri "http://localhost:3001/api/execution-status/$executionId"
   ```

3. **Expected outputs:**

   **In Worker Service Terminal (Terminal 2):**
   ```
   [QueueClient] ✅ Connected to Redis
   [QueueClient] 👂 Listening for jobs on: workflow-nodes
   [WorkerService] ✅ Processing job: {execution_id: "...", node_id: "start"}
   [NodeWorker:manual_trigger] ✅ Completed node start for execution ...
   [WorkerService] ✅ Processing job: {execution_id: "...", node_id: "node1"}
   [NodeWorker:ollama_embed] ✅ Completed node node1 for execution ...
   ```

   **In API Response:**
   ```json
   {
     "success": true,
     "execution_id": "abc123-def456-...",
     "status": "started",
     "message": "Workflow execution started..."
   }
   ```

   **In Execution Status Response:**
   ```json
   {
     "execution_id": "abc123-def456-...",
     "status": "completed",
     "workflow_id": "my-first-workflow",
     "steps": [
       {"node_id": "start", "status": "completed"},
       {"node_id": "node1", "status": "completed"}
     ],
     "progress": {
       "total": 2,
       "completed": 2,
       "failed": 0
     }
   }
   ```

**Stop Everything:**
```powershell
# Stop worker service: Ctrl+C in Terminal 2
# Stop API server: Ctrl+C in Terminal 3
# Stop infrastructure:
docker-compose -f docker-compose.distributed.yml down
```

---

## 📚 Key Files Reference

- **Migration:** `worker/migrations/001_distributed_workflow_engine.sql`
- **API Endpoint:** `worker/src/api/distributed-execute-workflow.ts`
- **Worker Service:** `worker/src/services/workflow-executor/distributed/worker-service.ts`
- **Orchestrator:** `worker/src/services/workflow-executor/distributed/distributed-orchestrator.ts`
- **Documentation:** `worker/DISTRIBUTED_WORKFLOW_ENGINE.md`

---

## ✅ Checklist

Before you start, make sure you have:

- [ ] Supabase account and database access
- [ ] Docker installed (for local testing)
- [ ] Node.js and npm installed
- [ ] `.env` file configured
- [ ] Database migration run successfully

**Current Status:**
- [x] Dependencies installed
- [ ] Database migration run
- [ ] Environment variables configured
- [ ] Infrastructure started (optional)
- [ ] Worker service started
- [ ] API server started
- [ ] System tested

---

## 🆘 Need Help?

If you're stuck:

1. **Check the logs** - Look at the terminal output for error messages
2. **Check the documentation** - See `DISTRIBUTED_WORKFLOW_ENGINE.md`
3. **Verify configuration** - Double-check your `.env` file
4. **Test components individually** - Test queue, database, storage separately

---

## 🎉 Success!

Once you see:
- ✅ Worker service running and listening for jobs
- ✅ API server running and responding
- ✅ Test workflow execution returns an execution_id
- ✅ Execution status endpoint shows progress
- ✅ Workflow execution completes successfully

**You're ready to use the distributed workflow engine!** 🚀

## 📖 What's Next?

Now that your system is working, check out:

1. **`QUICK_START.md`** - Daily usage guide and common commands
2. **`DISTRIBUTED_WORKFLOW_ENGINE.md`** - Technical architecture details
3. **`IMPLEMENTATION_SUMMARY.md`** - What was built and how it works

### **Quick Reference:**

**Start Everything:**
```powershell
# Terminal 1: Worker Service
cd worker
npm run dev:worker

# Terminal 2: API Server  
cd worker
npm run dev
```

**Execute Workflow:**
```powershell
$body = @{ workflowId = "my-first-workflow"; input = @{ message = "Hello!" } } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/distributed-execute-workflow" -Method POST -ContentType "application/json" -Body $body
```

**Check Status:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/execution-status/EXECUTION_ID" | ConvertTo-Json
```

**Retry Stuck Execution:**
```powershell
cd worker
npm run retry-execution EXECUTION_ID
```
