-- ============================================
-- Fixed Setup Script for Supabase
-- This version handles existing tables and uses separate table names
-- ============================================

-- Step 1: Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Create memory_workflows table (separate from existing workflows table)
-- This avoids conflicts with your existing workflows table
CREATE TABLE IF NOT EXISTS memory_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    definition JSONB NOT NULL,
    tags JSONB DEFAULT '[]'::jsonb,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}'::jsonb
);

-- Step 3: Create memory_executions table
CREATE TABLE IF NOT EXISTS memory_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES memory_workflows(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    input_data JSONB,
    result_data JSONB,
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    execution_time INTEGER,
    error_message TEXT,
    context JSONB DEFAULT '{}'::jsonb
);

-- Step 4: Create memory_node_executions table
CREATE TABLE IF NOT EXISTS memory_node_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES memory_executions(id) ON DELETE CASCADE,
    node_id VARCHAR(100) NOT NULL,
    node_type VARCHAR(100) NOT NULL,
    input_data JSONB,
    output_data JSONB,
    status VARCHAR(50) NOT NULL,
    error TEXT,
    duration INTEGER,
    sequence INTEGER NOT NULL,
    metadata JSONB
);

-- Step 5: Create memory_references table
CREATE TABLE IF NOT EXISTS memory_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES memory_workflows(id) ON DELETE CASCADE,
    reference_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_memory_workflows_is_active ON memory_workflows(is_active);
CREATE INDEX IF NOT EXISTS idx_memory_workflows_created_at ON memory_workflows(created_at);
CREATE INDEX IF NOT EXISTS idx_memory_workflows_updated_at ON memory_workflows(updated_at);

CREATE INDEX IF NOT EXISTS idx_memory_executions_workflow_id ON memory_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_memory_executions_status ON memory_executions(status);
CREATE INDEX IF NOT EXISTS idx_memory_executions_started_at ON memory_executions(started_at);

CREATE INDEX IF NOT EXISTS idx_memory_node_executions_execution_id ON memory_node_executions(execution_id);
CREATE INDEX IF NOT EXISTS idx_memory_node_executions_node_id ON memory_node_executions(node_id);
CREATE INDEX IF NOT EXISTS idx_memory_node_executions_sequence ON memory_node_executions(sequence);

CREATE INDEX IF NOT EXISTS idx_memory_references_workflow_id ON memory_references(workflow_id);
CREATE INDEX IF NOT EXISTS idx_memory_references_reference_type ON memory_references(reference_type);
CREATE INDEX IF NOT EXISTS idx_memory_references_created_at ON memory_references(created_at);

-- Step 7: Create vector similarity search index
CREATE INDEX IF NOT EXISTS idx_memory_references_embedding ON memory_references 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- Verification Queries (run separately to verify)
-- ============================================

-- Check tables were created:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
--   AND table_name LIKE 'memory_%'
-- ORDER BY table_name;

-- Check pgvector extension:
-- SELECT * FROM pg_extension WHERE extname = 'vector';

-- ============================================
-- Done! Now update Prisma schema to use these table names
-- ============================================
