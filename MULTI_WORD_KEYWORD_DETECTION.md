# 🔍 Multi-Word Keyword Detection Implementation

## Overview

This document explains the enhanced keyword detection system that supports **multi-word keyword matching** using adjacent word pairs from user prompts.

## Problem Statement

With the enhanced keyword system (8-10 keywords per node), many keywords are now **multi-word phrases**:
- `"google sheet"`, `"google sheets"`, `"google drive"`
- `"hubspot crm"`, `"slack message"`, `"discord webhook"`
- `"text summarizer"`, `"sentiment analyzer"`

**Challenge**: User might say:
- `"get data from google sheet"` → Need to match `"google sheet"` (2 adjacent words)
- `"send message to slack webhook"` → Need to match `"slack webhook"` (2 adjacent words)
- `"analyze text using sentiment analyzer"` → Need to match `"sentiment analyzer"` (2 adjacent words)

**Previous behavior**: Only checked individual words, so `"google"` and `"sheet"` would match separately, but not as a phrase.

## Solution: Adjacent Word Pair Matching

### Implementation Strategy

**Priority-based matching** (highest to lowest):

1. **Exact Multi-Word Match** (Confidence: 0.98)
   - Check if adjacent word pairs in prompt exactly match multi-word keywords
   - Example: `"google sheet"` in prompt → matches keyword `"google sheet"`

2. **Contained Multi-Word Match** (Confidence: 0.95)
   - Check if multi-word keyword is contained in adjacent pairs
   - Example: `"from google sheet"` contains `"google sheet"`

3. **All Words Found Individually** (Confidence: 0.85-0.95)
   - All keyword words appear in prompt (but not necessarily adjacent)
   - Example: `"google"` and `"sheet"` both found separately

4. **Partial Word Matches** (Confidence: 0.5-0.85)
   - Some keyword words found, but not all
   - Lower confidence, used as fallback

## Implementation Details

### 1. `generateAdjacentWordPairs()` Method

**Location**: `worker/src/services/ai/summarize-layer.ts` (line ~3708)

**Purpose**: Generate adjacent word pairs and triplets from tokenized prompt.

**Example**:
```typescript
Prompt: "get data from google sheet"
Tokenized: ["get", "data", "from", "google", "sheet"]

Generated pairs:
- 2-word: ["get data", "data from", "from google", "google sheet"]
- 3-word: ["get data from", "data from google", "from google sheet"]
```

**Code**:
```typescript
private generateAdjacentWordPairs(promptWords: string[]): string[] {
  const pairs: string[] = [];
  
  // Generate 2-word pairs (adjacent words)
  for (let i = 0; i < promptWords.length - 1; i++) {
    const pair = `${promptWords[i]} ${promptWords[i + 1]}`;
    pairs.push(pair);
  }
  
  // Generate 3-word combinations for longer keywords
  for (let i = 0; i < promptWords.length - 2; i++) {
    const triple = `${promptWords[i]} ${promptWords[i + 1]} ${promptWords[i + 2]}`;
    pairs.push(triple);
  }
  
  return pairs;
}
```

### 2. Enhanced `matchKeywordByWords()` Method

**Location**: `worker/src/services/ai/summarize-layer.ts` (line ~3730)

**Enhancement**: Now checks adjacent word pairs **before** individual word matching.

**Flow**:
1. **Check for exact multi-word match** (highest priority)
   - Generate adjacent pairs from prompt
   - Check if keyword phrase exactly matches any pair
   - Return high confidence (0.98) if found

2. **Check for contained multi-word match**
   - Check if keyword phrase is contained in any pair
   - Return high confidence (0.95) if found

3. **Fall back to individual word matching** (original logic)
   - Check each keyword word individually
   - Calculate confidence based on match ratio

**Example**:
```typescript
Keyword: "google sheet"
Prompt: "get data from google sheet"

Step 1: Generate pairs → ["get data", "data from", "from google", "google sheet"]
Step 2: Check exact match → "google sheet" === "google sheet" ✅
Step 3: Return confidence: 0.98 (exact multi-word match)
```

### 3. Updated `detectByKeywords()` Method

**Location**: `worker/src/services/ai/summarize-layer.ts` (line ~3778)

**Enhancement**: Now prioritizes multi-word matches and logs them for debugging.

**Changes**:
- Uses enhanced `matchKeywordByWords()` (which now supports adjacent pairs)
- Logs multi-word matches with high confidence (≥0.95)
- Prioritizes exact matches over partial matches

## How It Works: Complete Flow

### Example 1: "Get data from Google Sheets"

```
User Prompt: "get data from google sheets"
↓
Tokenize: ["get", "data", "from", "google", "sheets"]
↓
Generate Adjacent Pairs:
  - ["get data", "data from", "from google", "google sheets"]
  - ["get data from", "data from google", "from google sheets"]
↓
Check Keywords for "google_sheets" node:
  Keywords: ["google sheet", "google sheets", "spreadsheet", ...]
↓
Match "google sheets" keyword:
  ✅ Exact match found in adjacent pairs: "google sheets"
  Confidence: 0.98
↓
Result: "google_sheets" detected with high confidence
```

### Example 2: "Send message to Slack webhook"

```
User Prompt: "send message to slack webhook"
↓
Tokenize: ["send", "message", "to", "slack", "webhook"]
↓
Generate Adjacent Pairs:
  - ["send message", "message to", "to slack", "slack webhook"]
↓
Check Keywords for "slack_webhook" node:
  Keywords: ["slack webhook", "slack webhook node", ...]
↓
Match "slack webhook" keyword:
  ✅ Exact match found: "slack webhook"
  Confidence: 0.98
↓
Result: "slack_webhook" detected
```

### Example 3: "Analyze sentiment using sentiment analyzer"

```
User Prompt: "analyze sentiment using sentiment analyzer"
↓
Tokenize: ["analyze", "sentiment", "using", "sentiment", "analyzer"]
↓
Generate Adjacent Pairs:
  - ["analyze sentiment", "sentiment using", "using sentiment", "sentiment analyzer"]
↓
Check Keywords for "sentiment_analyzer" node:
  Keywords: ["sentiment analyzer", "sentiment analysis", ...]
↓
Match "sentiment analyzer" keyword:
  ✅ Exact match found: "sentiment analyzer"
  Confidence: 0.98
↓
Result: "sentiment_analyzer" detected
```

## Benefits

### ✅ Universal Solution
- Works for **all nodes** automatically
- No hardcoded patterns
- Uses registry-based keywords

### ✅ Accurate Detection
- **Higher confidence** for exact multi-word matches (0.98)
- **Lower false positives** (exact phrase matching)
- **Better handling** of natural language variations

### ✅ Backward Compatible
- Still supports single-word keywords
- Falls back to individual word matching if no adjacent match found
- Maintains existing confidence thresholds

### ✅ Scalable
- Works with any number of keywords per node
- Supports 2-word and 3-word keyword phrases
- Can be extended to 4+ word phrases if needed

## Testing Examples

### Test Case 1: Google Sheets
```
Prompt: "get data from google sheet"
Expected: "google_sheets" detected
Keywords: ["google sheet", "google sheets", ...]
Result: ✅ Exact match "google sheet" → confidence 0.98
```

### Test Case 2: HubSpot
```
Prompt: "create record in hubspot crm"
Expected: "hubspot" detected
Keywords: ["hubspot", "hubspot crm", ...]
Result: ✅ Exact match "hubspot crm" → confidence 0.98
```

### Test Case 3: Slack Webhook
```
Prompt: "send notification via slack webhook"
Expected: "slack_webhook" detected
Keywords: ["slack webhook", "slack webhook node", ...]
Result: ✅ Exact match "slack webhook" → confidence 0.98
```

### Test Case 4: Text Summarizer
```
Prompt: "summarize text using text summarizer"
Expected: "text_summarizer" detected
Keywords: ["text summarizer", "text summarize", ...]
Result: ✅ Exact match "text summarizer" → confidence 0.98
```

## Configuration

### Confidence Thresholds

- **Exact Multi-Word Match**: 0.98
- **Contained Multi-Word Match**: 0.95
- **All Words Found**: 0.85-0.95 (based on ratio)
- **Partial Match**: 0.5-0.85 (based on ratio)

### Minimum Confidence for Detection

The system still uses the **0.7 confidence threshold** for final node detection (set in `universalNodeDetection()`).

Multi-word matches will easily exceed this threshold, ensuring reliable detection.

## Future Enhancements

### Potential Improvements

1. **4+ Word Phrases**: Extend to support longer keyword phrases
2. **Fuzzy Matching**: Add typo tolerance for multi-word phrases
3. **Context Awareness**: Consider surrounding words for better disambiguation
4. **Weighted Keywords**: Prioritize certain keywords over others

## Summary

The enhanced keyword detection system now:

1. ✅ **Generates adjacent word pairs** from user prompts
2. ✅ **Matches multi-word keywords** using exact phrase matching
3. ✅ **Prioritizes exact matches** with high confidence (0.98)
4. ✅ **Falls back to individual word matching** if no phrase match found
5. ✅ **Works universally** for all nodes with multi-word keywords

This ensures that nodes with multi-word keywords (like "google sheet", "slack webhook", "sentiment analyzer") are detected accurately from natural language prompts.
