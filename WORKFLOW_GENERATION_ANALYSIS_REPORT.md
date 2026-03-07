# Workflow Generation Analysis Report
## Issue: Prompts Unable to Create Workflows

**Date:** Generated from terminal logs analysis  
**Issue:** Workflow generation failing at prompt variation stage

---

## Problem Summary

The workflow generation is failing during the **prompt variation generation phase** (summarize layer). The AI generates variations, but they are being rejected by validation logic, causing the system to fall back to a single variation (the original prompt).

---

## Root Cause Analysis

### 1. **Validation Rejection Chain**

From terminal logs (lines 687-717):

```
[AIIntentClarifier] 🔍 Variation 1:
  - Length: 435 chars
  - Lines: 1 (❌)  <-- FAILING HERE
  - Contains user prompt: ✅ NO

[AIIntentClarifier] ⚠️  Variations not unique enough: only 1 different output nodes
[AIIntentClarifier] ⚠️ Attempt 1/3 failed: Invalid result: missing required fields or empty variations
[AIIntentClarifier] ❌ Non-retryable error, failing fast
[AIIntentClarifier] ❌ All attempts failed, using fallback
[Analyze Mode] ✅ Generated 1 prompt variations
[Analyze Mode] ⚠️ Only 1 variation generated (expected 3-4). AI may need better prompting.
```

### 2. **Three Validation Failures**

#### Failure #1: Single-Line Variations (Not 3-4 Sentences)
- **Location:** `summarize-layer.ts:273-280`
- **Requirement:** Variations must have 3-4 sentences OR 2+ lines OR (2 sentences AND 200+ chars)
- **Actual:** All 4 variations are single-line prompts (1 line each)
- **Why:** AI is generating JSON-formatted single-line strings instead of multi-sentence prompts

#### Failure #2: Not Unique Enough (Same Output Node)
- **Location:** `summarize-layer.ts:425-441`
- **Requirement:** At least 2 different output nodes across variations
- **Actual:** All variations use `google_gmail` as the only output node
- **Why:** For prompt "Read data from Google Sheets and send it via Gmail", there's only ONE logical output (Gmail), so uniqueness requirement cannot be satisfied

#### Failure #3: Non-Retryable Error
- **Location:** `summarize-layer.ts:333, 340-342`
- **Error:** "Invalid result: missing required fields or empty variations"
- **Classification:** Marked as non-retryable (line 375-378: "missing field" is non-retryable)
- **Result:** System fails fast without retrying, falls back to single variation

---

## Code Analysis

### Validation Logic Issues

**File:** `worker/src/services/ai/summarize-layer.ts`

#### Issue 1: Sentence Detection (Line 275)
```typescript
const sentences = v.prompt.split(/[.!?]+/).filter(s => s.trim().length > 10);
```
- **Problem:** AI generates single long sentences without periods
- **Example:** "Create a linear workflow automation that starts with manual_trigger to initiate the process. Use the..." (one sentence, no periods)

#### Issue 2: Uniqueness Check (Line 438)
```typescript
if (uniqueOutputs.size < 2 && result.promptVariations.length >= 2) {
  console.warn(`⚠️  Variations not unique enough: only ${uniqueOutputs.size} different output nodes`);
  return false;
}
```
- **Problem:** For simple prompts with one output, this check always fails
- **Example:** "Read from Sheets and send via Gmail" → only `google_gmail` possible

#### Issue 3: Non-Retryable Classification (Line 375-378)
```typescript
const nonRetryablePatterns = [
  'invalid json', 'parse error', 'syntax error', 'malformed',
  'missing field', 'required field', 'type error'  // <-- "missing field" is non-retryable
];
```
- **Problem:** "missing required fields" error is non-retryable, so system doesn't retry with better prompting

---

## Impact on Workflow Generation

### Current Behavior
1. User enters prompt: "Read data from Google Sheets and send it via Gmail to a recipient email address."
2. System generates 4 variations (all single-line, all use google_gmail)
3. Validation rejects all variations
4. System falls back to 1 variation (original prompt)
5. User sees only 1 option instead of 3-4 variations

### Expected Behavior
1. User enters prompt
2. System generates 3-4 detailed, multi-sentence variations
3. Variations use different triggers (manual_trigger vs webhook)
4. Variations are unique enough to pass validation
5. User sees 3-4 options to choose from

---

## Specific Issues for Test Prompts

### Test Prompt 1: "Read data from Google Sheets and send it via Gmail..."
- **Expected Nodes:** `manual_trigger`, `google_sheets`, `google_gmail`
- **Expected Credentials:** `google_sheets`, `google_gmail`
- **Problem:** Only one output node possible (google_gmail), so uniqueness check fails

### Test Prompt 2: "Create a workflow that reads from a Google Sheet and sends a Slack message..."
- **Expected Nodes:** `manual_trigger`, `google_sheets`, `slack_message`
- **Expected Credentials:** `google_sheets`, `slack`
- **Problem:** Only one output node possible (slack_message), so uniqueness check fails

### Test Prompt 3: "Use AI to analyze text and send the summary via email."
- **Expected Nodes:** `manual_trigger`, `ai_chat_model`, `google_gmail`
- **Expected Credentials:** `google_gmail`
- **Problem:** Only one output node possible (google_gmail), so uniqueness check fails

**Pattern:** All simple linear workflows with single output nodes fail the uniqueness validation.

---

## Recommendations

### Fix 1: Relax Uniqueness Requirement for Linear Workflows
**Location:** `summarize-layer.ts:425-441`

**Current Logic:**
```typescript
if (uniqueOutputs.size < 2 && result.promptVariations.length >= 2) {
  return false; // Reject if not enough unique output nodes
}
```

**Proposed Fix:**
```typescript
// For linear workflows, allow same output node if triggers differ
const hasTriggerVariety = triggers.filter(Boolean).length >= 2;
if (uniqueOutputs.size < 2 && result.promptVariations.length >= 2) {
  // Allow if triggers are different (manual_trigger vs webhook)
  if (!hasTriggerVariety) {
    console.warn(`⚠️  Variations not unique enough: only ${uniqueOutputs.size} different output nodes`);
    return false;
  }
  // If triggers differ, allow same output node
  console.log(`✅ Variations have trigger variety, allowing same output node`);
}
```

### Fix 2: Improve Sentence Detection
**Location:** `summarize-layer.ts:275`

**Current Logic:**
```typescript
const sentences = v.prompt.split(/[.!?]+/).filter(s => s.trim().length > 10);
```

**Proposed Fix:**
```typescript
// Also check for sentence-like structures (commas, conjunctions)
const sentences = v.prompt.split(/[.!?]+/).filter(s => s.trim().length > 10);
// If no periods found, check for comma-separated clauses (AI might use commas)
if (sentences.length < 2 && v.prompt.includes(',')) {
  const clauses = v.prompt.split(',').filter(c => c.trim().length > 20);
  if (clauses.length >= 3) {
    // Treat as valid if has 3+ substantial clauses
    return { sentences: clauses.length, valid: true };
  }
}
```

### Fix 3: Make "Missing Fields" Retryable
**Location:** `summarize-layer.ts:375-378`

**Current Logic:**
```typescript
const nonRetryablePatterns = [
  'missing field', 'required field', 'type error'  // Non-retryable
];
```

**Proposed Fix:**
```typescript
const nonRetryablePatterns = [
  'invalid json', 'parse error', 'syntax error', 'malformed',
  'type error'  // Keep type error as non-retryable
  // Remove 'missing field' and 'required field' - these can be fixed by retrying
];
```

### Fix 4: Improve AI Prompting for Multi-Sentence Variations
**Location:** `summarize-layer.ts:750-776`

**Current:** AI prompt asks for 3-4 sentences, but AI generates single-line JSON strings

**Proposed:** Add explicit example showing JSON string format with periods:
```typescript
"prompt": "Create a workflow that starts with a manual_trigger node. Use google_sheets node to read all data from a specified spreadsheet. Process the retrieved data using an AI agent node to generate a comprehensive summary. Send the summary using google_gmail node to a specified email recipient."
```

Note: The example already shows this format, but AI might be ignoring it. Consider:
- Adding more emphasis in the prompt
- Using few-shot examples
- Post-processing to add periods if missing

---

## Patch Work Status

**No patch work was done by me.** I only created test scripts (`test-10-easy-prompts.ts` and `test-single-prompt-analysis.ts`) which were deleted. The issue exists in the existing codebase validation logic.

---

## Next Steps

1. **Immediate:** Fix uniqueness validation to allow same output node if triggers differ
2. **Short-term:** Improve sentence detection to handle comma-separated clauses
3. **Medium-term:** Make "missing fields" errors retryable
4. **Long-term:** Improve AI prompting to generate multi-sentence variations consistently

---

## Test Cases to Verify Fix

After fixes, test these prompts should generate 3-4 variations:

1. "Read data from Google Sheets and send it via Gmail to a recipient email address."
2. "Create a workflow that reads from a Google Sheet and sends a Slack message with the data."
3. "Use AI to analyze text and send the summary via email."
4. "Read data from a spreadsheet and create a contact in HubSpot CRM."
5. "Get data from Google Sheets, analyze it with AI, and send results to Slack."

Each should:
- Generate 3-4 variations
- Have different triggers (manual_trigger vs webhook)
- Pass validation
- Show in UI for user selection

---

## Conclusion

The workflow generation is failing because:
1. **Validation is too strict** for simple linear workflows
2. **AI generates single-line variations** instead of multi-sentence
3. **Uniqueness check fails** for prompts with single output node
4. **Errors are non-retryable**, so system doesn't attempt to fix

The fixes above should resolve the issue and allow workflow generation to proceed successfully.
