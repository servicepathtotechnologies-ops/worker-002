# Flow Analysis: User Prompt → Keyword Extraction → Variation Generation

## Current Flow (BROKEN)

### Step 1: Extract Keywords
```
User: "Generate AI content daily and post automatically on all social platforms"
  ↓
extractKeywordsFromPrompt() extracts:
  - "social" → facebook, twitter, linkedin, instagram
  - "post" → facebook, twitter, linkedin, instagram, youtube
  - "daily" → schedule
  - "ai" → ai_chat_model, ai_service
  - "content" → google_doc, ai_service
```

### Step 2: Map to Node Types
```
mapKeywordsToNodeTypes() returns:
  - schedule, google_doc, ai_chat_model, ai_service, linkedin, twitter, instagram, youtube, http_post, facebook
```

### Step 3: ❌ PROBLEM: Filter Removes Social Platforms
```
filterToExplicitlyMentionedNodes() checks:
  - Does prompt contain "instagram"? → NO
  - Does prompt contain "twitter"? → NO
  - Does prompt contain "linkedin"? → NO
  - Does prompt contain "facebook"? → NO
  → FILTERS OUT ALL SOCIAL PLATFORMS
```

### Step 4: ❌ PROBLEM: Hardcoded Expansion
```
expandCollectivePhrases() hardcodes:
  - "all social platforms" → instagram, twitter, linkedin, facebook
  → This is HARDCODED, not intelligent
```

### Step 5: Pass to AI
```
extractedNodeTypes = [schedule, ai_chat_model] (social platforms removed)
  ↓
AI receives: "REQUIRED NODES: schedule, ai_chat_model"
  ↓
AI generates: Google Sheets + Gmail (default pattern)
```

## Root Cause

1. **Filter is too strict** - Removes nodes that aren't explicitly named
2. **Hardcoded expansion** - "all social platforms" is hardcoded, not intelligent
3. **AI doesn't see keywords** - Keywords are extracted but not passed clearly to AI
4. **AI ignores required nodes** - Even when passed, AI doesn't use them

## What User Wants

### Correct Flow (UNIVERSAL, NO HARDCODING)

```
User: "Generate AI content daily and post automatically on all social platforms"
  ↓
Step 1: Extract ALL keywords from prompt
  - Extract: "social", "platforms", "post", "daily", "ai", "content"
  - Map to nodes: instagram, twitter, linkedin, facebook, schedule, ai_chat_model
  ↓
Step 2: Pass to AI (NO FILTERING, NO HARDCODING)
  - User prompt: "Generate AI content daily and post automatically on all social platforms"
  - Extracted keywords: instagram, twitter, linkedin, facebook, schedule, ai_chat_model
  - Available keywords: [all 300 most relevant keywords]
  ↓
Step 3: AI Intelligently Understands
  - AI sees: "all social platforms" + keywords [instagram, twitter, linkedin, facebook]
  - AI understands: "all social platforms" means ALL social platform nodes
  - AI generates variations with ALL social platforms
  ↓
Step 4: Variations Include Social Platforms
  - Variation 1: schedule → ai_chat_model → instagram, twitter, linkedin, facebook
  - Variation 2: schedule → ai_chat_model → instagram, twitter, linkedin, facebook (different trigger)
  - etc.
```

## Solution

1. **Remove hardcoded collective phrase detection**
2. **Remove strict filtering** - Pass ALL extracted keywords to AI
3. **Strengthen system prompt** - Make AI understand extracted keywords MUST be used
4. **Pass keywords clearly** - Show AI: "User said 'all social platforms', extracted keywords: instagram, twitter, linkedin, facebook"
5. **Let AI be intelligent** - AI should understand "all social platforms" from context + keywords
