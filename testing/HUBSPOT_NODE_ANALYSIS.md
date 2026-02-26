# HubSpot Node Implementation Analysis & Fixes

## Current Implementation Issues

### Issue 1: Properties Field Parsing (Lines 8273-8293)
**Problem:** Properties might be a JSON string, object, or already resolved. The current parsing might fail if:
- Properties is a string with template expressions that need resolution BEFORE parsing
- Properties is nested incorrectly
- Properties is empty but operation requires it

**Current Code:**
```typescript
let properties: Record<string, any> = {};
if (config.properties) {
  const propertiesValue = config.properties;
  if (typeof propertiesValue === 'string') {
    properties = safeParse<Record<string, any>>(propertiesValue, {}) || {};
  } else if (typeof propertiesValue === 'object' && propertiesValue !== null) {
    properties = propertiesValue as Record<string, any>;
  }
  
  // Resolve template expressions
  const resolvedProperties: Record<string, any> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string' && value.includes('{{')) {
      resolvedProperties[key] = resolveTypedValue(value, execContext);
    } else {
      resolvedProperties[key] = value;
    }
  }
  properties = resolvedProperties;
}
```

**Issues:**
1. If properties is a string like `'{"email":"{{$json.email}}"}'`, it parses first, then tries to resolve `{{$json.email}}` which might not work correctly
2. No validation that properties is not empty for create/update operations
3. No check for required properties (e.g., email for contacts)

### Issue 2: Authentication (Line 8300)
**Problem:** HubSpot deprecated API keys. Only Private App Access Tokens work now. The code uses `Bearer ${token}` which is correct, but:
- API keys might not work at all
- Need to verify token format

**Current Code:**
```typescript
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`,
};
```

**Issue:** Should prioritize accessToken and validate format.

### Issue 3: CREATE Operation Validation (Lines 8303-8333)
**Problem:** 
- No validation that properties object is not empty
- No validation of required fields (email for contacts)
- No error details in response

**Current Code:**
```typescript
if (operation === 'create') {
  const url = `${baseUrl}/crm/v3/objects/${resource}`;
  const body = {
    properties: properties,
  };
  // ... makes request
}
```

**Issues:**
1. If properties is empty `{}`, HubSpot will reject the request
2. For contacts, email is typically required but not validated
3. Error messages might not be clear

### Issue 4: UPDATE Operation (Lines 8358-8386)
**Problem:**
- Same properties parsing issues
- ID validation happens but error might not be clear
- No check if properties is empty (partial update should allow empty, but full update needs properties)

### Issue 5: Error Handling (Lines 8419-8423)
**Problem:**
- Errors are caught but the original error details might be lost
- API error responses might have useful details in the body that aren't shown

## Identified Issues Summary

1. **Properties parsing order**: Resolve templates BEFORE parsing JSON string
2. **Empty properties validation**: Check if properties is empty for create operations
3. **Required fields validation**: Validate email for contacts
4. **Better error messages**: Include HubSpot API error details
5. **Authentication**: Verify token format and prioritize accessToken
6. **Properties field name**: Ensure `firstname` not `name` is used

## Corrected Implementation

See the fixed code in the next section.
