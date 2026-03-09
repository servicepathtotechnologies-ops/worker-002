# Universal Implementation Plan - Remove All Hardcoding

## Current Problem

### Hardcoded Logic Found:
1. ❌ `expandCollectivePhrases()` - Hardcoded phrases: "all social platforms", "all CRM"
2. ❌ `filterToExplicitlyMentionedNodes()` - Hardcoded social platform detection
3. ❌ Hardcoded node lists: `['instagram', 'twitter', 'linkedin', 'facebook', 'youtube', 'tiktok']`
4. ❌ Hardcoded phrase lists in system prompts
5. ❌ Hardcoded category checks: `category === 'social'`, `category === 'crm'`

## Best Implementation Plan

### ✅ Phase 1: Clean Architecture (Current State)
**Flow:**
```
User Prompt → Extract Keywords → Pass ALL to AI → AI Understands Intent
```

**Key Principles:**
1. **NO hardcoded phrase detection**
2. **NO hardcoded filtering**
3. **NO hardcoded node lists**
4. **AI receives: User Prompt + Extracted Keywords + Available Keywords**
5. **AI intelligently understands intent from context**

### ✅ Phase 2: Remove All Hardcoding

#### Step 1: Remove Unused Functions
- Delete `expandCollectivePhrases()` - Not used anymore
- Delete `filterToExplicitlyMentionedNodes()` - Not used anymore
- Clean up any references

#### Step 2: Clean System Prompts
- Remove hardcoded examples mentioning specific platforms
- Use generic guidance: "If user says 'all X', include all X nodes"
- Let AI understand from extracted keywords

#### Step 3: Universal Keyword Extraction
- Already implemented: `extractKeywordsFromPrompt()` uses registry
- Already implemented: `mapKeywordsToNodeTypes()` uses registry
- ✅ No hardcoding here

#### Step 4: Universal AI Guidance
- System prompt shows extracted keywords
- AI understands: "If extracted keywords show instagram, twitter, linkedin, facebook → user wants all social platforms"
- AI makes intelligent decisions, not hardcoded rules

### ✅ Phase 3: Implementation Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER PROMPT                                              │
│    "Generate AI content daily and post on all social        │
│     platforms"                                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. EXTRACT KEYWORDS (Universal - Registry-Based)            │
│    - Scan prompt for keywords using AliasKeywordCollector   │
│    - Map keywords to node types using registry              │
│    - Result: instagram, twitter, linkedin, facebook,        │
│              schedule, ai_chat_model                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. BUILD AI PROMPT (No Hardcoding)                          │
│    User Prompt: "Generate AI content daily and post on      │
│                  all social platforms"                       │
│                                                              │
│    Extracted Keywords: instagram, twitter, linkedin,        │
│                        facebook, schedule, ai_chat_model    │
│                                                              │
│    Available Keywords: [all 300 most relevant keywords]    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. AI INTELLIGENT UNDERSTANDING                             │
│    - AI sees: "all social platforms" + extracted keywords   │
│    - AI understands: User wants ALL social platform nodes    │
│    - AI generates variations with ALL social platforms      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. VARIATIONS GENERATED                                      │
│    Variation 1: schedule → ai_chat_model → instagram,      │
│                  twitter, linkedin, facebook                 │
│    Variation 2: schedule → ai_chat_model → instagram,       │
│                  twitter, linkedin, facebook (webhook)       │
│    ...                                                       │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Remove Unused Hardcoded Functions
- [x] Remove `expandCollectivePhrases()` calls
- [x] Remove `filterToExplicitlyMentionedNodes()` calls
- [ ] Delete unused functions completely

### Step 2: Clean System Prompts
- [x] Remove hardcoded "all social platforms" examples
- [x] Use generic guidance
- [ ] Remove any remaining hardcoded platform mentions

### Step 3: Verify Universal Flow
- [x] Keyword extraction uses registry (✅ Already universal)
- [x] Keyword mapping uses registry (✅ Already universal)
- [x] AI receives extracted keywords (✅ Already implemented)
- [ ] Test with various prompts to ensure no hardcoding needed

## Benefits

### ✅ Universal
- Works for ANY prompt
- Works for ANY node types
- No hardcoded lists to maintain

### ✅ Intelligent
- AI understands context
- AI makes intelligent decisions
- No rigid rules

### ✅ Maintainable
- Add new nodes → Automatically works
- No code changes needed
- Registry is single source of truth

### ✅ Scalable
- 10 nodes → Works
- 100 nodes → Works
- 1000 nodes → Works

## Testing Strategy

### Test Cases:
1. "Post on all social platforms" → Should include all social nodes
2. "Post on instagram" → Should include instagram
3. "Post on instagram and twitter" → Should include both
4. "Post on all CRM platforms" → Should include all CRM nodes
5. "Send email via gmail" → Should include google_gmail

### Expected Behavior:
- AI receives extracted keywords
- AI understands user intent
- AI generates appropriate variations
- NO hardcoded logic needed
