# Test 1.1 Issue Analysis

## Problem

**Test Prompt:**
```
When I receive a POST request to my webhook endpoint, extract the customer email and name from the request body, then create a new contact in HubSpot.
```

**Expected Workflow:**
- `webhook` (trigger)
- `set_variable` or `set` (extract email/name)
- `hubspot` (create contact)

**Actual Generated Workflow:**
- `webhook` (trigger) ✅
- `if_else` (Check condition route) ❌ **NOT NEEDED**
- `hubspot` (create contact) ✅
- `gmail` (on false branch) ❌ **NOT REQUESTED**
- `slack_message` (output) ❌ **NOT REQUESTED**
- `extracted data Google` (output) ❌ **NOT REQUESTED**

## Root Cause

### Issue 1: Conditional Logic False Positive

The conditional detection logic in `workflow-builder.ts` (line 2594-2600) includes "when" as a conditional keyword:

```typescript
const conditionalKeywords = [
  'if', 'then', 'check if', 'when', 'only if', 'unless', 
  ...
];
```

**Problem:** The word "when" in "When I receive a POST request..." is describing the **trigger timing**, not a conditional statement. This causes the system to incorrectly add an `if_else` node.

**Fix Needed:** The conditional detection should distinguish between:
- "when" as trigger timing: "When I receive..." → NOT conditional
- "when" as condition: "When the value is > 100..." → IS conditional

### Issue 2: Incorrect Clarifying Questions

The clarifying questions shown are about social media automation (Instagram, LinkedIn, etc.), which doesn't match the prompt at all. This suggests:
- The workflow analyzer might be mixing up prompts
- Or there's a bug in the question generation logic

### Issue 3: Unnecessary Nodes Added

The workflow includes Gmail and Slack nodes that weren't requested. This might be because:
- The AI model is hallucinating additional requirements
- Or there's a default behavior adding notification nodes

## Expected Behavior

For Test 1.1, the workflow should be:

```
webhook (trigger)
  ↓
set_variable (extract email and name from {{webhook.body.email}} and {{webhook.body.name}})
  ↓
hubspot (create contact with extracted email and name)
```

**Total: 3 nodes** (webhook + set_variable + hubspot)

## Fix Recommendations

1. **Improve Conditional Detection:**
   - Don't treat "when" as conditional if it's at the start of a sentence describing a trigger
   - Use context-aware detection: "when X then Y" = conditional, "when I receive" = trigger

2. **Fix Question Generation:**
   - Ensure questions match the actual prompt
   - Don't ask about services not mentioned (Instagram, LinkedIn, etc.)

3. **Enforce Simplicity Rule:**
   - The system prompt already says "SIMPLICITY FIRST" but it's not being followed
   - Add validation to reject workflows with nodes not mentioned in the prompt

4. **Better Prompt Parsing:**
   - "extract" should trigger `set_variable` node, not conditional logic
   - "extract X from Y" = data extraction, not condition

## Testing

After fixes, verify:
- ✅ No `if_else` node for Test 1.1
- ✅ No Gmail or Slack nodes
- ✅ Only webhook + set_variable + hubspot nodes
- ✅ Correct data flow: webhook.body → set_variable → hubspot
