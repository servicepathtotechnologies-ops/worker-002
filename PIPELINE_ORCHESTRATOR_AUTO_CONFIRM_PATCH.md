# PipelineOrchestrator Auto-Confirm Expanded Intent Patch

## Issue

**Current Behavior:**
- When intent similarity is low or incomplete, system expands prompt using `IntentAutoExpander`
- After expansion, `PipelineOrchestrator` still requires user confirmation and blocks workflow generation
- This creates unnecessary friction when auto-expansion is enabled

**Desired Behavior:**
- If intent is auto-expanded successfully, treat expanded intent as confirmed
- Do not block workflow generation after expansion
- Skip confirmation stage when auto expansion is enabled
- Add config flag: `AUTO_CONFIRM_EXPANDED_INTENT=true`

## Flow Change

### Before
```
low similarity → expand intent → requires_confirmation=true → BLOCK → wait for user confirmation
```

### After
```
low similarity → expand intent → AUTO_CONFIRM_EXPANDED_INTENT=true → validate → generate workflow
```

## Implementation

### File Modified
`worker/src/services/ai/workflow-pipeline-orchestrator.ts`

### Changes

1. **Added Configuration Flag** (Line 28):
```typescript
// Configuration: Auto-confirm expanded intents
const AUTO_CONFIRM_EXPANDED_INTENT = process.env.AUTO_CONFIRM_EXPANDED_INTENT === 'true';
```

2. **Updated Intent Expansion Logic** (Lines 139-161):
```typescript
// ✅ NEW BEHAVIOR: Auto-confirm expanded intents if flag is enabled
if (expandedIntent && expandedIntent.requires_confirmation) {
  if (AUTO_CONFIRM_EXPANDED_INTENT) {
    console.log(`[PipelineOrchestrator] ✅ Auto-confirming expanded intent (AUTO_CONFIRM_EXPANDED_INTENT=true)`);
    console.log(`[PipelineOrchestrator]   Expanded intent: ${expandedIntent.expanded_intent.substring(0, 100)}...`);
    warnings.push(`Intent was auto-expanded and confirmed: ${expandedIntent.expanded_intent.substring(0, 150)}...`);
    // Continue with workflow generation - treat expanded intent as confirmed
  } else {
    // Original behavior: require user confirmation
    console.log(`[PipelineOrchestrator] ⚠️  Intent requires confirmation before workflow generation`);
    console.log(`[PipelineOrchestrator]   Expanded intent: ${expandedIntent.expanded_intent.substring(0, 100)}...`);
    return {
      success: false,
      structuredIntent,
      errors: [],
      warnings: ['Workflow generation requires confirmation due to abstract prompt or low similarity'],
      expandedIntent,
    };
  }
}
```

3. **Added expandedIntent to Return Values**:
- Added `expandedIntent` to all return statements to preserve expansion information

## Configuration

### Environment Variable
```bash
AUTO_CONFIRM_EXPANDED_INTENT=true
```

### Default Behavior
- **Default**: `false` (backward compatible - requires confirmation)
- **When `true`**: Auto-confirms expanded intents and continues workflow generation

## Logic Explanation

### Step-by-Step Flow

1. **STEP 1.7: Intent Auto Expander**
   - Checks if prompt needs expansion (abstract, incomplete, or low similarity)
   - If expansion needed, generates expanded interpretation
   - Returns `ExpandedIntent` with `requires_confirmation: true`

2. **Auto-Confirm Check**
   - If `expandedIntent.requires_confirmation === true`:
     - **If `AUTO_CONFIRM_EXPANDED_INTENT === true`**:
       - Log auto-confirmation
       - Add warning about auto-expansion
       - **Continue to STEP 2** (workflow structure building)
     - **If `AUTO_CONFIRM_EXPANDED_INTENT === false`** (default):
       - Return early with `success: false`
       - Include `expandedIntent` in response
       - **Block workflow generation** (original behavior)

3. **Continue Pipeline**
   - STEP 2: Build workflow structure
   - STEP 2.5: Pattern-based repair
   - STEP 3: Detect credentials
   - STEP 4: Inject credentials
   - STEP 5: Policy enforcement
   - STEP 6: AI validator

## Benefits

1. **Reduced Friction**: When auto-expansion is enabled, users don't need to manually confirm
2. **Backward Compatible**: Default behavior unchanged (requires confirmation)
3. **Configurable**: Can be enabled/disabled via environment variable
4. **Transparent**: Logs and warnings indicate when auto-confirmation occurs
5. **Preserves Context**: `expandedIntent` is included in all return values for debugging/UX

## Testing

### Test Case 1: Auto-Confirm Enabled
```bash
AUTO_CONFIRM_EXPANDED_INTENT=true
```
**Input**: Abstract prompt (e.g., "recruitment workflow")
**Expected**: 
- Intent expanded
- Auto-confirmed
- Workflow generated without blocking

### Test Case 2: Auto-Confirm Disabled (Default)
```bash
AUTO_CONFIRM_EXPANDED_INTENT=false  # or unset
```
**Input**: Abstract prompt (e.g., "recruitment workflow")
**Expected**: 
- Intent expanded
- Returns early with `success: false`
- Requires user confirmation

### Test Case 3: No Expansion Needed
**Input**: Concrete prompt (e.g., "Read Google Sheets, send email")
**Expected**: 
- No expansion
- Normal workflow generation
- No confirmation needed

## Migration Notes

- **Default**: No breaking changes (requires confirmation by default)
- **To Enable**: Set `AUTO_CONFIRM_EXPANDED_INTENT=true` in environment
- **Frontend**: May need to handle `expandedIntent` in response for UX display

## Related Files

- `worker/src/services/ai/intent-auto-expander.ts` - Generates expanded intents
- `worker/src/services/ai/workflow-pipeline-orchestrator.ts` - Main orchestrator (modified)
