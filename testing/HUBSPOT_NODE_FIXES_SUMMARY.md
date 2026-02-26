# HubSpot Node Implementation - Complete Analysis & Fixes

## 🔍 Identified Issues

### Issue 1: Properties Parsing Order (CRITICAL)
**Location:** Lines 8273-8293 (old code)

**Problem:**
- If properties is a JSON string with template expressions like `'{"email":"{{$json.email}}"}'`, the code:
  1. Parses the JSON first → `{email: "{{$json.email}}"}`
  2. Then tries to resolve `{{$json.email}}` → but context might be wrong
- This causes template expressions to not resolve correctly

**Fix:**
- Resolve template expressions in the string FIRST, then parse JSON
- Handle both string and object formats properly

### Issue 2: Empty Properties Validation (CRITICAL)
**Location:** Lines 8303-8333 (old code)

**Problem:**
- No validation that properties is not empty for CREATE operations
- HubSpot API rejects empty properties `{}` with 400 Bad Request
- Error message doesn't clearly indicate the issue

**Fix:**
- Added validation: `if (Object.keys(properties).length === 0)` → throw error
- Clear error message: "properties object is empty"

### Issue 3: Required Fields Validation
**Location:** CREATE operation

**Problem:**
- No validation for required fields (e.g., email for contacts)
- Creates invalid records that HubSpot rejects

**Fix:**
- Added warning for contacts without email/firstname/lastname
- Can be enhanced to make email required

### Issue 4: Error Handling & Messages
**Location:** All operations

**Problem:**
- Error messages don't show HubSpot API error details
- Hard to debug what went wrong
- Error response body not parsed properly

**Fix:**
- Parse error response as JSON to extract `message` or `error` field
- Include status code and detailed error in exception
- Better logging with full context

### Issue 5: Authentication Token Format
**Location:** Line 8300 (old code)

**Problem:**
- Token might already have "Bearer " prefix → causes double prefix
- No validation of token format
- API keys deprecated but still supported

**Fix:**
- Remove "Bearer " prefix if present to avoid double prefix
- Validate token format (warn if accessToken doesn't start with "pat-")
- Prioritize accessToken over apiKey

### Issue 6: Response Parsing
**Location:** All operations

**Problem:**
- Using `fetchResponse.json()` directly without checking if response is JSON
- If error response is not JSON, parsing fails

**Fix:**
- Read response as text first
- Parse JSON only if valid
- Better error handling for non-JSON responses

### Issue 7: UPDATE Operation Properties
**Location:** Lines 8358-8386 (old code)

**Problem:**
- No warning if properties is empty for UPDATE
- Partial updates should allow empty, but full updates need properties

**Fix:**
- Added warning for empty properties in UPDATE
- Still allows empty (for partial updates) but warns user

## ✅ Corrected Code Implementation

### Key Improvements:

1. **Properties Parsing (Fixed):**
```typescript
// OLD: Parse first, resolve later
properties = safeParse(propertiesValue, {});
// Then resolve templates

// NEW: Resolve templates FIRST, then parse
if (typeof propertiesValue === 'string' && propertiesValue.includes('{{')) {
  propertiesValue = resolveTypedValue(propertiesValue, execContext);
}
properties = safeParse(propertiesValue, {});
// Then resolve individual property values
```

2. **Validation (Added):**
```typescript
// Validate properties not empty for create/update
if ((operation === 'create' || operation === 'update') && Object.keys(properties).length === 0) {
  throw new Error(`HubSpot ${operation} operation requires at least one property.`);
}

// Validate required fields for contacts
if (operation === 'create' && resource === 'contact') {
  if (!properties.email && !properties.firstname && !properties.lastname) {
    console.warn('[HubSpot] Creating contact without email, firstname, or lastname.');
  }
}
```

3. **Error Handling (Improved):**
```typescript
// OLD: Simple error message
throw new Error(`HubSpot API error: ${status} ${statusText} - ${errorText}`);

// NEW: Parse error JSON and extract message
let errorDetails = responseText;
try {
  const errorJson = JSON.parse(responseText);
  errorDetails = errorJson.message || errorJson.error || JSON.stringify(errorJson);
} catch {
  // Use raw text if not JSON
}
throw new Error(`HubSpot CREATE failed (${status}): ${errorDetails}`);
```

4. **Authentication (Fixed):**
```typescript
// Remove 'Bearer ' prefix if already present
const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
headers['Authorization'] = `Bearer ${cleanToken}`;
```

5. **Response Parsing (Fixed):**
```typescript
// Read as text first, then parse JSON
const responseText = await fetchResponse.text();
if (!fetchResponse.ok) {
  // Parse error JSON
  let errorDetails = responseText;
  try {
    const errorJson = JSON.parse(responseText);
    errorDetails = errorJson.message || errorJson.error || JSON.stringify(errorJson);
  } catch {
    // Use raw text if not JSON
  }
  throw new Error(`HubSpot CREATE failed (${status}): ${errorDetails}`);
}
const responseData = JSON.parse(responseText);
```

## 🧪 Testing Checklist

### CREATE Operation:
- [ ] Properties field has valid JSON with email and firstname
- [ ] Properties field uses `firstname` not `name`
- [ ] Template expressions resolve correctly (e.g., `{{$json.email}}`)
- [ ] Access token is valid and has create permissions
- [ ] Contact appears in HubSpot after execution

### UPDATE Operation:
- [ ] ID field is provided and valid
- [ ] Properties field has at least one field to update
- [ ] Contact is updated in HubSpot after execution

### GET Operation:
- [ ] ID field is provided
- [ ] Contact data is returned correctly

## 📝 Additional Improvements Made

1. **Better Logging:**
   - Log properties being sent
   - Log success with contact ID
   - Log errors with full context

2. **Token Validation:**
   - Warn if accessToken format looks incorrect
   - Prioritize accessToken over deprecated apiKey

3. **Error Context:**
   - Include operation, resource, and properties in error logs
   - Parse HubSpot API error responses for better messages

4. **Properties Validation:**
   - Check for empty properties before API call
   - Warn about missing recommended fields

## 🚀 Expected Behavior After Fixes

1. **CREATE:** Should create contact with proper error messages if something fails
2. **UPDATE:** Should update contact and show clear errors if ID is invalid
3. **GET:** Should retrieve contact data correctly
4. **Error Messages:** Should show HubSpot API error details, not generic messages

## 🔧 Manual Testing Steps

1. **Test CREATE with hardcoded values:**
   ```json
   {
     "email": "test@example.com",
     "firstname": "Test"
   }
   ```
   Expected: Contact created in HubSpot

2. **Test CREATE with template expressions:**
   ```json
   {
     "email": "{{$json.email}}",
     "firstname": "{{$json.name}}"
   }
   ```
   Expected: Template expressions resolve from previous node

3. **Test UPDATE:**
   - Provide valid contact ID
   - Update properties
   Expected: Contact updated in HubSpot

4. **Test Error Cases:**
   - Empty properties → Should show clear error
   - Invalid token → Should show authentication error
   - Invalid ID → Should show 404 error with details
