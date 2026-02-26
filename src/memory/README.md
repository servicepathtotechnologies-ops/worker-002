# n8n-Style Memory System

A comprehensive memory and reference system for AI workflow agents, inspired by n8n's architecture.

## Features

- **3-Tier Storage**: In-memory cache, PostgreSQL database, and file storage
- **Vector Search**: Semantic similarity search using embeddings
- **Execution Tracking**: Store and analyze workflow execution history
- **AI Context Building**: Structured context for workflow generation
- **Workflow Analysis**: Complexity analysis, dependency extraction, and optimization suggestions

## Architecture

### Storage Tiers

1. **Tier 1 (Volatile Memory)**: LRU cache for active workflows
2. **Tier 2 (Persistent Storage)**: PostgreSQL with Prisma ORM
3. **Tier 3 (File Storage)**: For large binary data and logs

### Core Components

- **MemoryManager**: Core memory operations (store/retrieve workflows, executions)
- **VectorStore**: Vector embeddings and similarity search
- **CacheManager**: LRU cache management
- **ReferenceBuilder**: Builds AI context from memory
- **WorkflowAnalyzer**: Analyzes workflow structure and provides insights

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

1. Ensure PostgreSQL is running with `pgvector` extension:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

2. Configure database connection in `.env`:
```
DATABASE_URL=postgresql://user:password@host:port/database
```

3. Run Prisma migrations:
```bash
npx prisma generate
npx prisma migrate dev
```

### 3. Configuration

Add to your `.env` file:
```
# Memory System
MEMORY_CACHE_SIZE=100
EXECUTION_RETENTION_DAYS=30
WORKFLOW_RETENTION_DAYS=365
ENABLE_VECTOR_SEARCH=true
EMBEDDING_MODEL=text-embedding-3-small
VECTOR_DIMENSIONS=1536
SIMILARITY_THRESHOLD=0.7

# Required for embeddings
OPENAI_API_KEY=your-openai-api-key
```

## API Endpoints

### Memory Management

- `POST /api/memory/store-workflow` - Store workflow with context
- `GET /api/memory/workflow/:id/context` - Get full context for AI
- `GET /api/memory/similar/:id` - Find similar workflows
- `POST /api/memory/search` - Semantic search workflows
- `GET /api/memory/cache/stats` - Get cache statistics
- `POST /api/memory/prune` - Prune old execution data

### Analysis

- `POST /api/analyze` - Analyze workflow structure
- `GET /api/analyze/:id/suggestions` - Get optimization suggestions

### Execution

- `POST /api/execute` - Execute and store execution data
- `GET /api/executions/:workflowId/stats` - Get execution statistics

## Usage Examples

### Store a Workflow

```typescript
import { getMemoryManager } from './memory';

const memoryManager = getMemoryManager();

const workflowId = await memoryManager.storeWorkflow({
  name: 'My Workflow',
  definition: {
    nodes: [...],
    edges: [...],
  },
  tags: ['automation', 'api'],
});
```

### Get AI Context

```typescript
import { getReferenceBuilder } from './memory';

const referenceBuilder = getReferenceBuilder();

const context = await referenceBuilder.buildContext(
  workflowId,
  'creation',
  'Create a workflow to send emails'
);
```

### Find Similar Workflows

```typescript
const similar = await memoryManager.findSimilarWorkflows(
  'Send email notification',
  5
);
```

### Analyze Workflow

```typescript
import { getWorkflowAnalyzer } from './memory';

const analyzer = getWorkflowAnalyzer();
const analysis = analyzer.analyze(workflowDefinition);

console.log('Complexity:', analysis.complexity);
console.log('Issues:', analysis.potentialIssues);
console.log('Suggestions:', analysis.optimizationSuggestions);
```

## Database Schema

The system uses the following tables:

- `workflows` - Workflow definitions
- `executions` - Execution records
- `node_executions` - Individual node execution data
- `memory_references` - Memory references with embeddings

See `prisma/schema.prisma` for full schema definition.

## Performance Considerations

- Cache size is configurable (default: 100 workflows)
- Vector search requires OpenAI API key
- Execution data is automatically pruned based on retention policy
- Batch embedding generation for better performance

## Monitoring

Cache statistics are available via `/api/memory/cache/stats` endpoint.

## Troubleshooting

1. **Vector search not working**: Ensure `OPENAI_API_KEY` is set and `ENABLE_VECTOR_SEARCH=true`
2. **Database connection errors**: Check `DATABASE_URL` in `.env`
3. **pgvector errors**: Ensure PostgreSQL has the `vector` extension installed
