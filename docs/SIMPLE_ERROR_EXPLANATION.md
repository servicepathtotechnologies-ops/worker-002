# Simple Error Explanation

## What Happened?

**The Error**: 
```
Invalid source handle "default" for "schedule"
Invalid target handle "default" for "google_sheets"
```

**In Simple Words**: 
The system tried to connect two nodes using a connection point called "default", but these nodes don't have a "default" connection point. They have different connection points like "output" and "input".

---

## What Are "Handles"?

Think of nodes like electrical plugs:
- **Source Handle** = The **OUTLET** (where data comes OUT)
- **Target Handle** = The **SOCKET** (where data goes IN)

Example:
- `schedule` node has an **OUTLET** called `"output"` (not `"default"`)
- `google_sheets` node has a **SOCKET** called `"input"` (not `"default"`)

---

## Where Did The Error Occur?

### **Location 1: Edge Creation** 
**File**: `worker/src/services/ai/workflow-dsl-compiler.ts`
**Line**: ~1675

**What Happened**:
```typescript
// System tried to create an edge:
schedule("default") → google_sheets("default")
```

**But it should be**:
```typescript
schedule("output") → google_sheets("input")
```

---

### **Location 2: Handle Resolution**
**File**: `worker/src/core/utils/universal-handle-resolver.ts`
**Line**: ~50-123

**What Happened**:
The resolver was asked: "What handle should I use for `schedule`?"
- It returned: `"default"` ❌ (WRONG)
- It should return: `"output"` ✅ (CORRECT - the first available port)

---

## Why Did The Error Occur?

### **Reason 1: Registry Port Definitions Missing or Wrong**

**Problem**: 
The registry (database of all nodes) might not have proper connection point definitions for these nodes.

**Example**:
```typescript
// What the registry SHOULD have:
schedule: {
  outgoingPorts: ['output']  // ✅ Has "output"
}

// What the registry MIGHT have:
schedule: {
  outgoingPorts: []  // ❌ Empty - no ports defined
  // OR
  outgoingPorts: ['default']  // ❌ Wrong port name
}
```

**Result**: When the resolver looks for ports, it finds nothing or finds the wrong name, so it falls back to `"default"`.

---

### **Reason 2: Resolver Fallback Logic Is Wrong**

**Problem**: 
In `universal-handle-resolver.ts`, when ports are missing, it returns `"default"` as a fallback.

**Current Code** (WRONG):
```typescript
// If no ports found, return "default"
return {
  handle: 'default',  // ❌ WRONG - this handle doesn't exist!
  valid: true
};
```

**Should Be**:
```typescript
// If no ports found, return INVALID (don't create edge)
return {
  handle: '',
  valid: false,  // ✅ Don't allow invalid handles
  reason: 'No ports defined in registry'
};
```

---

### **Reason 3: Edge Creation Doesn't Check Validity**

**Problem**: 
Even when the resolver returns `valid: false`, the edge creation code might still use the invalid handle.

**Current Code** (WRONG):
```typescript
const result = resolver.resolveSourceHandle('schedule');
// result = { handle: 'default', valid: false }

// But code still uses it:
edge.sourceHandle = result.handle;  // ❌ Uses 'default' even though valid: false
```

**Should Be**:
```typescript
const result = resolver.resolveSourceHandle('schedule');
if (!result.valid) {
  return null;  // ✅ Don't create edge if handle is invalid
}
edge.sourceHandle = result.handle;  // ✅ Only use valid handles
```

---

## The Exact Flow of The Error

### **Step 1: User Creates Workflow**
```
User says: "Get data from google sheets, summarize it, send to gmail"
```

### **Step 2: System Creates Nodes**
```
✅ Created: schedule (trigger)
✅ Created: google_sheets (data source)
✅ Created: text_summarizer (transformation)
✅ Created: google_gmail (output)
```

### **Step 3: System Tries to Connect Nodes**
```
Trying to connect: schedule → google_sheets
```

### **Step 4: System Asks Resolver for Handles**
```
Question: "What handle should I use for schedule?"
Resolver checks registry: schedule.outgoingPorts = [] (EMPTY!)
Resolver falls back: Returns "default" ❌
```

### **Step 5: System Creates Edge with Wrong Handle**
```
Edge created: schedule("default") → google_sheets("default")
```

### **Step 6: Validation Catches The Error**
```
Validator checks: "Does schedule have a 'default' port?"
Registry says: "No, schedule only has 'output'"
Error: "Invalid source handle 'default' for 'schedule'" ❌
```

---

## Why "default" Doesn't Work

**Simple Answer**: 
Most nodes don't have a connection point called `"default"`. They have specific names:
- Triggers have: `"output"`
- Data sources have: `"input"` and `"output"`
- Transformations have: `"input"` and `"output"`
- Outputs have: `"input"`

**Example**:
```
schedule node:
  ✅ Has: "output"
  ❌ Does NOT have: "default"

google_sheets node:
  ✅ Has: "input" and "output"
  ❌ Does NOT have: "default"
```

---

## How To Fix It

### **Fix 1: Ensure Registry Has Port Definitions**

**Action**: Make sure all nodes have proper ports defined:
```typescript
schedule: {
  outgoingPorts: ['output']  // ✅ Define ports
}

google_sheets: {
  incomingPorts: ['input'],  // ✅ Define ports
  outgoingPorts: ['output']  // ✅ Define ports
}
```

---

### **Fix 2: Fix Resolver to Use First Available Port**

**Action**: When ports exist, use the first one:
```typescript
if (validPorts.length > 0) {
  return {
    handle: validPorts[0],  // ✅ Use FIRST port, not 'default'
    valid: true
  };
}
```

---

### **Fix 3: Don't Allow Invalid Handles**

**Action**: If no ports exist, return invalid:
```typescript
if (validPorts.length === 0) {
  return {
    handle: '',
    valid: false,  // ✅ Don't allow invalid handles
    reason: 'No ports defined'
  };
}
```

---

### **Fix 4: Check Validity Before Creating Edges**

**Action**: Only create edges with valid handles:
```typescript
const sourceResult = resolver.resolveSourceHandle('schedule');
const targetResult = resolver.resolveTargetHandle('google_sheets');

if (!sourceResult.valid || !targetResult.valid) {
  return null;  // ✅ Don't create edge if handles are invalid
}

// ✅ Only create edge with valid handles
edge.sourceHandle = sourceResult.handle;  // "output"
edge.targetHandle = targetResult.handle;   // "input"
```

---

## Summary

**What**: System tried to use `"default"` handle, but nodes don't have it.

**Where**: 
1. `workflow-dsl-compiler.ts` - Edge creation
2. `universal-handle-resolver.ts` - Handle resolution

**Why**: 
1. Registry missing port definitions
2. Resolver returns `"default"` as fallback
3. Edge creation doesn't check validity

**Fix**: 
1. Add port definitions to registry
2. Use first available port (not `"default"`)
3. Return invalid if no ports exist
4. Check validity before creating edges

---

## Visual Example

**WRONG** (Current):
```
schedule("default") ──X── google_sheets("default")
         ❌                    ❌
    Doesn't exist!        Doesn't exist!
```

**CORRECT** (Should Be):
```
schedule("output") ──✅── google_sheets("input")
         ✅                    ✅
    Exists!                Exists!
```