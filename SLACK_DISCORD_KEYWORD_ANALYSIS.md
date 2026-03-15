# Slack vs Discord Keyword Analysis

## Problem
User suspects that Slack keywords might be causing Discord to be detected incorrectly.

## Keyword Comparison

### Slack Keywords (node-library.ts:3864-3866)
```
'slack', 'slack message', 'send slack', 'slack channel',
'slack notification', 'post slack', 'slack post', 'notify slack',
'slack send', 'message slack', 'slack alert'
```

### Discord Keywords (node-library.ts:5874-5877, 5887-5890)
```
'discord', 'discord message', 'send discord', 'discord channel',
'discord notification', 'post discord', 'discord post', 'notify discord',
'discord send', 'message discord', 'discord alert'
```

## Analysis

### ✅ GOOD: Service-Specific Keywords
- Slack has: `'slack'` (standalone)
- Discord has: `'discord'` (standalone)
- These are unique and should prevent cross-matching

### ⚠️ POTENTIAL ISSUE: Generic Word Overlap
Both nodes share these generic words in multi-word phrases:
- `'message'` (in "slack message", "discord message", "message slack", "message discord")
- `'send'` (in "send slack", "send discord", "slack send", "discord send")
- `'channel'` (in "slack channel", "discord channel")
- `'notification'` (in "slack notification", "discord notification")
- `'post'` (in "post slack", "post discord", "slack post", "discord post")
- `'notify'` (in "notify slack", "notify discord")
- `'alert'` (in "slack alert", "discord alert")

## Word-Based Matching Logic

The matching uses `matchKeywordByWords()` which:
1. Splits keywords into words: `"slack message"` → `["slack", "message"]`
2. Checks if ALL words appear in prompt
3. For `"slack message"` to match, BOTH "slack" AND "message" must be present

## Potential False Match Scenarios

### Scenario 1: "send message to slack"
- Prompt words: `["send", "message", "to", "slack"]`
- Discord keyword: `"discord message"` → `["discord", "message"]`
  - ❌ Won't match (missing "discord")
- Slack keyword: `"slack message"` → `["slack", "message"]`
  - ✅ Will match (both "slack" and "message" present)

### Scenario 2: "send message" (no service name)
- Prompt words: `["send", "message"]`
- Discord keyword: `"discord message"` → `["discord", "message"]`
  - ❌ Won't match (missing "discord")
- Slack keyword: `"slack message"` → `["slack", "message"]`
  - ❌ Won't match (missing "slack")

### Scenario 3: Generic "message" or "send" alone
- If matching logic is too loose and checks individual words:
  - "message" could match both "slack message" and "discord message"
  - "send" could match both "send slack" and "send discord"

## Root Cause Hypothesis

**If Discord is being detected when user says "slack":**

1. **Semantic Equivalence Registry**: Slack and Discord might be marked as semantically equivalent
2. **Capability-Based Matching**: Both have `'message.send'` capability, causing fallback matching
3. **Word-Based Matching Bug**: Generic words like "message" or "send" might be matching without requiring the service name

## Recommendation

1. **Check Semantic Equivalence**: Verify if `semantic-node-equivalence-registry.ts` marks Slack and Discord as equivalent
2. **Strengthen Keyword Matching**: Ensure multi-word keywords require ALL words (including service name)
3. **Add Service-Specific Priority**: Prioritize exact service name matches over generic word matches

## Current Protection

The whitelist-only implementation should prevent this:
- If user selects variation with "slack", only `slack_message` is in whitelist
- Discord would be filtered out even if detected

But we should fix the root cause (keyword matching) to prevent incorrect detection in the first place.
