# Credential Discovery Fix

## Problem

Credential discovery was incorrectly treating configuration fields like `maxTokens` as credentials. Credentials should only be API keys, OAuth tokens, and authentication tokens - not configuration parameters.

## Solution

Updated credential detection logic to:
1. **Exclude configuration fields** (maxTokens, temperature, model, etc.)
2. **Only detect actual credentials** (API keys, OAuth, tokens)
3. **Stricter token field matching** (exclude maxTokens, max_tokens)

## Rules Implemented

✅ **Credentials = API keys / OAuth / tokens only**
✅ **maxTokens is configuration, not credential**
✅ **Updated credential detection logic**

## Changes Made

### 1. Updated `credential-discovery-phase.ts`

**File**: `worker/src/services/ai/credential-discovery-phase.ts`

**Before**:
```typescript
const isCredentialField = fieldLower.includes('apikey') || 
                         fieldLower.includes('api_key') ||
                         // ...
                         (fieldLower.includes('token') && !fieldLower.includes('message')) ||
                         // ...
```

**Problem**: The condition `(fieldLower.includes('token') && !fieldLower.includes('message'))` would match `maxTokens` because:
- `maxTokens.toLowerCase()` includes "token" ✅
- `maxTokens.toLowerCase()` doesn't include "message" ✅
- Result: `maxTokens` incorrectly identified as credential ❌

**After**:
```typescript
// ✅ FIXED: Exclude configuration fields (not credentials)
// Configuration fields: maxTokens, max_tokens, temperature, model, etc.
const isConfigurationField = fieldLower === 'maxtokens' ||
                            fieldLower === 'max_tokens' ||
                            fieldLower === 'max-tokens' ||
                            fieldLower === 'temperature' ||
                            fieldLower === 'model' ||
                            fieldLower === 'baseurl' ||
                            fieldLower === 'base_url' ||
                            fieldLower === 'timeout' ||
                            fieldLower === 'retries' ||
                            fieldLower === 'stream' ||
                            fieldLower === 'cache' ||
                            fieldLower === 'prompt' ||
                            fieldLower === 'system' ||
                            fieldLower === 'top_p' ||
                            fieldLower === 'frequency_penalty' ||
                            fieldLower === 'presence_penalty';

if (isConfigurationField) {
  // Skip configuration fields - these are not credentials
  continue;
}

// ✅ FIXED: Check if this is a credential field
// Credentials = API keys / OAuth / tokens only
// Exclude configuration fields like maxTokens
const isCredentialField = fieldLower.includes('apikey') || 
                         fieldLower.includes('api_key') ||
                         // ...
                         // ✅ FIXED: Only match token fields that are actual credentials
                         // Exclude maxTokens, max_tokens, etc. (already excluded above)
                         (fieldLower.includes('token') && 
                          !fieldLower.includes('message') && 
                          !fieldLower.includes('max')) ||
                         // ...
```

**Key Changes**:
1. ✅ Added explicit exclusion list for configuration fields
2. ✅ Skip configuration fields before credential detection
3. ✅ Updated token matching to exclude "max" (catches maxTokens, max_tokens)
4. ✅ Only detect actual credentials: API keys, OAuth, tokens

## Configuration Fields Excluded

The following fields are now correctly excluded from credential detection:

- `maxTokens` / `max_tokens` / `max-tokens` - Token limit configuration
- `temperature` - Model temperature setting
- `model` - Model name/identifier
- `baseURL` / `base_url` - API base URL
- `timeout` - Request timeout
- `retries` - Retry count
- `stream` - Streaming flag
- `cache` - Caching flag
- `prompt` - Prompt text
- `system` - System prompt
- `top_p` - Top-p sampling parameter
- `frequency_penalty` - Frequency penalty
- `presence_penalty` - Presence penalty

## Credential Fields Detected

The following fields are correctly identified as credentials:

- `apiKey` / `api_key` / `api-key` - API keys
- `apiToken` / `api_token` - API tokens
- `accessToken` / `access_token` - OAuth access tokens
- `refreshToken` / `refresh_token` - OAuth refresh tokens
- `secret` - Secrets
- `password` - Passwords
- `credentialId` / `credential_id` - Credential identifiers
- `webhook` - Webhook URLs
- `oauth` - OAuth configuration
- `client_id` - OAuth client ID
- `client_secret` - OAuth client secret
- `bearer` - Bearer tokens
- `authorization` - Authorization headers

## Benefits

1. **Accurate Detection**: Only actual credentials are detected
2. **No False Positives**: Configuration fields like `maxTokens` are excluded
3. **Clear Separation**: Configuration vs credentials is explicit
4. **Better UX**: Users aren't asked for configuration as credentials

## Verification

✅ `maxTokens` is excluded from credential detection
✅ `max_tokens` is excluded from credential detection
✅ Configuration fields are skipped before credential check
✅ Token matching excludes "max" to prevent false positives
✅ Only actual credentials (API keys, OAuth, tokens) are detected

## Code Location

**File**: `worker/src/services/ai/credential-discovery-phase.ts`
**Method**: `discoverNodeCredentials()` (line ~252)
**Change**: Added configuration field exclusion and updated token matching logic
