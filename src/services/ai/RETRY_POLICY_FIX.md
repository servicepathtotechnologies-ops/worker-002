# ProductionWorkflowBuilder Retry Policy Fix

## Problem

The retry policy was retrying on structural failures (missing nodes, invalid DSL, validation failures), causing unnecessary retry loops and delays.

## Solution

Implemented a strict retry policy that:
- **Retries ONLY** on network/provider/temporary execution failures
- **Fails fast** on structural failures (no retry)

## Retry Policy

### Retryable Errors (Will Retry)

These errors indicate temporary issues that may resolve on retry:

1. **Network Errors**:
   - `network`, `timeout`, `connection`, `econnrefused`, `enotfound`, `etimedout`, `econnreset`

2. **Provider Errors**:
   - `provider`, `rate limit`, `service unavailable`, `503`, `502`, `504`, `429`

3. **Temporary Execution Failures**:
   - `temporary`, `retry`

### Non-Retryable Errors (Fail Fast)

These errors indicate structural issues that won't resolve on retry:

1. **Missing Nodes**:
   - `missing node`, `required node`, `unknown node`, `hallucinated`

2. **Invalid DSL**:
   - `invalid dsl`, `pipeline contract`, `pre-compilation`

3. **Validation Failures**:
   - `validation failure`, `type validation`, `schema validation`, `compilation failed`

4. **Structural Failures**:
   - `invariant violation`, `missing transformation`, `missing output`, `invalid node type`, `structural failure`

5. **Connection Failures**:
   - `cannot resolve`, `no compatible handles`

## Implementation

### Helper Method: `isRetryableError()`

```typescript
private isRetryableError(error: string | Error): boolean {
  const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : String(error));
  const errorLower = errorMessage.toLowerCase();
  
  // Non-retryable patterns (checked first)
  const nonRetryablePatterns = [
    'missing node', 'invalid dsl', 'validation failure', 'pipeline contract',
    'invariant violation', 'required node', 'missing transformation', ...
  ];
  
  // Retryable patterns
  const retryablePatterns = [
    'network', 'timeout', 'connection', 'provider', 'rate limit', ...
  ];
  
  // Check non-retryable first
  if (nonRetryablePatterns.some(pattern => errorLower.includes(pattern))) {
    return false;
  }
  
  // Check retryable
  return retryablePatterns.some(pattern => errorLower.includes(pattern));
}
```

### Updated Retry Logic

#### 1. DSL Compilation Failures

```typescript
if (!dslCompilationResult.success || !dslCompilationResult.workflow) {
  const isRetryable = dslCompilationResult.errors.some(e => this.isRetryableError(e));
  
  if (isRetryable && attempt < maxRetries) {
    console.log('Retrying DSL compilation (retryable error)...');
    continue;
  }
  
  // Structural failure - fail fast
  console.error('DSL compilation failed with structural error - NOT retrying');
  return { success: false, ... };
}
```

#### 2. Type Validation Failures

```typescript
if (!typeValidation.valid) {
  // Type validation failure is structural - do not retry, fail fast
  console.error('Type validation failure is structural - NOT retrying');
  return { success: false, ... };
}
```

#### 3. Final Validation Failures

```typescript
if (!finalValidation.valid) {
  const isRetryable = finalValidation.errors.some(e => this.isRetryableError(e));
  
  if (isRetryable && attempt < maxRetries) {
    console.log('Retrying due to retryable error...');
    continue;
  }
  
  // Structural failure - fail fast
  console.error('Final validation failed with structural error - NOT retrying');
  return { success: false, ... };
}
```

#### 4. Exception Handling

```typescript
catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  
  if (error instanceof PipelineContractError) {
    // Pipeline contract violation - structural failure, do not retry
    return { success: false, ... };
  }
  
  const isRetryable = this.isRetryableError(errorMessage);
  
  if (isRetryable && attempt < maxRetries) {
    console.log('Retrying after retryable error...');
    continue;
  }
  
  // Structural failure - fail fast
  console.error('Structural failure - NOT retrying');
}
```

## Benefits

1. **Faster Failure Detection**: Structural failures fail immediately without retry loops
2. **Reduced Latency**: No wasted time retrying operations that will never succeed
3. **Better Error Messages**: Users get immediate feedback on structural issues
4. **Resource Efficiency**: No unnecessary retries consuming resources
5. **Deterministic Behavior**: Same structural error always fails fast

## Error Classification Examples

### Retryable (Will Retry)
- ✅ "Network timeout"
- ✅ "Connection refused"
- ✅ "Provider rate limit exceeded"
- ✅ "Service temporarily unavailable (503)"
- ✅ "Gateway timeout (504)"

### Non-Retryable (Fail Fast)
- ❌ "Missing required node: text_summarizer"
- ❌ "Invalid DSL: transformation missing"
- ❌ "Pipeline contract violation: DSL has 0 transformations"
- ❌ "Type validation failed: incompatible types"
- ❌ "Invariant violation: required nodes not in workflow"
- ❌ "Cannot resolve compatible handles between nodes"

## Testing

To test the retry policy:

1. **Test Retryable Errors**:
   ```typescript
   // Simulate network error
   // Should retry up to maxRetries
   ```

2. **Test Non-Retryable Errors**:
   ```typescript
   // Simulate missing node error
   // Should fail fast without retry
   ```

3. **Test Mixed Errors**:
   ```typescript
   // If any error is structural, should fail fast
   // If all errors are retryable, should retry
   ```

## Summary

The retry policy now:
- ✅ Retries ONLY on network/provider/temporary execution failures
- ✅ Fails fast on structural failures (missing nodes, invalid DSL, validation failures)
- ✅ Provides clear error messages for structural issues
- ✅ Reduces latency by avoiding unnecessary retries
- ✅ Ensures deterministic behavior

Structural failures must fail fast - no retry loops.
