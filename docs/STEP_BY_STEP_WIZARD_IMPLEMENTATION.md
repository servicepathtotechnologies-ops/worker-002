# Step-by-Step Wizard Implementation

## ✅ What Was Implemented

A step-by-step wizard flow that shows **one question at a time** instead of all questions at once. Users click "Next" to proceed through questions, and after all questions are answered, they see a "Continue Building" button.

## Flow

1. **Question 1** → User answers → Click "Next"
2. **Question 2** → User answers → Click "Next"
3. **Question 3** → User answers → Click "Next"
4. ... (continues for all questions)
5. **Last Question** → User answers → Click "Continue Building"
6. **All Questions Answered** → Shows completion screen → Click "Continue Building Workflow"
7. **Workflow Built** → Shows workflow with all credentials filled

## Features

### Progress Indicator
- Shows "Question X of Y" at the top
- Visual dots showing progress (green = completed, amber = current, gray = pending)

### Question Ordering
Questions are sorted by `askOrder`:
- **0**: Credentials (authType, apiKey, accessToken)
- **1**: Resources (contact, company, deal, ticket)
- **2**: Operations (get, create, update, delete)
- **3+**: Configuration (properties, other fields)

### Validation
- Required fields must be filled before proceeding
- Shows error toast if required field is empty

### Navigation
- **Previous** button (disabled on first question)
- **Next** button (disabled if required field is empty)
- **Continue Building** button (shown on last question and completion screen)

## Code Changes

### State Management
```typescript
const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
const [allQuestions, setAllQuestions] = useState<any[]>([]);
```

### Question Combination
When workflow is generated, all questions are combined and sorted:
1. `discoveredInputs` (from backend) - includes credential type, resource, operation, properties
2. `discoveredCredentials` (from backend) - non-OAuth credentials only
3. Sorted by `askOrder` and `category`

### UI Rendering
- Shows only `allQuestions[currentQuestionIndex]`
- Renders appropriate input type (Select, Textarea, Input)
- Shows progress indicator
- Navigation buttons (Previous/Next/Continue Building)

## Example Flow for HubSpot

1. **Question 1**: "Which authentication method should we use for HubSpot?"
   - Options: API Key, OAuth Access Token, Use Stored Credential
   - User selects "API Key" → Click "Next"

2. **Question 2**: "What is your HubSpot API Key for HubSpot?"
   - Text input
   - User enters API key → Click "Next"

3. **Question 3**: "Which HubSpot resource are we working with?"
   - Options: Contact, Company, Deal, Ticket
   - User selects "Contact" → Click "Next"

4. **Question 4**: "What operation should HubSpot perform?"
   - Options: Get record, List records, Create record, Update record, Delete record, Search records
   - User selects "Create record" → Click "Next"

5. **Question 5**: "What properties should we set?"
   - Textarea (JSON format)
   - User enters properties → Click "Continue Building"

6. **Completion Screen**: "All Questions Answered"
   - Shows checkmark icon
   - Click "Continue Building Workflow"

7. **Workflow Built**: Shows workflow with all credentials and configuration filled

## Files Modified

1. `ctrl_checks/src/components/workflow/AutonomousAgentWizard.tsx`
   - Added `currentQuestionIndex` and `allQuestions` state
   - Combined and sorted questions when workflow is generated
   - Updated configuration modal to show one question at a time
   - Added progress indicator and navigation buttons

## Testing Checklist

### ✅ Test 1: Verify Step-by-Step Flow
1. Create workflow: "Create a new contact in HubSpot"
2. Verify configuration modal shows "Question 1 of 5"
3. Answer first question → Click "Next"
4. Verify it shows "Question 2 of 5"
5. Continue through all questions
6. Verify "Continue Building" appears on last question
7. Verify completion screen appears after all questions

### ✅ Test 2: Verify Progress Indicator
1. Check progress dots show correctly
2. Green dots for completed questions
3. Amber dot for current question
4. Gray dots for pending questions

### ✅ Test 3: Verify Validation
1. Try to click "Next" without filling required field
2. Verify button is disabled
3. Verify error toast appears
4. Fill required field → Verify button becomes enabled

### ✅ Test 4: Verify Navigation
1. Click "Previous" on second question → Should go back to first
2. Click "Previous" on first question → Should be disabled
3. Click "Next" on last question → Should show "Continue Building"
4. Click "Continue Building" → Should build workflow

### ✅ Test 5: Verify Workflow Has Credentials
1. After building, check workflow node config
2. Verify all credentials are filled (apiKey, resource, operation, properties)
3. Verify workflow is ready to run

## Status

✅ **COMPLETE** - Step-by-step wizard implemented:
- ✅ One question at a time
- ✅ Progress indicator
- ✅ Previous/Next navigation
- ✅ Validation for required fields
- ✅ Continue Building button
- ✅ Completion screen
- ✅ All questions sorted by askOrder
- ✅ Workflow shows with credentials filled
