# Why Extracted Keywords Are NOT in Variations

## What You Asked For

**You said:** "Variation prompts should be created using BOTH extracted keywords AND user prompt"

**Expected Flow:**
```
User Prompt → Extract Keywords → Generate Variations WITH Keywords → Return Variations
```

## What's Actually Happening

**Current Flow:**
```
User Prompt → Build Prompt with Keywords (sent to LLM) → LLM Generates Variations → Post-Process Extract Keywords → Return Variations (without extracted keywords)
```

## The Break Point

### Step 1: Keywords ARE Sent to LLM (But LLM Ignores Them)

**Location:** `buildClarificationPrompt()` - Line 911-912
```typescript
Available Node Keywords (${keywordsToUse.length} most relevant keywords):
${keywordsToUse.join(', ')}
```

**What Happens:**
- Keywords ARE included in the prompt sent to LLM
- LLM receives keywords like: "instagram, twitter, linkedin, facebook, google_gmail, ai_chat_model..."
- But LLM doesn't always use them correctly

**Why LLM Ignores Keywords:**
1. **Too Many Keywords**: 300 keywords sent to LLM - too many to process
2. **No Enforcement**: System prompt says "use keywords" but doesn't enforce it
3. **LLM Interpretation**: LLM interprets user intent instead of using exact keywords
4. **Temperature 0.7**: Randomness causes LLM to sometimes ignore keywords

### Step 2: Variations Generated WITHOUT Extracted Keywords

**Location:** `clarifyIntentAndGenerateVariations()` - Line 280-304
```typescript
// LLM generates variations
const aiResponse = await ollamaOrchestrator.processRequest(...)
const result = this.parseAIResponse(aiResponse, userPrompt, allKeywordData);
```

**What Happens:**
- LLM generates variations based on its interpretation
- Variations might include: "google_gmail" (LLM's interpretation)
- Variations DON'T include: "instagram" (even though it's in keywords)

### Step 3: Keywords Extracted AFTER Variations Are Created

**Location:** `parseAIResponse()` - Line 1313
```typescript
// ✅ STEP 1: Post-process original prompt to extract missed keywords
const postProcessedKeywords = this.extractKeywordsFromPrompt(originalPrompt, allKeywordData);
```

**What Happens:**
- Keywords ARE extracted correctly (line 950 in logs: "Found keyword instagram")
- Keywords ARE mapped to node types (line 956: "Mapped 12 keywords including instagram")
- BUT: Variations are already created without these keywords

**The Gap:**
- Extracted keywords are stored in `mandatoryNodeTypes`
- But variations don't reflect these keywords
- User selects a variation that doesn't have Instagram
- `mandatoryNodeTypes` are passed to planner, but variations don't show them

## Why It's Broken

### Problem 1: Keywords Sent to LLM But Not Enforced

**Current:**
- Keywords are in the prompt (line 911-912)
- But LLM can ignore them
- No validation that variations include keywords

**Should Be:**
- Extract keywords FIRST
- Force LLM to use them in variations
- Validate that variations include extracted keywords

### Problem 2: Post-Processing Happens Too Late

**Current:**
- Variations generated → Keywords extracted → Keywords stored
- But variations already created without keywords

**Should Be:**
- Keywords extracted → Variations generated WITH keywords → Return variations

### Problem 3: No Feedback Loop

**Current:**
- LLM generates variations
- Keywords extracted
- No check if variations match keywords
- No regeneration if keywords missing

**Should Be:**
- Extract keywords
- Generate variations
- Check if variations include keywords
- Regenerate if keywords missing

## Evidence from Your Logs

```
Line 943: Original: "Generate AI content daily and post automatically on instagram"
Line 911-912: Keywords sent to LLM (including instagram)
Line 941: LLM response: "google_gmail" (LLM ignored instagram keyword)
Line 950: Post-processing finds "instagram" ✅
Line 956: Mapped keywords include "instagram" ✅
BUT: Variations don't include "instagram" ❌
```

## The Root Cause

**The extracted keywords from post-processing are NOT being used to regenerate or enhance variations.**

**Current Implementation:**
1. Keywords sent to LLM (but LLM ignores them)
2. LLM generates variations (without extracted keywords)
3. Post-processing extracts keywords (too late)
4. Keywords stored in `mandatoryNodeTypes` (but variations don't reflect them)

**What Should Happen:**
1. Extract keywords FIRST
2. Generate variations WITH extracted keywords enforced
3. Validate variations include keywords
4. Return variations that reflect extracted keywords

## Why It's Inconsistent

1. **LLM Sometimes Uses Keywords**: When temperature/context aligns, LLM might use keywords
2. **LLM Sometimes Ignores Keywords**: When temperature/context differs, LLM ignores keywords
3. **No Validation**: No check if variations match extracted keywords
4. **No Regeneration**: If keywords missing, variations not regenerated

## Summary

**The break point is:** Extracted keywords are found in post-processing, but variations are already generated without them. The variations don't get regenerated or enhanced with the extracted keywords.

**The fix should be:** Extract keywords FIRST, then generate variations with those keywords enforced, not just suggested.
