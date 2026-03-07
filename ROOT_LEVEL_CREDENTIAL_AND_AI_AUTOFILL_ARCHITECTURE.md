# Root-Level Credential and AI Auto-Fill Architecture

## Overview

This document describes the root-level architectural implementation for:
1. **Credential System Matching Node Properties**: Credentials use the same field types as node properties
2. **AI Auto-Fill System**: AI automatically generates text fields (message, subject, body) for all nodes

## Core Principles

### ✅ ROOT-LEVEL ARCHITECTURE (NOT PATCHWORK)

- **Single Source of Truth**: Node schema defines BOTH node properties AND credential field types
- **Universal Application**: Works for ALL nodes automatically
- **Registry-Driven**: Uses UnifiedNodeRegistry and node schemas
- **AI-Integrated**: Every node has AI context understanding

---

## Part 1: Credential System Matching Node Properties

### Current Problem

- Credentials are asked separately from node properties
- Field types don't match (credentials use generic "text", node properties use specific types)
- Resources/operations are not dropdowns in credentials (but are in node properties)

### Solution Architecture

#### 1.1 Schema-Driven Credential Questions

**Location**: `worker/src/services/ai/comprehensive-node-questions-generator.ts`

**Implementation**:
- Read node schema to determine field types
- Use same field types for credentials as node properties:
  - `text` for API keys, URLs, tokens
  - `select` (dropdown) for resources, operations (if schema has options)
  - `textarea` for longer text fields

**Key Changes**:
```typescript
// ✅ ROOT-LEVEL: Use node schema to determine credential field type
function generateCredentialQuestions(node, nodeType, ...) {
  const schema = nodeLibrary.getSchema(nodeType);
  const fieldSchema = schema.configSchema.optional?.[fieldName];
  
  // Use same type as node property
  const fieldType = fieldSchema?.type || 'string';
  const hasOptions = fieldSchema?.options || fieldSchema?.examples;
  
  // If field has options in schema → use dropdown (select)
  // If field is text in schema → use text input
  const questionType = hasOptions ? 'select' : 
                       fieldType === 'string' ? 'text' : 
                       mapQuestionType(fieldType);
}
```

#### 1.2 Resource/Operation Dropdowns in Credentials

**Implementation**:
- Check if field has `options` or `examples` in schema
- If yes → generate dropdown question with those options
- Same options as shown in node properties

**Example**:
```typescript
// Salesforce resource field
if (fieldName === 'resource' && schema.configSchema.optional?.resource?.options) {
  question.type = 'select';
  question.options = schema.configSchema.optional.resource.options.map(opt => ({
    label: opt,
    value: opt
  }));
}
```

#### 1.3 Node-Specific Credential Matching

**Implementation**:
- Credential questions use node ID in question ID: `cred_${nodeId}_${fieldName}`
- When attaching credentials, match by node ID
- Each node gets its own credential questions

**Location**: `worker/src/api/attach-credentials.ts`

---

## Part 2: AI Auto-Fill System for Text Fields

### Current Problem

- Users must manually fill text fields (message, subject, body, heading)
- No AI context understanding per node
- Inconsistent across nodes

### Solution Architecture

#### 2.1 Universal AI Context System

**Location**: `worker/src/services/ai/universal-node-ai-context.ts` (NEW FILE)

**Purpose**: Every node has AI context understanding

**Implementation**:
```typescript
export class UniversalNodeAIContext {
  /**
   * Get AI context for a node
   * - Node type and purpose
   * - Previous node outputs
   * - User prompt/intent
   * - Workflow context
   */
  async getNodeContext(
    node: WorkflowNode,
    workflow: Workflow,
    userPrompt: string,
    previousOutputs: Record<string, any>
  ): Promise<NodeAIContext> {
    // Build comprehensive context
  }
  
  /**
   * Auto-generate text fields using AI
   * - message, subject, body, heading, etc.
   */
  async autoGenerateTextFields(
    node: WorkflowNode,
    context: NodeAIContext
  ): Promise<Record<string, string>> {
    // Use AI to generate appropriate text
  }
}
```

#### 2.2 AI Field Detection

**Location**: `worker/src/services/ai/ai-field-detector.ts` (NEW FILE)

**Purpose**: Detect which fields should be AI-generated

**Implementation**:
```typescript
export class AIFieldDetector {
  /**
   * Detect if a field should be AI-generated
   * Based on:
   * - Field name (message, subject, body, heading, etc.)
   * - Node type (communication nodes, AI nodes, etc.)
   * - Field type (text, not dropdown/select)
   */
  shouldAutoGenerate(fieldName: string, nodeType: string, fieldSchema: any): boolean {
    // Text fields that benefit from AI generation
    const aiGeneratableFields = [
      'message', 'subject', 'body', 'heading', 'title',
      'content', 'text', 'description', 'summary'
    ];
    
    // Only for text fields (not dropdowns, not JSON)
    if (fieldSchema?.type !== 'string') return false;
    if (fieldSchema?.options) return false; // Dropdowns are user-selected
    
    return aiGeneratableFields.some(f => fieldName.toLowerCase().includes(f));
  }
}
```

#### 2.3 Integration Points

**1. Workflow Generation** (`worker/src/services/ai/production-workflow-builder.ts`):
- After workflow is built, auto-generate text fields for all nodes
- Use AI context from user prompt and workflow structure

**2. Node Execution** (`worker/src/core/execution/dynamic-node-executor.ts`):
- Before executing node, check if text fields are empty
- If empty and should be AI-generated → auto-generate using AI
- Use previous node outputs and workflow context

**3. Node Properties UI** (`ctrl_checks/src/components/workflow/PropertiesPanel.tsx`):
- Show "AI-generated" indicator for auto-generated fields
- Allow user to override
- Show "Regenerate with AI" button

---

## Implementation Plan

### Phase 1: Credential System Matching Node Properties

1. ✅ Update `generateCredentialQuestions()` to use node schema field types
2. ✅ Add resource/operation dropdown support in credentials
3. ✅ Ensure node ID matching in credential questions
4. ✅ Test with Salesforce, Slack, Gmail nodes

### Phase 2: AI Auto-Fill System

1. ✅ Create `UniversalNodeAIContext` service
2. ✅ Create `AIFieldDetector` service
3. ✅ Integrate into workflow generation
4. ✅ Integrate into node execution
5. ✅ Update UI to show AI-generated fields

### Phase 3: Universal Application

1. ✅ Test with all node types
2. ✅ Ensure backward compatibility
3. ✅ Document for all nodes

---

## Files to Modify/Create

### New Files:
- `worker/src/services/ai/universal-node-ai-context.ts`
- `worker/src/services/ai/ai-field-detector.ts`

### Modified Files:
- `worker/src/services/ai/comprehensive-node-questions-generator.ts`
- `worker/src/api/attach-credentials.ts`
- `worker/src/services/ai/production-workflow-builder.ts`
- `worker/src/core/execution/dynamic-node-executor.ts`
- `ctrl_checks/src/components/workflow/PropertiesPanel.tsx`

---

## Testing Checklist

- [ ] Credentials use same field types as node properties
- [ ] Resources/operations are dropdowns in credentials
- [ ] Credentials are node-specific (node ID matching)
- [ ] AI auto-generates text fields (message, subject, body)
- [ ] User can override AI-generated fields
- [ ] Works for ALL node types
- [ ] Backward compatible with existing workflows
