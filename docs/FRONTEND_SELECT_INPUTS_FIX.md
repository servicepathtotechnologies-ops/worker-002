# Frontend Select Inputs Fix Required

## Issue

The backend is now generating comprehensive questions with `type: 'select'` for:
- **Credential Type** (API Key / OAuth Access Token / Stored Credential)
- **Resource** (contact, company, deal, ticket)
- **Operation** (get, create, update, delete, search)

However, the frontend (`AutonomousAgentWizard.tsx`) only handles `textarea` and regular `Input` (text) fields. It does NOT handle `select` type inputs, so these questions are not being displayed as dropdowns.

## Current Frontend Code

**File:** `ctrl_checks/src/components/workflow/AutonomousAgentWizard.tsx`

**Current Implementation (lines 2738-2760):**
```typescript
{input.type === 'textarea' || input.fieldType === 'textarea' ? (
  <Textarea ... />
) : (
  <Input type="text" ... />
)}
```

**Problem:** No handling for `input.type === 'select'` or `input.options`

## Required Fix

### Step 1: Import Select Components

Add to imports at top of file:
```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
```

### Step 2: Update Input Rendering Logic

Replace the input rendering section (around line 2738) with:

```typescript
{input.type === 'textarea' || input.fieldType === 'textarea' ? (
  <Textarea
    id={`input-${i}`}
    placeholder={input.description || `Enter ${input.fieldName}`}
    className="w-full"
    value={inputValues[inputKey] || input.defaultValue || ''}
    onChange={(e) => setInputValues({
      ...inputValues,
      [inputKey]: e.target.value,
    })}
  />
) : input.type === 'select' || (input.options && input.options.length > 0) ? (
  <Select
    value={inputValues[inputKey] || input.defaultValue || ''}
    onValueChange={(value) => setInputValues({
      ...inputValues,
      [inputKey]: value,
    })}
  >
    <SelectTrigger id={`input-${i}`} className="w-full">
      <SelectValue placeholder={input.placeholder || `Select ${input.fieldName}`} />
    </SelectTrigger>
    <SelectContent>
      {input.options?.map((option: any, optIdx: number) => (
        <SelectItem 
          key={optIdx} 
          value={typeof option === 'string' ? option : option.value}
        >
          {typeof option === 'string' ? option : (option.label || option.value)}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
) : (
  <Input
    id={`input-${i}`}
    type="text"
    placeholder={input.description || `Enter ${input.fieldName}`}
    className="w-full"
    value={inputValues[inputKey] || input.defaultValue || ''}
    onChange={(e) => setInputValues({
      ...inputValues,
      [inputKey]: e.target.value,
    })}
  />
)}
```

## Expected Result

After this fix, the configuration modal will show:

1. **Authentication Method** (Select dropdown)
   - Options: "Use Stored Credential", "API Key", "OAuth Access Token"

2. **HubSpot API Key** (Text input) - if "API Key" selected
   OR
   **HubSpot OAuth Access Token** (Text input) - if "OAuth Access Token" selected
   OR
   **HubSpot Connection** (Credential selector) - if "Use Stored Credential" selected

3. **HubSpot Resource** (Select dropdown)
   - Options: "Contact", "Company", "Deal", "Ticket"

4. **HubSpot Operation** (Select dropdown)
   - Options: "Get record", "List records", "Create record", "Update record", "Delete record", "Search records"

5. **Properties** (Textarea/JSON) - if operation is "create" or "update"

## Testing

After implementing the fix:

1. Create a workflow with HubSpot node
2. Verify all questions appear in correct order
3. Verify select dropdowns work correctly
4. Verify answers are saved properly

## Backend Data Format

The backend sends inputs in this format:
```typescript
{
  id: 'cred_node123_authType',
  nodeId: 'node123',
  nodeType: 'hubspot',
  fieldName: 'authType',
  category: 'credential',
  type: 'select',
  options: [
    { label: 'API Key', value: 'apiKey' },
    { label: 'OAuth Access Token', value: 'accessToken' },
    { label: 'Use Stored Credential', value: 'credentialId' }
  ],
  askOrder: 0,
  required: true
}
```

The frontend should handle this format correctly with the Select component.
