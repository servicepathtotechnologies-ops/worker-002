# Switch Node Error Analysis - Complete Root Cause Breakdown

## 🔴 **PRIMARY ERROR**

```
[React Flow]: Couldn't create edge for source handle id: "output"
Edge: edge_node_ea704159-1bb1-427c-9c1b-9794de167ca2_node_89edb78d-0837-44d4-8626-ea5ace61d1c3_ce820c38-754e-407a-830a-dfaa5e997839
```

**What this means:**
- An edge is trying to use `sourceHandle: "output"` 
- But the switch node doesn't have an "output" handle
- Switch nodes have **case-specific handles** like "active", "pending", "completed"
- React Flow can't find the handle → Error

---

## 🔍 **ROOT CAUSES (In Order of Execution)**

### **ERROR #1: Switch Cases Not Extracted**

**Location:** `workflow-dsl-compiler.ts` (line 803-1065)

**Problem:**
- Switch node cases are not being extracted from prompt
- Terminal logs show: `routingType: ""`, `rules: ""` (EMPTY!)
- No cases = No `outgoingPorts` = No handles for React Flow

**Why it fails:**
1. Case extraction patterns don't match user prompt format
2. Input data analysis doesn't find available fields
3. Expression field extraction fails
4. Fallback logic doesn't generate cases properly

**Evidence from terminal:**
```
[ComprehensiveQuestions] Node config: {
  "routingType": "",
  "rules": ""
}
```

---

### **ERROR #2: Linear Workflow Connector Creates Wrong Edges**

**Location:** `linear-workflow-connector.ts` (line 298-319)

**Problem:**
```typescript
// ❌ WRONG: Creates edge with default "output" handle
const { sourceHandle, targetHandle } = this.resolveHandles('switch', targetType);
// resolveHandles returns: sourceHandle = 'output' (line 374)
```

**Why it's wrong:**
- `resolveHandles()` doesn't know about switch node cases
- It defaults to `'output'` (line 374)
- Switch nodes don't have "output" handle - they have case-specific handles
- This creates edges that React Flow can't render

**Flow:**
1. DSL compiler doesn't extract cases → No edges created
2. Linear connector runs → Creates edge with `sourceHandle: "output"`
3. React Flow tries to render → Can't find "output" handle → ERROR

---

### **ERROR #3: Switch Node OutgoingPorts Not Set**

**Location:** `workflow-dsl-compiler.ts` (line 1020-1033)

**Problem:**
- `outgoingPorts` are only set if cases are extracted
- If cases extraction fails → `outgoingPorts` remains empty/undefined
- React Flow doesn't know what handles exist on the switch node

**Code:**
```typescript
if (switchCases.length > 0) {
  // Only sets outgoingPorts if cases exist
  lastTransformationDef.outgoingPorts = caseValues;
}
// ❌ If switchCases.length === 0, outgoingPorts is never set!
```

---

### **ERROR #4: Frontend Normalization Issue**

**Location:** `ctrl_checks/src/lib/workflowValidation.ts` (line 844-845)

**Problem:**
```typescript
} else if (sourceType === 'switch') {
    normalizedSourceHandle = 'default'; // ❌ WRONG: Should use case-specific handle
}
```

**Why it's wrong:**
- Frontend normalizes missing `sourceHandle` to `'default'`
- But switch nodes don't have "default" handle either
- Should preserve case-specific handles or skip normalization

---

## 📊 **ERROR FLOW DIAGRAM**

```
User Prompt: "Use switch to route based on status"
  ↓
[1] DSL Compiler: Extract cases from prompt
    ❌ FAILS: Patterns don't match → switchCases.length === 0
  ↓
[2] DSL Compiler: Set outgoingPorts
    ❌ SKIPPED: switchCases.length === 0 → outgoingPorts not set
  ↓
[3] DSL Compiler: Create edges
    ❌ SKIPPED: switchCases.length === 0 → No edges created
  ↓
[4] Linear Connector: Create edges for switch
    ❌ CREATES: Edge with sourceHandle: "output"
  ↓
[5] React Flow: Try to render edge
    ❌ ERROR: Can't find "output" handle on switch node
```

---

## 🎯 **WHY EACH ERROR OCCURS**

### **1. Case Extraction Failure**

**Patterns used:**
- `/(\w+)\s+(?:leads?|statuses?|items?)/gi` - Too specific
- `/(?:if|when)\s+(?:\w+)\s+(?:is|equals)/gi` - Doesn't match all formats
- `/(?:case|value|status)\s+["']?(\w+)["']?/gi` - Requires exact format

**User prompt formats that fail:**
- "route active to slack, pending to gmail" → No "statuses" keyword
- "switch on status field" → No explicit case values
- "if status equals active then slack" → Pattern might miss it

**Solution needed:**
- More flexible pattern matching
- AI-based case extraction (analyze semantic meaning)
- Better fallback to input data analysis

---

### **2. Linear Connector Override**

**Why it happens:**
- `LinearWorkflowConnector` runs AFTER DSL compiler
- It's designed to connect nodes linearly
- It doesn't know about switch node cases
- It uses generic `resolveHandles()` which returns "output"

**Solution needed:**
- Skip switch nodes in linear connector (they're handled by DSL compiler)
- OR: Check if switch has cases before creating edges
- OR: Use case-specific handles from switch node config

---

### **3. OutgoingPorts Not Set**

**Why it happens:**
- `outgoingPorts` are only set when cases are extracted
- If extraction fails, `outgoingPorts` remains undefined
- React Flow needs `outgoingPorts` to know what handles exist

**Solution needed:**
- Set default `outgoingPorts` even if cases aren't extracted
- OR: Generate cases from output nodes as fallback
- OR: Set `outgoingPorts` from switch node config if available

---

### **4. Frontend Normalization**

**Why it happens:**
- Frontend receives edge with missing `sourceHandle`
- Normalization tries to fix it
- But uses wrong default for switch nodes

**Solution needed:**
- Don't normalize switch node edges (preserve case-specific handles)
- OR: Extract cases from switch node config in frontend
- OR: Skip edges with missing handles for switch nodes

---

## ✅ **FIXES NEEDED**

1. **Improve case extraction** - More flexible patterns, AI-based extraction
2. **Skip switch in linear connector** - Don't create edges for switch nodes
3. **Set outgoingPorts always** - Even if cases aren't extracted, set from config or fallback
4. **Fix frontend normalization** - Don't normalize switch node handles

---

## 🔧 **IMMEDIATE FIX**

The quickest fix is to **skip switch nodes in linear connector**:

```typescript
// In linear-workflow-connector.ts
// ❌ REMOVE THIS BLOCK (lines 298-319):
const switchNodes = nodes.filter(n => normalizeNodeType(n) === 'switch');
for (const switchNode of switchNodes) {
  // ... creates edges with "output" handle
}

// ✅ Switch nodes are handled by DSL compiler with case-specific handles
```

This prevents the "output" handle error immediately.
