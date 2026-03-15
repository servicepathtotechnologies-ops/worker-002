# 🔍 Word-Based Pattern Matching Analysis

## ❌ Current Problem: Sentence-Based Matching (HARDCODED)

### Current Approach (WRONG):

**Location**: `worker/src/services/ai/summarize-layer.ts` line 3672

```typescript
// ❌ WRONG: Sentence-based matching
if (promptLower.includes(keywordLower)) {
  // Matches if entire keyword phrase appears in prompt
}
```

### Why This Fails:

**Example 1: HubSpot Detection**
```
Keyword: "create in hubspot"
Prompt: "create a record in hubspot"

Current Check: promptLower.includes("create in hubspot")
Result: ❌ FALSE (because "create in hubspot" ≠ "create a record in hubspot")
```

**Example 2: Multi-word Keywords**
```
Keyword: "google sheets"
Prompt: "get data from google sheets"

Current Check: promptLower.includes("google sheets")
Result: ✅ TRUE (works by accident)

But:
Keyword: "create in hubspot"
Prompt: "create a record in hubspot"
Result: ❌ FALSE (fails because of extra words)
```

### The Problem:

1. **Requires exact phrase match** - If keyword is "create in hubspot", prompt must contain EXACTLY "create in hubspot"
2. **Fails with extra words** - "create a record in hubspot" doesn't match "create in hubspot"
3. **Too rigid** - Can't handle natural language variations
4. **Hardcoded sentence patterns** - Must define every possible sentence variation

---

## ✅ Correct Approach: Word-Based Pattern Matching

### What You Want:

**Split into words → Match word-by-word → Pattern-based**

```
User Prompt: "create a record in hubspot"
    ↓ Split into words
Words: ["create", "a", "record", "in", "hubspot"]

Keyword: "create in hubspot"
    ↓ Split into words
Keyword Words: ["create", "in", "hubspot"]

    ↓ Match word-by-word
Check: Do ALL keyword words appear in prompt words?
- "create" → ✅ Found in prompt
- "in" → ✅ Found in prompt
- "hubspot" → ✅ Found in prompt

Result: ✅ MATCH (all keyword words found)
```

### Word-Based Pattern Matching Algorithm:

```typescript
/**
 * ✅ CORRECT: Word-based pattern matching
 * 
 * Algorithm:
 * 1. Split user prompt into words (handle spaces, punctuation)
 * 2. Split keyword into words
 * 3. Check if ALL keyword words appear in prompt words (in any order)
 * 4. Return match if all words found
 */
function matchKeywordByWords(keyword: string, userPrompt: string): boolean {
  // Step 1: Split user prompt into words
  const promptWords = userPrompt
    .toLowerCase()
    .split(/[\s_\-.,;:!?()\[\]{}'"]+/)  // Split on spaces, punctuation
    .filter(word => word.length > 0);   // Remove empty strings
  
  // Step 2: Split keyword into words
  const keywordWords = keyword
    .toLowerCase()
    .split(/[\s_\-.,;:!?()\[\]{}'"]+/)  // Split on spaces, punctuation
    .filter(word => word.length > 0);   // Remove empty strings
  
  // Step 3: Check if ALL keyword words appear in prompt words
  const allWordsFound = keywordWords.every(keywordWord => 
    promptWords.some(promptWord => 
      promptWord === keywordWord ||           // Exact match
      promptWord.includes(keywordWord) ||    // Partial match (e.g., "hubspot" in "hubspot_crm")
      keywordWord.includes(promptWord)        // Reverse partial match
    )
  );
  
  return allWordsFound;
}
```

### Examples:

**Example 1: HubSpot**
```
Keyword: "create in hubspot"
Keyword Words: ["create", "in", "hubspot"]

Prompt: "create a record in hubspot"
Prompt Words: ["create", "a", "record", "in", "hubspot"]

Match Check:
- "create" → ✅ Found in ["create", "a", "record", "in", "hubspot"]
- "in" → ✅ Found in ["create", "a", "record", "in", "hubspot"]
- "hubspot" → ✅ Found in ["create", "a", "record", "in", "hubspot"]

Result: ✅ MATCH (all 3 words found)
```

**Example 2: Google Sheets**
```
Keyword: "google sheets"
Keyword Words: ["google", "sheets"]

Prompt: "get data from google sheets"
Prompt Words: ["get", "data", "from", "google", "sheets"]

Match Check:
- "google" → ✅ Found
- "sheets" → ✅ Found

Result: ✅ MATCH
```

**Example 3: Zoho CRM**
```
Keyword: "zoho crm"
Keyword Words: ["zoho", "crm"]

Prompt: "create a record in zoho crm"
Prompt Words: ["create", "a", "record", "in", "zoho", "crm"]

Match Check:
- "zoho" → ✅ Found
- "crm" → ✅ Found

Result: ✅ MATCH
```

---

## 🔄 Current Implementation Analysis

### Current Code Locations:

#### 1. `detectByKeywords()` - Line 3653
```typescript
// ❌ WRONG: Sentence-based matching
if (promptLower.includes(keywordLower)) {
  bestConfidence = Math.max(bestConfidence, 0.9);
  bestMatch = keywordLower;
}

// ⚠️ PARTIAL: Word-based matching (but only checks SOME words)
const keywordWords = keywordLower.split(/[_\s-]+/).filter(w => w.length > 0);
if (keywordWords.some(word => promptLower.includes(word))) {
  bestConfidence = Math.max(bestConfidence, 0.8);
  bestMatch = keywordLower;
}
```

**Problem**: 
- First check uses `includes()` - requires exact phrase
- Second check uses `some()` - only checks if ANY word matches (not ALL words)
- Should check if ALL words match

#### 2. `detectByNodeTypeName()` - Line 3533
```typescript
// ✅ GOOD: Already uses word-based matching!
const nodeTypeWords = nodeTypeLower.split(/[_\s-]+/).filter(w => w.length > 0);

// All words match: "google sheets" → "google_sheets"
if (nodeTypeWords.every(word => 
  promptWords.some(pw => pw === word || pw.includes(word) || word.includes(pw))
)) {
  return { confidence: 0.95, method: 'type_name_all_words', match: nodeType };
}
```

**This is CORRECT** - uses `every()` to check ALL words match

#### 3. `node-resolver.ts` - Line 134
```typescript
// ⚠️ PARTIAL: Uses word boundary regex (better than includes, but still phrase-based)
const keywordPattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
const match = keywordPattern.exec(promptLower);
```

**Problem**: 
- Still requires exact phrase match (with word boundaries)
- "create in hubspot" won't match "create a record in hubspot"

---

## ✅ Correct Implementation Pattern

### Word-Based Pattern Matching Function:

```typescript
/**
 * ✅ UNIVERSAL: Word-based pattern matching
 * 
 * Matches keywords by checking if ALL keyword words appear in prompt words.
 * Works for any keyword length, any prompt variation.
 * 
 * @param keyword - Keyword to match (e.g., "create in hubspot")
 * @param userPrompt - User prompt (e.g., "create a record in hubspot")
 * @returns true if ALL keyword words found in prompt
 */
function matchKeywordByWords(keyword: string, userPrompt: string): {
  matched: boolean;
  matchedWords: string[];
  missingWords: string[];
  confidence: number;
} {
  // Step 1: Split user prompt into words
  const promptWords = userPrompt
    .toLowerCase()
    .split(/[\s_\-.,;:!?()\[\]{}'"]+/)  // Split on spaces, punctuation
    .filter(word => word.length > 0);   // Remove empty strings
  
  // Step 2: Split keyword into words
  const keywordWords = keyword
    .toLowerCase()
    .split(/[\s_\-.,;:!?()\[\]{}'"]+/)  // Split on spaces, punctuation
    .filter(word => word.length > 0);   // Remove empty strings
  
  if (keywordWords.length === 0) {
    return { matched: false, matchedWords: [], missingWords: [], confidence: 0 };
  }
  
  // Step 3: Check which keyword words appear in prompt
  const matchedWords: string[] = [];
  const missingWords: string[] = [];
  
  for (const keywordWord of keywordWords) {
    const found = promptWords.some(promptWord => 
      promptWord === keywordWord ||           // Exact match
      promptWord.includes(keywordWord) ||    // Partial match
      keywordWord.includes(promptWord)        // Reverse partial match
    );
    
    if (found) {
      matchedWords.push(keywordWord);
    } else {
      missingWords.push(keywordWord);
    }
  }
  
  // Step 4: Match if ALL words found
  const allWordsFound = missingWords.length === 0;
  const confidence = allWordsFound 
    ? 0.95  // High confidence if all words match
    : (matchedWords.length / keywordWords.length) * 0.8;  // Partial confidence
  
  return {
    matched: allWordsFound,
    matchedWords,
    missingWords,
    confidence
  };
}
```

### Usage Example:

```typescript
// Test Case 1: HubSpot
const result1 = matchKeywordByWords(
  "create in hubspot",
  "create a record in hubspot"
);
// Result: { matched: true, matchedWords: ["create", "in", "hubspot"], missingWords: [], confidence: 0.95 }

// Test Case 2: Google Sheets
const result2 = matchKeywordByWords(
  "google sheets",
  "get data from google sheets"
);
// Result: { matched: true, matchedWords: ["google", "sheets"], missingWords: [], confidence: 0.95 }

// Test Case 3: Zoho CRM
const result3 = matchKeywordByWords(
  "zoho crm",
  "create a record in zoho crm"
);
// Result: { matched: true, matchedWords: ["zoho", "crm"], missingWords: [], confidence: 0.95 }
```

---

## 🔧 Where to Fix

### Fix 1: `detectByKeywords()` - Line 3653

**Current (WRONG)**:
```typescript
// ❌ Sentence-based matching
if (promptLower.includes(keywordLower)) {
  bestConfidence = Math.max(bestConfidence, 0.9);
  bestMatch = keywordLower;
}
```

**Should Be (CORRECT)**:
```typescript
// ✅ Word-based pattern matching
const promptWords = this.tokenizePrompt(userPrompt); // Already exists at line 3497
const keywordWords = keywordLower.split(/[\s_\-.,;:!?()\[\]{}'"]+/).filter(w => w.length > 0);

// Check if ALL keyword words appear in prompt words
const allWordsFound = keywordWords.every(keywordWord => 
  promptWords.some(promptWord => 
    promptWord === keywordWord || 
    promptWord.includes(keywordWord) || 
    keywordWord.includes(promptWord)
  )
);

if (allWordsFound) {
  bestConfidence = Math.max(bestConfidence, 0.95); // Higher confidence for word-based match
  bestMatch = keywordLower;
}
```

### Fix 2: `node-resolver.ts` - Line 134

**Current (PARTIAL)**:
```typescript
// ⚠️ Word boundary regex (still phrase-based)
const keywordPattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
const match = keywordPattern.exec(promptLower);
```

**Should Be (CORRECT)**:
```typescript
// ✅ Word-based pattern matching
const promptWords = promptLower.split(/[\s_\-.,;:!?()\[\]{}'"]+/).filter(w => w.length > 0);
const keywordWords = keyword.toLowerCase().split(/[\s_\-.,;:!?()\[\]{}'"]+/).filter(w => w.length > 0);

const allWordsFound = keywordWords.every(keywordWord => 
  promptWords.some(promptWord => 
    promptWord === keywordWord || 
    promptWord.includes(keywordWord) || 
    keywordWord.includes(promptWord)
  )
);

if (allWordsFound) {
  // Match found - use first occurrence position
  const firstWordIndex = promptWords.findIndex(pw => 
    keywordWords[0] === pw || pw.includes(keywordWords[0])
  );
  const position = firstWordIndex >= 0 ? firstWordIndex * 10 : 0; // Approximate position
  
  // Add to detected nodes
  for (const nodeType of nodeTypes) {
    // ... existing logic
  }
}
```

---

## 📊 Comparison: Sentence-Based vs Word-Based

### Sentence-Based (Current - WRONG):

| Keyword | Prompt | Match? | Why |
|---------|--------|--------|-----|
| "create in hubspot" | "create a record in hubspot" | ❌ NO | Exact phrase not found |
| "google sheets" | "get data from google sheets" | ✅ YES | Exact phrase found (by accident) |
| "zoho crm" | "create in zoho crm" | ✅ YES | Exact phrase found |
| "create in hubspot" | "create record in hubspot" | ❌ NO | Missing "a" word |

**Problem**: Too rigid, requires exact phrase match

### Word-Based (Correct - What You Want):

| Keyword | Prompt | Match? | Why |
|---------|--------|--------|-----|
| "create in hubspot" | "create a record in hubspot" | ✅ YES | All words found: "create", "in", "hubspot" |
| "google sheets" | "get data from google sheets" | ✅ YES | All words found: "google", "sheets" |
| "zoho crm" | "create in zoho crm" | ✅ YES | All words found: "zoho", "crm" |
| "create in hubspot" | "create record in hubspot" | ✅ YES | All words found (order doesn't matter) |

**Benefit**: Flexible, works with natural language variations

---

## 🎯 Key Differences

### Current Approach (Sentence-Based):
1. ❌ Checks if entire keyword phrase appears in prompt
2. ❌ Requires exact phrase match
3. ❌ Fails with extra words ("create a record in hubspot" ≠ "create in hubspot")
4. ❌ Hardcoded sentence patterns needed

### Your Approach (Word-Based):
1. ✅ Splits keyword into words
2. ✅ Splits prompt into words
3. ✅ Checks if ALL keyword words appear in prompt (in any order)
4. ✅ Works with natural language variations
5. ✅ Pattern-based, not sentence-based

---

## 🔍 Why Current Approach is "Hardcoded"

### The Problem:

When you define keywords like:
```typescript
keywords: ['create in hubspot', 'hubspot record', 'create a record in hubspot']
```

You're essentially **hardcoding sentence patterns**. You must define:
- "create in hubspot"
- "create a record in hubspot"
- "create record in hubspot"
- "add to hubspot"
- "sync to hubspot"
- etc.

**This is hardcoding** - you're listing every possible sentence variation.

### The Solution (Word-Based):

Define keywords as **word patterns**:
```typescript
keywords: ['hubspot', 'create', 'record']  // Just the important words
```

Then the system:
1. Splits prompt: "create a record in hubspot" → ["create", "a", "record", "in", "hubspot"]
2. Checks if ALL important words appear: "hubspot" ✅, "create" ✅, "record" ✅
3. Matches if all words found

**This is pattern-based** - works for any sentence variation containing those words.

---

## ✅ Recommended Implementation

### Step 1: Create Word-Based Matcher

```typescript
/**
 * ✅ UNIVERSAL: Word-based keyword matcher
 * Matches keywords by checking if ALL keyword words appear in prompt
 */
private matchKeywordByWords(keyword: string, promptWords: string[]): {
  matched: boolean;
  confidence: number;
} {
  const keywordWords = keyword
    .toLowerCase()
    .split(/[\s_\-.,;:!?()\[\]{}'"]+/)
    .filter(w => w.length > 0);
  
  if (keywordWords.length === 0) {
    return { matched: false, confidence: 0 };
  }
  
  // Check if ALL keyword words appear in prompt
  const allWordsFound = keywordWords.every(keywordWord => 
    promptWords.some(promptWord => 
      promptWord === keywordWord || 
      promptWord.includes(keywordWord) || 
      keywordWord.includes(promptWord)
    )
  );
  
  const confidence = allWordsFound ? 0.95 : 0;
  
  return { matched: allWordsFound, confidence };
}
```

### Step 2: Update `detectByKeywords()`

```typescript
private detectByKeywords(nodeType: string, allKeywords: AliasKeyword[], promptLower: string): DetectionResult | null {
  // ✅ Get prompt words (already tokenized)
  const promptWords = this.tokenizePrompt(promptLower); // Line 3497
  
  const nodeKeywords = allKeywords.filter(k => k && k.nodeType === nodeType);
  if (nodeKeywords.length === 0) return null;
  
  let bestConfidence = 0;
  let bestMatch = '';
  
  for (const keywordData of nodeKeywords) {
    if (!keywordData || !keywordData.keyword) continue;
    
    // ✅ Use word-based matching instead of sentence-based
    const matchResult = this.matchKeywordByWords(keywordData.keyword, promptWords);
    
    if (matchResult.matched) {
      bestConfidence = Math.max(bestConfidence, matchResult.confidence);
      bestMatch = keywordData.keyword;
    }
  }
  
  if (bestConfidence > 0 && bestMatch.length > 0) {
    return { confidence: bestConfidence, method: 'keyword_words', match: bestMatch };
  }
  
  return null;
}
```

### Step 3: Update Keyword Definitions

Instead of:
```typescript
keywords: ['create in hubspot', 'hubspot record', 'create a record in hubspot'] // ❌ Sentence patterns
```

Use:
```typescript
keywords: ['hubspot', 'create', 'record'] // ✅ Word patterns
```

The word-based matcher will:
- Match "create a record in hubspot" → ✅ (all words found)
- Match "create record in hubspot" → ✅ (all words found)
- Match "add record to hubspot" → ✅ (all words found)
- Match "sync to hubspot" → ✅ (hubspot found)

---

## 📋 Summary

### Current Problem:
- ❌ Sentence-based matching (`includes()`)
- ❌ Requires exact phrase match
- ❌ Hardcoded sentence patterns
- ❌ Fails with natural language variations

### Your Solution (Word-Based):
- ✅ Split into words (handle spaces)
- ✅ Match word-by-word (ALL words must match)
- ✅ Pattern-based (not sentence-based)
- ✅ Works with any sentence variation

### Implementation:
1. Use `tokenizePrompt()` to split prompt into words
2. Split keywords into words
3. Check if ALL keyword words appear in prompt words
4. Return match if all words found

**This is truly universal** - works for any keyword, any prompt variation, without hardcoding sentence patterns.
