# Comprehensive Workflow Generation Fixes - Implementation Plan

## 🎯 Executive Summary

**Objective**: Fix all workflow generation issues to ensure:
1. ✅ Unique, specific prompt variations (one output node per prompt, no OR options)
2. ✅ Correct capability validation (output nodes have proper capabilities)
3. ✅ Trigger variety (webhook + manual triggers in variations)
4. ✅ No duplicate AI nodes (ai_agent + ai_chat_model)
5. ✅ Proper workflow generation without validation errors

**Approach**: **ROOT-LEVEL FIXES** at multiple layers:
- Summarize Layer: Generate unique, specific prompts
- Capability Registry: Fix capability mappings
- DSL Validation: Fix capability checking logic
- Duplicate Detection: Ensure it works at all layers

---

## 📋 Phase 1: Fix Summarize Layer - Generate Unique, Specific Prompts (CRITICAL)

### Priority: **P0 - CRITICAL** (Blocks all workflows)

### Problem
- AI generates prompts with OR options: "use zoho_crm or salesforce", "send via slack_message or google_gmail"
- This causes workflow generator to try including ALL mentioned nodes
- Leads to validation errors and incorrect workflows
- All 4 variations look similar (no uniqueness)

### Solution: **ENHANCED PROMPT ENGINEERING**
Update the summarize layer system prompt to:
1. **Generate unique variations** with different output nodes
2. **No OR options** - specify ONE output node per variation
3. **Trigger variety** - mix of webhook and manual triggers
4. **Clear differentiation** - each variation is obviously unique

### Implementation

**File**: `worker/src/services/ai/summarize-layer.ts`
**Location**: `buildClarificationPrompt()` method (lines 440-543)

**Changes**:

```typescript
private buildClarificationPrompt(userPrompt: string, allKeywords: string[]): string {
  // ... existing keyword filtering ...
  
  return `User Prompt: "${userPrompt}"

Available Node Keywords (${keywordsToUse.length} most relevant keywords):
${keywordsToUse.join(', ')}

🚨 CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST generate EXACTLY 4 (FOUR) UNIQUE, SPECIFIC prompt variations. Each variation MUST:
- Specify EXACTLY ONE output node (NOT "or" options)
- Use DIFFERENT output nodes across variations
- Use DIFFERENT triggers (mix of manual_trigger and webhook)
- Be 3-4 lines long with specific details
- Be obviously different from other variations

YOUR ROLE:
You are a workflow automation expert. Transform vague user prompts into detailed, structured prompts that specify EXACTLY ONE output node per variation.

CRITICAL RULES - NO EXCEPTIONS:
1. ❌ NEVER use "or" or "either" in prompts (e.g., "use zoho_crm or salesforce" is FORBIDDEN)
2. ✅ ALWAYS specify ONE specific output node per variation
3. ✅ Each variation MUST use a DIFFERENT output node
4. ✅ Variations 1-2: Use manual_trigger
5. ✅ Variations 3-4: Use webhook trigger
6. ✅ Each variation must be obviously unique (different output, different trigger)

VARIATION REQUIREMENTS (MANDATORY):
- Variation 1: manual_trigger + ONE specific output node (e.g., zoho_crm ONLY)
- Variation 2: manual_trigger + DIFFERENT output node (e.g., slack_message ONLY)
- Variation 3: webhook trigger + DIFFERENT output node (e.g., google_gmail ONLY)
- Variation 4: webhook trigger + DIFFERENT output node (e.g., salesforce ONLY)

OUTPUT NODE SELECTION:
If user mentions multiple outputs (e.g., "zoho_crm or salesforce", "slack_message or google_gmail"):
- Variation 1: Use FIRST mentioned output (e.g., zoho_crm)
- Variation 2: Use SECOND mentioned output (e.g., salesforce)
- Variation 3: Use THIRD mentioned output (e.g., slack_message)
- Variation 4: Use FOURTH mentioned output (e.g., google_gmail)

If user mentions fewer than 4 outputs, distribute them across variations and use related alternatives:
- Example: User says "zoho_crm or salesforce"
  - Variation 1: zoho_crm (manual_trigger)
  - Variation 2: salesforce (manual_trigger)
  - Variation 3: slack_message (webhook) - related notification output
  - Variation 4: google_gmail (webhook) - related communication output

TRIGGER SELECTION:
- Variations 1-2: MUST use manual_trigger
- Variations 3-4: MUST use webhook trigger
- This ensures clear differentiation between variations

EXAMPLE OF GOOD VARIATIONS (User prompt: "score leads and route to CRM or notify via Slack or Gmail"):

Variation 1:
"Create a workflow that starts with a manual_trigger node. Use ai_chat_model to analyze and score incoming leads based on specific qualification metrics. Route qualified leads directly to zoho_crm using the crm_lead_update operation. Send detailed lead information including score and qualification criteria to the CRM system."

Variation 2:
"Build a workflow automation beginning with manual_trigger. Process incoming leads through ai_chat_model node configured for lead scoring and analysis. Send notifications for qualified leads using slack_message node to alert the sales team via Slack channel with lead details and qualification status."

Variation 3:
"Design a webhook-triggered workflow that receives incoming lead data via webhook trigger. Analyze and score leads using ai_chat_model node based on specific qualification metrics. Send email notifications for qualified leads using google_gmail node to notify the sales team with comprehensive lead information and scoring details."

Variation 4:
"Create a webhook-based workflow that starts with webhook trigger to receive incoming lead submissions. Process leads through ai_chat_model for intelligent scoring and qualification analysis. Route qualified leads to salesforce using the create_lead operation to automatically add them to the CRM system with all relevant lead data."

EXAMPLE OF BAD VARIATIONS (DO NOT DO THIS):
❌ "use zoho_crm or salesforce" - FORBIDDEN (OR option)
❌ "send via slack_message or google_gmail" - FORBIDDEN (OR option)
❌ All variations using same output node - FORBIDDEN (not unique)
❌ All variations using same trigger - FORBIDDEN (not unique)

OUTPUT FORMAT (STRICT JSON - NO MARKDOWN, NO CODE BLOCKS):
{
  "clarifiedIntent": "Detailed version with ONE specific output node (not OR options)",
  "matchedKeywords": ["keyword1", "keyword2"],
  "variations": [
    {
      "prompt": "Create workflow with manual_trigger. Use ai_chat_model to score leads. Route to zoho_crm ONLY (no OR options).",
      "matchedKeywords": ["manual_trigger", "ai_chat_model", "zoho_crm"],
      "reasoning": "Variation 1: manual_trigger + zoho_crm output (unique)"
    },
    {
      "prompt": "Build workflow with manual_trigger. Use ai_chat_model to analyze leads. Send notifications via slack_message ONLY (no OR options).",
      "matchedKeywords": ["manual_trigger", "ai_chat_model", "slack_message"],
      "reasoning": "Variation 2: manual_trigger + slack_message output (unique)"
    },
    {
      "prompt": "Design workflow with webhook trigger. Use ai_chat_model to score leads. Send emails via google_gmail ONLY (no OR options).",
      "matchedKeywords": ["webhook", "ai_chat_model", "google_gmail"],
      "reasoning": "Variation 3: webhook + google_gmail output (unique)"
    },
    {
      "prompt": "Create workflow with webhook trigger. Use ai_chat_model to analyze leads. Route to salesforce ONLY (no OR options).",
      "matchedKeywords": ["webhook", "ai_chat_model", "salesforce"],
      "reasoning": "Variation 4: webhook + salesforce output (unique)"
    }
  ]
}

🚨 CRITICAL: 
- Respond with ONLY valid JSON. No markdown, no code blocks.
- The "variations" array MUST contain exactly 4 items.
- Each "prompt" MUST specify ONE output node (NO "or" or "either").
- Variations 1-2: manual_trigger
- Variations 3-4: webhook trigger
- Each variation MUST use a DIFFERENT output node.
- Each prompt MUST be 3-4 lines long with specific details.`;
}
```

### Testing Strategy

**Unit Tests**:
```typescript
describe('Summarize Layer - Unique Variations', () => {
  it('should generate 4 unique variations with different output nodes', async () => {
    const prompt = "score leads and route to CRM or notify via Slack or Gmail";
    const result = await summarizeLayerService.processPrompt(prompt);
    
    expect(result.promptVariations.length).toBe(4);
    
    // Check no OR options
    result.promptVariations.forEach(v => {
      expect(v.prompt).not.toMatch(/\bor\b|\beither\b/i);
    });
    
    // Check unique outputs
    const outputs = result.promptVariations.map(v => {
      if (v.prompt.includes('zoho_crm')) return 'zoho_crm';
      if (v.prompt.includes('salesforce')) return 'salesforce';
      if (v.prompt.includes('slack_message')) return 'slack_message';
      if (v.prompt.includes('google_gmail')) return 'google_gmail';
      return null;
    });
    
    const uniqueOutputs = new Set(outputs.filter(Boolean));
    expect(uniqueOutputs.size).toBeGreaterThanOrEqual(2); // At least 2 different outputs
  });
  
  it('should use manual_trigger for variations 1-2 and webhook for 3-4', async () => {
    const result = await summarizeLayerService.processPrompt("test prompt");
    
    expect(result.promptVariations[0].prompt).toMatch(/manual_trigger/i);
    expect(result.promptVariations[1].prompt).toMatch(/manual_trigger/i);
    expect(result.promptVariations[2].prompt).toMatch(/webhook/i);
    expect(result.promptVariations[3].prompt).toMatch(/webhook/i);
  });
});
```

### Success Criteria
- ✅ **No OR options**: All prompts specify ONE output node
- ✅ **Unique outputs**: Each variation uses different output node
- ✅ **Trigger variety**: Mix of manual_trigger and webhook
- ✅ **Clear differentiation**: Each variation is obviously unique
- ✅ **4 variations**: Always generates exactly 4 variations

---

## 📋 Phase 2: Fix Capability Validation (CRITICAL)

### Priority: **P0 - CRITICAL** (Causes validation failures)

### Problem
- Validation looks for capabilities: `output, write_data`
- But nodes have: `write_crm`, `send_email`, `send_message`
- Mismatch causes validation to fail even when nodes are correct

### Solution: **FIX CAPABILITY MAPPINGS**
Update capability registry to include all required capabilities for output nodes.

### Implementation

**File**: `worker/src/services/ai/node-capability-registry-dsl.ts`
**Location**: `initializeCapabilities()` method (lines 35-99)

**Changes**:

```typescript
private initializeCapabilities(): void {
  // Output capabilities (send/write operations)
  this.setCapabilities('google_gmail', [
    'send_email', 
    'output',           // ✅ ADD: Generic output capability
    'write_data',       // ✅ ADD: Write data capability
    'communication'
  ]);
  
  this.setCapabilities('slack_message', [
    'send_message', 
    'output',           // ✅ ADD: Generic output capability
    'write_data',       // ✅ ADD: Write data capability
    'communication', 
    'notification'
  ]);
  
  // CRM/Write operations (outputs)
  this.setCapabilities('hubspot', [
    'write_crm', 
    'output',           // ✅ ADD: Generic output capability
    'write_data',       // ✅ ADD: Write data capability
    'crm'
  ]);
  
  this.setCapabilities('salesforce', [
    'write_crm', 
    'output',           // ✅ ADD: Generic output capability
    'write_data',       // ✅ ADD: Write data capability
    'crm'
  ]);
  
  this.setCapabilities('zoho_crm', [
    'write_crm', 
    'output',           // ✅ ADD: Generic output capability
    'write_data',       // ✅ ADD: Write data capability
    'crm'
  ]);
  
  // ... rest of capabilities ...
}
```

**File**: `worker/src/services/ai/pre-compilation-validator.ts`
**Location**: Capability validation logic

**Also Check**: Ensure validation logic accepts ANY of the capabilities, not ALL of them.

### Success Criteria
- ✅ **All output nodes** have `output` and `write_data` capabilities
- ✅ **Validation passes** when nodes are correctly placed in DSL
- ✅ **No false negatives** - valid workflows don't fail validation

---

## 📋 Phase 3: Verify Duplicate AI Node Detection (HIGH)

### Priority: **P1 - HIGH** (Prevents duplicate nodes)

### Problem
- Still seeing `ai_agent` created when `ai_chat_model` exists
- Duplicate detection may not be working at all layers

### Solution: **VERIFY AND ENHANCE**
Check all layers where duplicate detection should work:
1. DSL generation (already fixed)
2. Node injection (already exists)
3. Operation optimizer (already exists)

### Implementation

**Verification Checklist**:
- [ ] DSL duplicate detection runs AFTER LLM injection ✅ (already fixed)
- [ ] Node injection duplicate check runs BEFORE injection ✅ (already exists)
- [ ] Operation optimizer removes duplicates ✅ (already exists)
- [ ] All use same operation signature logic ✅ (need to verify)

**File**: `worker/src/services/ai/workflow-dsl.ts`
**Location**: `detectDuplicateOperationsInDSL()` method

**Verify**:
```typescript
// Should detect ai_agent and ai_chat_model as duplicates
const testTransformations = [
  { id: 'tf_1', type: 'ai_chat_model', operation: 'analyze' },
  { id: 'tf_2', type: 'ai_agent', operation: 'analyze' },
];

const duplicates = this.detectDuplicateOperationsInDSL(testTransformations);
expect(duplicates.length).toBe(1);
expect(duplicates[0].operation).toBe('ai_processing');
```

### Success Criteria
- ✅ **No duplicate AI nodes** in generated workflows
- ✅ **Detection works** at DSL, injection, and optimization layers
- ✅ **Consistent logic** across all layers

---

## 📋 Phase 4: Enhanced Prompt Validation (MEDIUM)

### Priority: **P2 - MEDIUM** (Quality improvement)

### Solution: **ADD VALIDATION**
Add validation to detect and reject prompts with OR options.

**File**: `worker/src/services/ai/summarize-layer.ts`
**Location**: `isValidResult()` method (lines 390-407)

**Changes**:

```typescript
private isValidResult(result: SummarizeLayerResult): boolean {
  // ... existing checks ...
  
  // ✅ NEW: Check for OR options (forbidden)
  for (const variation of result.promptVariations) {
    const promptLower = variation.prompt.toLowerCase();
    
    // Check for OR patterns
    if (promptLower.match(/\bor\s+(zoho_crm|salesforce|slack_message|google_gmail|gmail|slack)/i)) {
      console.warn(`[AIIntentClarifier] ⚠️  Variation contains OR option: ${variation.prompt.substring(0, 100)}`);
      return false;
    }
    
    // Check for "either" patterns
    if (promptLower.match(/\beither\s+(zoho_crm|salesforce|slack_message|google_gmail|gmail|slack)/i)) {
      console.warn(`[AIIntentClarifier] ⚠️  Variation contains "either" option: ${variation.prompt.substring(0, 100)}`);
      return false;
    }
  }
  
  // ✅ NEW: Check for uniqueness (different output nodes)
  const outputNodes = result.promptVariations.map(v => {
    const prompt = v.prompt.toLowerCase();
    if (prompt.includes('zoho_crm')) return 'zoho_crm';
    if (prompt.includes('salesforce')) return 'salesforce';
    if (prompt.includes('slack_message') || prompt.includes('slack')) return 'slack_message';
    if (prompt.includes('google_gmail') || prompt.includes('gmail')) return 'google_gmail';
    return null;
  });
  
  const uniqueOutputs = new Set(outputNodes.filter(Boolean));
  if (uniqueOutputs.size < 2) {
    console.warn(`[AIIntentClarifier] ⚠️  Variations not unique enough: only ${uniqueOutputs.size} different output nodes`);
    return false;
  }
  
  return true;
}
```

### Success Criteria
- ✅ **OR options detected** and rejected
- ✅ **Uniqueness validated** before accepting result
- ✅ **Retry on failure** with improved prompt

---

## 📋 Phase 5: Testing & Validation (CRITICAL)

### Test Cases

**Test 1: Unique Variations**
```typescript
const prompt = "score leads and route to CRM or notify via Slack or Gmail";
const result = await summarizeLayerService.processPrompt(prompt);

// Should have 4 unique variations
expect(result.promptVariations.length).toBe(4);

// No OR options
result.promptVariations.forEach(v => {
  expect(v.prompt).not.toMatch(/\bor\b|\beither\b/i);
});

// Different outputs
const outputs = extractOutputNodes(result.promptVariations);
expect(new Set(outputs).size).toBeGreaterThanOrEqual(2);
```

**Test 2: Capability Validation**
```typescript
const dsl = {
  outputs: [
    { type: 'zoho_crm', operation: 'create' },
    { type: 'slack_message', operation: 'create' },
  ]
};

const validation = validateDSL(dsl);
expect(validation.valid).toBe(true);
expect(validation.errors).not.toContain('Missing required capabilities');
```

**Test 3: Duplicate Detection**
```typescript
const transformations = [
  { type: 'ai_chat_model', operation: 'analyze' },
  { type: 'ai_agent', operation: 'analyze' },
];

const duplicates = detectDuplicateOperationsInDSL(transformations);
expect(duplicates.length).toBe(1);
expect(duplicates[0].type1).toBe('ai_agent');
expect(duplicates[0].type2).toBe('ai_chat_model');
```

---

## 📊 Implementation Timeline

### Day 1: Phase 1 (Summarize Layer)
- Update system prompt
- Add validation for OR options
- Test with sample prompts

### Day 2: Phase 2 (Capability Validation)
- Fix capability mappings
- Update validation logic
- Test validation passes

### Day 3: Phase 3 (Duplicate Detection)
- Verify all layers
- Add logging
- Test duplicate scenarios

### Day 4: Phase 4 (Enhanced Validation)
- Add uniqueness checks
- Improve error messages
- Test edge cases

### Day 5: Phase 5 (Testing)
- Write comprehensive tests
- Integration testing
- Fix any remaining issues

---

## 🚀 Deployment Strategy

### Feature Flags
```typescript
const FEATURES = {
  UNIQUE_PROMPT_VARIATIONS: process.env.UNIQUE_PROMPT_VARIATIONS !== 'false',
  FIXED_CAPABILITY_VALIDATION: process.env.FIXED_CAPABILITY_VALIDATION !== 'false',
  ENHANCED_DUPLICATE_DETECTION: process.env.ENHANCED_DUPLICATE_DETECTION !== 'false',
};
```

### Rollout Plan
1. **Phase 1**: Deploy to staging, test with sample prompts
2. **Phase 2**: Enable for 10% of requests (canary)
3. **Phase 3**: Enable for 50% of requests
4. **Phase 4**: Enable for 100% of requests
5. **Phase 5**: Remove feature flags (permanent)

---

## 📈 Success Metrics

### Before Fix
- ❌ ~80% of prompts have OR options
- ❌ ~50% of workflows fail capability validation
- ❌ ~20% of workflows have duplicate AI nodes
- ❌ All variations look similar

### After Fix (Target)
- ✅ **0%** of prompts have OR options
- ✅ **100%** of valid workflows pass capability validation
- ✅ **0%** of workflows have duplicate AI nodes
- ✅ **100%** of variations are unique and specific

---

## ✅ Checklist Before Merge

- [ ] Summarize layer generates unique variations
- [ ] No OR options in any variation
- [ ] Mix of manual_trigger and webhook triggers
- [ ] Capability validation passes for all output nodes
- [ ] Duplicate detection works at all layers
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code review approved
- [ ] Documentation updated

---

## 🎯 Final Notes

This is a **COMPREHENSIVE FIX** that addresses:
1. **Prompt Generation**: Unique, specific variations
2. **Validation**: Correct capability checking
3. **Deduplication**: Works at all layers
4. **User Experience**: Clear differentiation between options

**Result**: World-class workflow generation that produces correct, unique workflows every time.
