# Capability-Based Resolution Architecture

## Overview

Replaced `ai_service` node type with capability-based resolution system. `ai_service` represents an AI processing capability, not a concrete node type.

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User Intent                               │
│  "Summarize emails and send summary"                        │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              Intent Structurer                                │
│  Structured Intent:                                           │
│  - actions: [                                                 │
│      { type: "ai_processing", operation: "summarize" },     │
│      { type: "google_gmail", operation: "send" }             │
│    ]                                                          │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│          NodeTypeNormalizationService                        │
│  Step 1: Check if capability → Yes (ai_processing)           │
│  Step 2: Call CapabilityResolver                             │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              CapabilityResolver                               │
│  Input: "ai_processing"                                      │
│  Process:                                                     │
│    1. Check available nodes: [ollama, openai_gpt, ...]      │
│    2. Filter by NodeLibrary availability                    │
│    3. Apply priority: ollama (highest)                       │
│  Output: { nodeType: "ollama", provider: "ollama" }          │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│          Normalized Structured Intent                        │
│  - actions: [                                                 │
│      { type: "ollama", operation: "summarize" },             │
│      { type: "google_gmail", operation: "send" }            │
│    ]                                                          │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│          WorkflowStructureBuilder                             │
│  Builds workflow structure with real node types              │
│  Never generates ai_service nodes                            │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              Workflow Builder                                 │
│  Creates workflow with:                                       │
│  - nodes: [ollama, google_gmail]                             │
│  - edges: [ollama → google_gmail]                             │
└──────────────────────┬──────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              Final Workflow                                   │
│  ✅ Contains only real node types                            │
│  ✅ Never contains ai_service                                 │
│  ✅ Provider selected based on availability                  │
└─────────────────────────────────────────────────────────────┘
```

## Capability Tags

### Supported Capabilities

1. **ai_processing** - General AI processing
   - Aliases: `ai_service`, `ai`, `llm`
   - Resolves to: `ollama` → `openai_gpt` → `anthropic_claude` → `google_gemini`

2. **summarization** - Text summarization
   - Aliases: `summarize`, `summarization`, `summary`
   - Resolves to: `text_summarizer` → `ollama` → `openai_gpt`

3. **classification** - Text classification
   - Aliases: `classify`, `classification`
   - Resolves to: `ollama` → `openai_gpt` → `anthropic_claude`

4. **text_generation** - Text generation
   - Aliases: `text_generation`, `generate_text`
   - Resolves to: `ollama` → `openai_gpt` → `anthropic_claude` → `google_gemini`

5. **sentiment_analysis** - Sentiment analysis
   - Aliases: `sentiment`, `sentiment_analysis`
   - Resolves to: `sentiment_analyzer` → `ollama` → `openai_gpt`

## Provider Priority Order

1. **ollama** (Priority 1)
   - Local, no API key needed
   - Default choice

2. **openai_gpt** (Priority 2)
   - OpenAI GPT models

3. **anthropic_claude** (Priority 3)
   - Anthropic Claude models

4. **google_gemini** (Priority 4)
   - Google Gemini models

5. **Specialized nodes** (Priority 5)
   - `text_summarizer` for summarization
   - `sentiment_analyzer` for sentiment analysis

## Implementation Details

### 1. CapabilityResolver Service

**Location**: `worker/src/services/ai/capability-resolver.ts`

**Key Methods**:
- `resolveCapability(capability, preferredProvider?)`: Resolves capability to node type
- `isCapability(value)`: Checks if value is a capability
- `getAvailableLLMNodes()`: Returns all available LLM nodes

**Resolution Logic**:
1. Check if capability is valid
2. Get available nodes for capability
3. Filter by NodeLibrary availability
4. Apply priority order
5. Return resolved node type

### 2. NodeTypeNormalizationService Integration

**Location**: `worker/src/services/ai/node-type-normalization-service.ts`

**Changes**:
- Added capability resolution as first step in normalization
- Capabilities resolved before abstract type mappings
- Returns resolved node type with `method: 'capability_resolution'`

### 3. Intent Auto Expander Updates

**Location**: `worker/src/services/ai/intent-auto-expander.ts`

**Changes**:
- Replaced `ai_service:analyze` with `ai_processing:analyze`
- Updated service name mappings

### 4. Workflow Structure Builder Updates

**Location**: `worker/src/services/ai/workflow-structure-builder.ts`

**Changes**:
- Removed `ai_service` from processor types
- Added real LLM nodes: `ollama`, `openai_gpt`, `anthropic_claude`, `google_gemini`

### 5. Workflow Builder Updates

**Location**: `worker/src/services/ai/workflow-builder.ts`

**Changes**:
- Removed `ai_service` from keyword mappings
- Updated AI node detection to use real LLM nodes
- Never outputs `ai_service` node

### 6. Industry Templates Updates

**Location**: `worker/src/services/ai/industry-workflow-templates.ts`

**Changes**:
- Replaced `type: 'ai_service'` with `type: 'ai_processing'`
- All templates now use capability tags

### 7. NodeLibrary Updates

**Location**: `worker/src/services/nodes/node-library.ts`

**Changes**:
- Removed `ai_service` from critical nodes check
- Removed `ai_service` from required integrations list

## Example Flow

### Input Intent
```json
{
  "actions": [
    {
      "type": "ai_processing",
      "operation": "analyze"
    }
  ]
}
```

### Capability Resolution
```
ai_processing → CapabilityResolver
  ↓
Check available nodes: [ollama, openai_gpt, anthropic_claude]
  ↓
Apply priority: ollama (highest priority)
  ↓
Resolved: ollama
```

### Output Workflow
```json
{
  "nodes": [
    {
      "type": "ollama",
      "config": { ... }
    }
  ]
}
```

## Benefits

1. **Flexibility**: Can switch providers without changing intent
2. **Availability**: Automatically uses available providers
3. **Priority**: Respects provider preference order
4. **Clarity**: Capabilities are semantic, not implementation details
5. **Maintainability**: No hardcoded `ai_service` nodes

## Migration Notes

- All `ai_service` references replaced with `ai_processing` capability
- Capabilities automatically resolve to real nodes during normalization
- Workflow builder never generates `ai_service` nodes
- Validators no longer have `ai_service` fallback logic
