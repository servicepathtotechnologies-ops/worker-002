# Test Run Instructions

## Running the Comprehensive Validation Test

### Prerequisites

1. **Ollama Service**: The test requires Ollama to be running. You can either:
   - Use the default localhost endpoint: `http://localhost:11434`
   - Use a custom endpoint by setting environment variables

### Custom Ollama Endpoint

If your Ollama service is running on a different endpoint (e.g., `http://ollama.ctrlchecks.ai:8000`), you can set it in one of two ways:

#### Option 1: Environment Variable (Recommended)
```bash
# Windows PowerShell
$env:OLLAMA_BASE_URL="http://ollama.ctrlchecks.ai:8000"
cd worker
npx ts-node scripts/test-validation-comprehensive.ts

# Linux/Mac
export OLLAMA_BASE_URL="http://ollama.ctrlchecks.ai:8000"
cd worker
npx ts-node scripts/test-validation-comprehensive.ts
```

#### Option 2: Modify Test Script
The test script automatically uses `http://ollama.ctrlchecks.ai:8000` as default if no environment variable is set. You can modify line 11-12 in `test-validation-comprehensive.ts`:

```typescript
process.env.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama.ctrlchecks.ai:8000';
process.env.VITE_OLLAMA_BASE_URL = process.env.VITE_OLLAMA_BASE_URL || 'http://ollama.ctrlchecks.ai:8000';
```

### Running the Test

```bash
cd worker
npx ts-node scripts/test-validation-comprehensive.ts
```

### Expected Output

The test will:
1. Display the Ollama endpoint being used
2. Run 9 test cases (3 simple, 3 complex, 3 ambiguous)
3. Validate each workflow for:
   - Duplicate nodes
   - Correct ordering (DAG structure)
   - Expected nodes present
   - Trigger and output nodes
4. Calculate accuracy metrics
5. Report success/failure

### Success Criteria

- ✅ Accuracy >= 90%
- ✅ No duplicate nodes
- ✅ Valid ordering (no cycles)
- ✅ Good error handling (< 20% failures)

### Troubleshooting

**Connection Errors (ECONNREFUSED)**
- Ensure Ollama service is running
- Check the endpoint URL is correct
- Verify network connectivity to the endpoint
- The test will clearly indicate connection issues vs code issues

**Test Failures**
- Review the error messages for each test case
- Check if expected nodes are being found
- Verify workflow structure is correct

### Notes

- The test includes a 1-second delay between tests to avoid overwhelming the system
- Connection errors are handled gracefully and reported separately from code errors
- Accuracy is calculated only for tests that successfully run (excluding connection errors)
