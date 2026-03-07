# Webhook URL Validator Import Error Fix

## 🚨 Error

**Error Message**:
```
Cannot find module '../../core/validation/webhook-url-validator'
```

**Location**: `worker/src/services/workflow-lifecycle-manager.ts` (line 1476)

**When It Occurs**: When attaching credentials to a workflow, specifically when validating webhook URLs.

---

## 🔍 Root Cause

**Problem**: Incorrect relative import path.

**File Structure**:
```
worker/
  src/
    services/
      workflow-lifecycle-manager.ts  ← File trying to import
    core/
      validation/
        webhook-url-validator.ts     ← File being imported
```

**Incorrect Path**: `../../core/validation/webhook-url-validator`
- `../../` from `worker/src/services/` goes to `worker/`
- This would look for `worker/core/validation/webhook-url-validator` ❌

**Correct Path**: `../core/validation/webhook-url-validator`
- `../` from `worker/src/services/` goes to `worker/src/`
- This correctly finds `worker/src/core/validation/webhook-url-validator` ✅

---

## ✅ Solution Applied

**Fixed**: Changed all occurrences of `../../core/validation/webhook-url-validator` to `../core/validation/webhook-url-validator`

**Locations Fixed**:
- Line 1277
- Line 1296
- Line 1324
- Line 1350
- Line 1476
- Line 1512

---

## 📋 What This Validator Does

The `webhook-url-validator` validates webhook URLs before accepting them as credentials. It:

1. **Checks if URL is provided** - Rejects empty/null/undefined
2. **Validates URL format** - Must be valid HTTP/HTTPS URL
3. **Rejects placeholders** - Blocks "dummy", "test", "placeholder", "example"
4. **Validates protocol** - Only allows `http://` or `https://`

**Purpose**: Prevents invalid webhook URLs from being saved, which would cause workflow execution failures.

---

## 🎯 Impact

**Before Fix**:
- ❌ Credential attachment fails with "Cannot find module" error
- ❌ Workflow cannot be configured with webhook credentials
- ❌ User sees 500 Internal Server Error

**After Fix**:
- ✅ Webhook URL validator loads correctly
- ✅ Credentials can be attached successfully
- ✅ Webhook URLs are validated before acceptance

---

## 🔗 Related Files

- `worker/src/core/validation/webhook-url-validator.ts` - Validator implementation
- `worker/src/services/workflow-lifecycle-manager.ts` - Fixed import paths

---

## 📝 Summary

**Error**: Module not found due to incorrect relative import path.

**Fix**: Changed `../../core/validation/webhook-url-validator` to `../core/validation/webhook-url-validator` (one level up instead of two).

**Result**: Webhook URL validator now loads correctly, allowing credential attachment to work properly.
