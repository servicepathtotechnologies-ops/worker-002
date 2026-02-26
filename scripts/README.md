# Test Data Generation Scripts

Generate 300+ sample execution records for testing the enterprise architecture.

---

## 📋 Available Scripts

### 1. **TypeScript Generator** (`generate-test-data.ts`)

**Usage:**
```bash
cd worker
npm install  # If not already installed
npx ts-node scripts/generate-test-data.ts
```

**Features:**
- Creates 300 executions
- Generates node execution steps
- Includes large payloads (every 10th execution)
- Includes failed nodes (every 20th execution)
- Includes resume test cases (every 30th execution)

### 2. **SQL Generator** (`generate-test-data-sql.sql`)

**Usage:**
1. Open Supabase SQL Editor
2. Copy and paste `generate-test-data-sql.sql`
3. Execute

**Features:**
- Pure SQL (no dependencies)
- Creates 300 executions
- Generates all node steps
- Includes test cases for all scenarios

### 3. **Comprehensive Test Data Generator** (`generate-comprehensive-test-data.ts`) ⭐ **NEW**

**Usage:**
```bash
cd worker
npm run test-data:comprehensive
# OR
npx ts-node scripts/generate-comprehensive-test-data.ts
```

**Features:**
- **300+ workflow scenarios** covering all node types
- **Full pipeline coverage**: User prompt → Analysis questions → Final prompt → Workflow → Credentials → Execution
- **All major node categories**: Triggers, AI, Communication, Google, Database, Logic, Data, HTTP, CRM, Social Media
- **Realistic credential requirements** for each node type
- **Diverse workflow patterns**: Email workflows, AI analysis, data sync, conditional logic, social media, CRM, etc.
- **Perfect for AI model training** - covers complete workflow generation process

**What it generates:**
- 10 base workflow patterns × 30 variations = 300 workflows
- Each workflow includes:
  - User prompt (natural language)
  - Analysis questions (clarifying questions)
  - Final prompt (refined system prompt)
  - Complete node definitions with configs
  - Required credentials for each node
  - Execution input/output examples
  - Full workflow structure (nodes + edges)

**Use cases:**
- Training AI workflow generation models
- Testing workflow generation pipeline
- Validating credential collection flow
- Testing node selection accuracy
- Benchmarking workflow generation quality

### 4. **Verification Script** (`verify-test-data.ts`)

**Usage:**
```bash
npx ts-node scripts/verify-test-data.ts
```

**Features:**
- Verifies data was created correctly
- Checks execution counts
- Verifies step_outputs aggregates
- Checks for large payload references
- Shows data distribution

---

## 📊 Generated Data Structure

### Executions (300 total)

- **Success:** ~285 executions
- **Failed:** ~15 executions (every 20th)
- **Running (Resume Test):** ~10 executions (every 30th)

### Execution Steps (5 nodes per execution)

- **Node 1:** text_formatter
- **Node 2:** chat_model
- **Node 3:** if_else
- **Node 4:** set_variable (large payload every 10th execution)
- **Node 5:** http_request

### Special Cases

- **Large Payloads:** Every 10th execution has node-4 with object storage reference
- **Failed Nodes:** Every 20th execution has node-3 failed
- **Resume Tests:** Every 30th execution stops at node-3 (status: 'running')

---

## 🧪 Testing Scenarios

### 1. **Basic Persistence Test**
```sql
-- Check if node outputs are persisted
SELECT 
    execution_id,
    node_id,
    output_json
FROM execution_steps
WHERE execution_id = '...'
ORDER BY sequence;
```

### 2. **Resume Test**
```sql
-- Find running executions (for resume testing)
SELECT 
    id,
    current_node,
    step_outputs
FROM executions
WHERE status = 'running'
LIMIT 10;
```

### 3. **Large Payload Test**
```sql
-- Find executions with object storage references
SELECT 
    execution_id,
    node_id,
    output_json->>'_storage' as storage_type,
    output_json->>'_key' as storage_key
FROM execution_steps
WHERE output_json->>'_storage' = 's3'
LIMIT 10;
```

### 4. **Failed Node Test**
```sql
-- Find executions with failed nodes
SELECT 
    execution_id,
    node_id,
    status,
    error
FROM execution_steps
WHERE status = 'failed'
LIMIT 10;
```

---

## 📝 Sample Queries

### Get Execution with All Steps
```sql
SELECT 
    e.id,
    e.status,
    e.current_node,
    e.step_outputs,
    COUNT(es.id) as step_count
FROM executions e
LEFT JOIN execution_steps es ON es.execution_id = e.id
WHERE e.id = 'your-execution-id'
GROUP BY e.id, e.status, e.current_node, e.step_outputs;
```

### Get All Node Outputs for Execution
```sql
SELECT 
    node_id,
    node_name,
    output_json,
    status,
    sequence
FROM execution_steps
WHERE execution_id = 'your-execution-id'
ORDER BY sequence;
```

### Find Resume Candidates
```sql
SELECT 
    id,
    workflow_id,
    current_node,
    step_outputs,
    started_at
FROM executions
WHERE status = 'running'
AND current_node IS NOT NULL
ORDER BY started_at DESC
LIMIT 10;
```

---

## ✅ Verification Checklist

After generating data, verify:

- [ ] 300 executions created
- [ ] ~1500 execution steps (5 nodes × 300 executions)
- [ ] ~30 large payload references
- [ ] ~15 failed executions
- [ ] ~10 resume test executions
- [ ] step_outputs populated in executions table
- [ ] current_node set correctly

---

## 🚀 Quick Start

### Option 1: Comprehensive Test Data (For AI Training) ⭐ **RECOMMENDED**
```bash
cd worker
npm run test-data:comprehensive
```
Generates 300+ workflows covering all node types and the full generation pipeline.

### Option 2: SQL (Fastest - Basic Test Data)
```sql
-- Copy generate-test-data-sql.sql to Supabase SQL Editor
-- Execute
-- Done! ✅
```

### Option 3: TypeScript (More Control - Basic Test Data)
```bash
cd worker
npx ts-node scripts/generate-test-data.ts
```

### Verify
```bash
npx ts-node scripts/verify-test-data.ts
```

---

## 📊 Expected Results

After generation, you should have:

- ✅ **300 executions** in `executions` table
- ✅ **~1500 steps** in `execution_steps` table
- ✅ **~30 large payloads** (object storage references)
- ✅ **~15 failed executions** (for error handling tests)
- ✅ **~10 resume candidates** (status: 'running')

---

**Ready to generate test data!** 🚀
