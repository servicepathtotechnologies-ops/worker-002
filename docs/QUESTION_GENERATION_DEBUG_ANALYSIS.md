# Question Generation Debug Analysis

## Problem Statement
User reports that only one configuration question is being asked, and the workflow view opens immediately after. The system should ask ALL required questions for each node (credentials, resource, operation, properties) in a structured step-by-step manner.

## Question Generation Flow

### 1. Backend: Question Generation (`comprehensive-node-questions-generator.ts`)

**Entry Point:** `generateComprehensiveNodeQuestions(workflow, answeredFields)`

**Flow:**
```
For each node in workflow:
  1. Get node schema (required + optional fields)
  2. Generate credential questions (askOrder: 0)
     - Check for multiple auth methods (API Key, OAuth, Stored Credential)
     - Generate authType selection question if multiple methods available
     - Generate specific credential input question
  3. Generate resource questions (askOrder: 1)
     - Check if node has 'resource', 'module', or 'object' field
     - If REQUIRED field → ALWAYS generate question (even with placeholder values)
     - If optional field → generate only if empty or has placeholder
  4. Generate operation questions (askOrder: 2)
     - Check if node has 'operation' field
     - If REQUIRED field → ALWAYS generate question (even with placeholder values)
     - If optional field → generate only if empty or has placeholder
  5. Generate configuration questions (askOrder: 3+)
     - Use node-question-order system
     - Generate for required fields that aren't credentials/operations/resources
  6. Sort all questions by askOrder
  7. Return comprehensive questions array
```

**Key Fixes Applied:**
- ✅ Required fields (resource, operation) ALWAYS generate questions, even if they have placeholder template expressions
- ✅ Template expressions like `{{$json.timestamp}}` are treated as empty/placeholder values
- ✅ Enhanced logging to track question generation per node

### 2. Backend: API Response (`generate-workflow.ts`)

**Location:** Line 2292-2506

**Flow:**
```
1. Generate comprehensive questions
2. Format questions for frontend
3. Include in response:
   - comprehensiveQuestions: All questions (credentials + operations + config)
   - discoveredInputs: Legacy format (node inputs)
   - discoveredCredentials: Legacy format (missing credentials)
```

**Response Structure:**
```json
{
  "success": true,
  "phase": "ready",
  "workflow": {...},
  "comprehensiveQuestions": [
    {
      "id": "cred_nodeId_authType",
      "text": "Which authentication method?",
      "type": "select",
      "nodeId": "...",
      "nodeType": "hubspot",
      "fieldName": "authType",
      "category": "credential",
      "required": true,
      "askOrder": 0,
      "options": [...]
    },
    {
      "id": "cred_nodeId_apiKey",
      "text": "What is your HubSpot API Key?",
      "type": "text",
      "nodeId": "...",
      "nodeType": "hubspot",
      "fieldName": "apiKey",
      "category": "credential",
      "required": true,
      "askOrder": 0.5
    },
    {
      "id": "resource_nodeId_resource",
      "text": "Which HubSpot resource are we working with?",
      "type": "select",
      "nodeId": "...",
      "nodeType": "hubspot",
      "fieldName": "resource",
      "category": "configuration",
      "required": true,
      "askOrder": 1,
      "options": [
        {"label": "Contact", "value": "contact"},
        {"label": "Company", "value": "company"},
        ...
      ]
    },
    {
      "id": "op_nodeId_operation",
      "text": "What operation should HubSpot perform?",
      "type": "select",
      "nodeId": "...",
      "nodeType": "hubspot",
      "fieldName": "operation",
      "category": "operation",
      "required": true,
      "askOrder": 2,
      "options": [...]
    }
  ]
}
```

### 3. Frontend: Question Display (`AutonomousAgentWizard.tsx`)

**Expected Flow:**
```
1. Receive workflow update with comprehensiveQuestions array
2. Store all questions in allQuestions state
3. Display questions one at a time (step-by-step wizard)
4. Track current question index
5. Show "Next" button (disabled if required question not answered)
6. Show "Continue Building" only on last question
7. Submit all answers when "Continue Building" is clicked
```

**Key Requirements:**
- ✅ Use `update.comprehensiveQuestions` array from backend
- ✅ Display one question at a time
- ✅ Show progress (Question X of Y)
- ✅ "Next" button disabled if required question is empty
- ✅ "Continue Building" only on last question

## Debugging Checklist

### Backend Debugging

1. **Check if questions are generated:**
   - Look for logs: `[ComprehensiveQuestions] Generating questions for X nodes`
   - Look for logs: `[ComprehensiveQuestions] ✅ Generated X questions for node Y`
   - Look for logs: `[GenerateWorkflow] ✅ Generated X comprehensive questions`

2. **Check question breakdown:**
   - Look for logs: `[GenerateWorkflow] 📊 Questions by category:`
   - Look for logs: `[GenerateWorkflow] 📋 Questions by node:`
   - Verify each node has questions for: credentials, resource, operation

3. **Check HubSpot node specifically:**
   - Look for logs: `[ComprehensiveQuestions] Checking for resource field in hubspot`
   - Look for logs: `[ComprehensiveQuestions] ✅ Generating resource question`
   - Look for logs: `[ComprehensiveQuestions] ✅ Generating operation question`

4. **Check if questions are in response:**
   - Verify `comprehensiveQuestions` array is in API response
   - Check response size matches logged question count

### Frontend Debugging

1. **Check if questions are received:**
   - Log `update.comprehensiveQuestions` in frontend
   - Verify array length matches backend count

2. **Check question display:**
   - Verify `allQuestions` state is populated
   - Verify `currentQuestionIndex` is tracking correctly
   - Check if questions are being filtered incorrectly

3. **Check question navigation:**
   - Verify "Next" button appears (not just "Continue Building")
   - Verify "Previous" button works
   - Check if questions are being skipped

## Expected Behavior for HubSpot Node

When creating a HubSpot workflow, you should see:

1. **Question 1:** "Which authentication method should we use for HubSpot?"
   - Type: Select
   - Options: Use Stored Credential, API Key, OAuth Access Token
   - askOrder: 0

2. **Question 2:** "What is your HubSpot API Key?" (if API Key selected)
   - Type: Text
   - askOrder: 0.5

3. **Question 3:** "Which HubSpot resource are we working with?"
   - Type: Select
   - Options: Contact, Company, Deal, Ticket
   - askOrder: 1

4. **Question 4:** "What operation should HubSpot perform?"
   - Type: Select
   - Options: Get, Get Many, Create, Update, Delete, Search
   - askOrder: 2

5. **Question 5:** "What properties?" (if operation is create/update)
   - Type: Textarea/JSON
   - askOrder: 3

## Common Issues

### Issue 1: Only one question showing
**Cause:** Questions not being generated or not included in response
**Fix:** Check backend logs for question generation, verify `comprehensiveQuestions` in response

### Issue 2: Questions closing immediately
**Cause:** Frontend not properly handling question array or skipping to workflow view
**Fix:** Check frontend logic for question display and navigation

### Issue 3: Resource/Operation not detected
**Cause:** Field detection logic not finding fields, or placeholder values not being treated as empty
**Fix:** Enhanced detection logic and required field handling

### Issue 4: Questions not in order
**Cause:** askOrder not being respected or questions not sorted
**Fix:** Verify sorting logic in question generator

## Testing Steps

1. **Create HubSpot workflow:**
   ```
   Prompt: "Create a contact in HubSpot"
   ```

2. **Check backend logs:**
   - Should see: `[ComprehensiveQuestions] Generating questions for X nodes`
   - Should see: `[ComprehensiveQuestions] ✅ Generated X questions for node hubspot`
   - Should see: `[GenerateWorkflow] ✅ Generated X comprehensive questions`

3. **Check API response:**
   - Verify `comprehensiveQuestions` array exists
   - Verify array has questions for: authType, apiKey, resource, operation
   - Verify questions are sorted by askOrder

4. **Check frontend:**
   - Verify questions appear one at a time
   - Verify "Next" button appears (not just "Continue Building")
   - Verify all questions are shown before workflow view

## Next Steps

1. ✅ Enhanced logging in question generator
2. ✅ Required fields always generate questions
3. ✅ Template expression detection for placeholders
4. ⏳ Verify frontend receives and displays all questions
5. ⏳ Test with actual HubSpot workflow creation
