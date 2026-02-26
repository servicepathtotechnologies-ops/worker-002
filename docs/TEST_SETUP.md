# Test Setup Guide

## Prerequisites

### Required
- Node.js and npm installed
- TypeScript installed (`npm install -g typescript ts-node` or use npx)
- Ollama running locally (for AI model calls) - default: `http://localhost:11434`

### Optional (for full testing)
- Supabase credentials (only needed for credential discovery, not for basic workflow generation testing)
  - The test script uses `AgenticWorkflowBuilder` directly, which doesn't require Supabase
  - If you want to test credential discovery, you'll need Supabase configured

## Quick Start

### 1. Start Ollama (if not running)
```bash
# Make sure Ollama is running on localhost:11434
ollama serve
```

### 2. Run Tests
```bash
cd worker
npm run test:workflows:high
```

## Environment Variables

The test script works without Supabase for basic workflow generation testing. However, if you want to test the full lifecycle (including credential discovery), you'll need:

```env
# .env file in worker directory
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Note**: The test script (`test-workflow-generation.ts`) only uses `AgenticWorkflowBuilder`, which doesn't require Supabase. It tests workflow generation, node selection, and structure validation without needing database access.

## Troubleshooting

### Error: "Supabase configuration invalid"
**Solution**: This error occurs if `WorkflowLifecycleManager` is used. The test script has been updated to use `AgenticWorkflowBuilder` directly, which doesn't require Supabase. If you see this error, make sure you're using the latest version of the test script.

### Error: "Ollama connection failed"
**Solution**: Make sure Ollama is running:
```bash
ollama serve
# Or check if it's running on a different port
```

### Error: "Cannot find module"
**Solution**: Install dependencies:
```bash
cd worker
npm install
```

## What Gets Tested

The test script validates:
- ✅ Workflow generation from prompts
- ✅ Node type selection
- ✅ Workflow structure (nodes, edges, connections)
- ✅ Expected nodes are generated
- ✅ No orphan nodes
- ✅ Proper data flow

**What's NOT tested** (requires Supabase):
- ❌ Credential discovery
- ❌ Vault checking
- ❌ Full workflow lifecycle

For basic workflow generation testing, Supabase is not required.

## Running Specific Tests

```bash
# High priority tests only
npm run test:workflows:high

# By category
npm run test:workflows:triggers
npm run test:workflows:logic
npm run test:workflows:crm

# All tests
npm run test:workflows
```

## Test Output

The test script generates:
1. **Console output** - Real-time test progress
2. **Test report file** - Detailed results (default: `test-results.txt`)

Example output:
```
🧪 Running test: Webhook Trigger with HubSpot (trigger-001)
   Prompt: When I receive a POST request to my webhook endpoint...
   ✅ PASSED (1234ms)
```

## Next Steps

1. Run high priority tests: `npm run test:workflows:high`
2. Review generated workflows
3. Fix any issues found
4. Expand to full test suite
