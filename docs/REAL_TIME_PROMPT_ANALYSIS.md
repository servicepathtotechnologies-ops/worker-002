# Real-Time Prompt Analysis & Node Selection System

## ✅ Implementation Complete

The system now analyzes prompts in real-time and selects nodes from the node library using modern workflow examples for pattern recognition.

---

## 🔄 Real-Time Analysis Flow

### Step 1: User Prompt Input
```
User: "create a sales agent"
```

### Step 2: Intent Understanding (Layer 1)
**File:** `worker/src/services/ai/intent-engine.ts`

**What happens:**
1. **LLM Semantic Parsing**: Extracts structured intent using Qwen2.5 14B
2. **Few-Shot Learning**: Uses 3 most similar modern workflow examples
3. **Domain Ontology Mapping**: Maps actions to node capabilities

**Enhanced with Modern Examples:**
```typescript
// Gets similar modern examples for few-shot learning
const modernExamples = workflowTrainingService.getModernExamples(3, prompt);

// Includes examples in LLM prompt for better pattern recognition
examplesContext = modernExamples.map(ex => ({
  prompt: ex.goal,
  intent: ex.phase1.step4.requirements
}));
```

**Output:**
```json
{
  "goal": "create a sales agent",
  "actions": ["qualify lead", "send email", "schedule meeting"],
  "entities": ["lead", "email", "calendar", "crm"],
  "constraints": []
}
```

---

### Step 3: Task Planning (Layer 2)
**File:** `worker/src/services/ai/planner-engine.ts`

**What happens:**
- Converts intent into step-by-step plan
- Determines execution order and dependencies
- Uses ReAct planning or template matching

**Output:**
```json
[
  { "id": "step1", "action": "qualify lead", "order": 1 },
  { "id": "step2", "action": "send email", "order": 2, "dependsOn": ["step1"] },
  { "id": "step3", "action": "schedule meeting", "order": 3, "dependsOn": ["step2"] }
]
```

---

### Step 4: Node Selection (Layer 3) - **ENHANCED**
**File:** `worker/src/services/ai/node-resolver.ts`

**What happens:**
1. **Pattern Matching from Modern Examples** (NEW - Highest Priority)
   - Searches modern workflow examples for similar patterns
   - Matches intent to node patterns from real-world scenarios
   - Returns high confidence (0.95) if pattern matches

2. **Capability-Based Matching** (Fallback)
   - Matches intent to node capabilities
   - Uses capability index: `"email.send" → ["google_gmail"]`

3. **Provider Matching** (Fallback)
   - Matches provider-specific nodes
   - Example: `provider: "google" → google_gmail`

4. **Keyword Matching** (Last Resort)
   - Keyword-based fallback matching

**Enhanced Node Selection:**
```typescript
// Step 1: Try pattern matching from modern examples
const modernExamples = workflowTrainingService.getModernExamples(5, `${intent.action} ${intent.resource}`);

for (const example of modernExamples) {
  const selectedNodes = example.phase1.step5?.selectedNodes || [];
  
  // Check if any selected node matches the intent
  for (const nodeType of selectedNodes) {
    if (this.nodeMatchesIntent(nodeType, intent, schema)) {
      return {
        nodeId: nodeType,
        confidence: 0.95, // High confidence from real-world example
        reason: `Matched pattern from modern example: "${example.goal}"`
      };
    }
  }
}

// Step 2-4: Fallback to standard matching...
```

**Example Match:**
```
Intent: { action: "qualify", resource: "lead" }
↓
Modern Example: "create a sales agent" → selectedNodes: ["ai_agent", "if_else", "google_gmail"]
↓
Pattern Match: "qualify lead" → ai_agent (from sales agent example)
↓
Result: { nodeId: "ai_agent", confidence: 0.95 }
```

---

### Step 5: Property Inference (Layer 4)
**File:** `worker/src/services/ai/property-inference-engine.ts`

**What happens:**
- Extracts context (who, what, when, why, where, how)
- Completes node schema with inferred values
- Scores confidence for each field

**Output:**
```json
{
  "properties": {
    "userInput": "{{$json.leadData}}",
    "systemPrompt": "You are a sales qualification agent...",
    "chat_model": "qwen2.5:14b-instruct-q4_K_M"
  },
  "confidence": 0.85,
  "missingFields": [],
  "inferredFields": ["userInput", "systemPrompt", "chat_model"]
}
```

---

### Step 6: Workflow Graph Generation (Layer 5)
**File:** `worker/src/services/ai/workflow-compiler.ts`

**What happens:**
- Creates workflow DAG (Directed Acyclic Graph)
- Connects nodes based on plan dependencies
- Maps data contracts (outputs → inputs)

**Output:**
```json
{
  "nodes": [
    { "id": "trigger", "type": "webhook" },
    { "id": "step1", "type": "ai_agent" },
    { "id": "step2", "type": "if_else" },
    { "id": "step3", "type": "google_gmail" }
  ],
  "edges": [
    { "source": "trigger", "target": "step1" },
    { "source": "step1", "target": "step2" },
    { "source": "step2", "target": "step3" }
  ]
}
```

---

## 📊 Modern Workflow Examples Integration

### How Examples Are Used

**1. Intent Extraction (Few-Shot Learning)**
- Gets 3 most similar modern examples
- Includes in LLM prompt for pattern recognition
- Improves intent extraction accuracy

**2. Node Selection (Pattern Matching)**
- Gets 5 most similar modern examples
- Matches intent to node patterns from examples
- Returns high-confidence matches (0.95)

**3. Workflow Structure Generation**
- Uses examples in workflow builder prompts
- Provides real-world patterns for structure generation

### Example Matching Algorithm

```typescript
// Similarity scoring based on:
1. Keyword overlap (prompt words vs example goal/use_case)
2. Category match (sales, support, hr, finance, etc.)
3. Integration match (Gmail, Slack, HubSpot, etc.)
4. Action verb match (qualify, send, schedule, etc.)

// Returns top matches sorted by score
// Minimum relevance threshold: 0.1
```

---

## 🎯 Real-World Example: "create a sales agent"

### Analysis Flow:

**1. Intent Extraction:**
```
Input: "create a sales agent"
↓
Modern Examples Found:
  - "create a sales agent" (exact match)
  - "Sales & Lead Qualification Agent"
↓
Intent Extracted:
{
  "goal": "create a sales agent",
  "actions": ["qualify lead", "send email", "schedule meeting"],
  "entities": ["lead", "email", "calendar", "crm"]
}
```

**2. Node Selection:**
```
Action: "qualify lead"
↓
Pattern Match from Modern Example:
  Example: "create a sales agent"
  Selected Nodes: ["webhook", "ai_agent", "if_else", "google_gmail", "google_calendar", "hubspot"]
↓
Match: "qualify lead" → ai_agent (from example)
Result: { nodeId: "ai_agent", confidence: 0.95 }
```

**3. Workflow Generated:**
```
Nodes Selected:
- webhook (trigger)
- ai_agent (qualify lead)
- if_else (branch on qualification)
- google_gmail (send email)
- google_calendar (schedule meeting)
- hubspot (log to CRM)
```

---

## ✅ Verification Checklist

- [x] **Intent Engine** uses modern examples for few-shot learning
- [x] **Node Resolver** uses pattern matching from modern examples
- [x] **Training Service** loads and provides modern examples
- [x] **Similarity Matching** finds relevant examples based on prompt
- [x] **Real-Time Analysis** works end-to-end from prompt to workflow

---

## 🚀 How It Works in Practice

### Example 1: "create a sales agent"
```
1. Intent: "sales agent" → matches modern example "Sales & Lead Qualification Agent"
2. Nodes: ai_agent, if_else, google_gmail, google_calendar, hubspot
3. Confidence: 0.95 (pattern match from real-world example)
```

### Example 2: "create a customer support agent"
```
1. Intent: "customer support" → matches modern example "Customer Support Agent"
2. Nodes: ai_agent, if_else, database_read, javascript, zendesk, slack_message, google_gmail
3. Confidence: 0.95 (pattern match from real-world example)
```

### Example 3: "send email when form submitted"
```
1. Intent: "send email" → capability match
2. Nodes: webhook, google_gmail
3. Confidence: 0.85 (capability match, no modern example)
```

---

## 📝 Summary

**The system now:**
1. ✅ Analyzes prompts in real-time using LLM semantic parsing
2. ✅ Uses modern workflow examples for pattern recognition
3. ✅ Selects nodes from library based on:
   - Pattern matching from modern examples (highest priority)
   - Capability matching
   - Provider matching
   - Keyword matching
4. ✅ Provides high-confidence matches (0.95) when patterns match
5. ✅ Falls back to standard matching when no pattern match

**Key Enhancement:**
- Modern workflow examples are now integrated into the analysis pipeline
- Pattern matching from real-world scenarios improves node selection accuracy
- Few-shot learning improves intent extraction quality
