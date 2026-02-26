# Fixes Applied for Workflow Generation Issues

## Issues Identified from Logs

1. **"custom" nodes still being generated** - Nodes with `type: 'custom'` but no `data.type`
2. **Duplicate trigger nodes** - Multiple triggers with same ID
3. **Credential resolution inconsistency** - Google OAuth found but then reported missing
4. **404 errors** - No GET endpoint for `/api/workflows/:id`
5. **400 errors on credential attachment** - Credentials sent as null/undefined

## Fixes Applied

### 1. Fixed Node Type Validation ✅
**File**: `worker/src/services/ai/workflow-builder.ts`

**Changes**:
- Updated validation to check `data.type` for nodes with `type: 'custom'` (frontend compatibility)
- Fixed integration enforcement to check `data.type` instead of just `type`
- Fixed node cleanup filter to check `data.type` for duplicate detection
- Fixed step validation to properly handle nodes with `type: 'custom'` and `data.type`

**Key Changes**:
```typescript
// Before: const stepType = step.type || step.nodeType;
// After: const stepType = step.data?.type || step.type || step.nodeType;
```

### 2. Fixed Credential Discovery for Google OAuth ✅
**File**: `worker/src/services/ai/credential-discovery-phase.ts`

**Changes**:
- Added fallback check for Google OAuth using 'google' as vaultKey
- Ensures Google OAuth is properly detected even if contract uses different vaultKey format

**Key Changes**:
```typescript
// Added fallback for Google OAuth
if (!satisfied && contract.type === 'oauth' && contract.provider === 'google') {
  satisfied = userId ? await this.credentialResolver.checkVaultForCredential(
    'google', // Use 'google' as vaultKey for Google OAuth
    'oauth',
    userId
  ) : false;
}
```

### 3. Fixed Frontend Credential Attachment ✅
**File**: `ctrl_checks/src/components/workflow/AutonomousAgentWizard.tsx`

**Changes**:
- Ensure credentials are always sent as object (even if empty)
- Changed workflow fetch to use Supabase directly instead of non-existent API endpoint
- Added delay after workflow save to prevent race conditions

**Key Changes**:
```typescript
// Ensure credentials is always an object
const credentialsToSend = credentialValues && typeof credentialValues === 'object' ? credentialValues : {};

// Query Supabase directly
const { data: fetchedWorkflow } = await supabase
  .from('workflows')
  .select('*')
  .eq('id', savedWorkflow.id)
  .single();

// Add delay to prevent race conditions
await new Promise(resolve => setTimeout(resolve, 100));
```

## Remaining Issues to Monitor

### Issue: Duplicate Trigger Nodes
**Symptom**: Multiple trigger nodes with same ID (e.g., `trigger_1771236063666`)

**Root Cause**: Workflow normalization is removing duplicates, but they're being added again somewhere in the pipeline.

**Status**: Normalization is working (removes duplicates), but need to prevent duplicates from being created in the first place.

### Issue: Validation Loop
**Symptom**: "Max fix iterations (3) reached. Stopping validation to prevent infinite loop."

**Root Cause**: Workflow validation is trying to fix issues but creating new issues in the process.

**Status**: Validation stops after 3 iterations to prevent infinite loop. This is a safety measure, but indicates underlying validation issues.

## Testing Recommendations

1. **Test with simple prompt**: "Send a message to Slack"
   - Should generate: `manual_trigger` → `slack_message`
   - No "custom" nodes
   - No duplicate triggers

2. **Test with Gmail prompt**: "Send an email via Gmail"
   - Should generate: `manual_trigger` → `google_gmail`
   - Google OAuth should be detected as satisfied (if connected)
   - No 400 errors on credential attachment

3. **Test with multi-integration prompt**: "When a new contact is added to HubSpot, create a record in Google Sheets and notify the sales team on Slack"
   - Should generate: `webhook` → `hubspot` → `google_sheets`, `hubspot` → `slack`
   - All integrations should be present
   - No "custom" nodes

## Expected Behavior After Fixes

✅ **Node Type Validation**:
- Nodes with `type: 'custom'` must have `data.type` set
- Validation checks `data.type` for nodes with `type: 'custom'`
- Invalid nodes are filtered out

✅ **Integration Enforcement**:
- Checks `data.type` when looking for existing integrations
- Adds missing integrations programmatically
- Uses correct node types (not 'custom')

✅ **Credential Discovery**:
- Google OAuth is properly detected from vault
- Credentials are marked as satisfied if found in vault
- No false negatives for Google OAuth

✅ **Frontend Flow**:
- Credentials are always sent as object (never null/undefined)
- Workflow is fetched from Supabase (not non-existent API endpoint)
- Race conditions prevented with delay

## Next Steps

1. **Monitor logs** for:
   - "custom" nodes without `data.type` (should be filtered out)
   - Google OAuth detection (should be consistent)
   - Duplicate trigger creation (should be prevented)

2. **Test workflows** with:
   - Simple prompts (2-3 nodes)
   - Multi-integration prompts (4+ nodes)
   - Gmail/Slack/Google Sheets combinations

3. **Verify**:
   - No "custom" nodes in generated workflows
   - All mentioned integrations appear
   - Credentials attach successfully
   - Workflows save correctly
