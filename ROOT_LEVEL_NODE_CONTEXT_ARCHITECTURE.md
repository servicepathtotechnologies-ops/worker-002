# ✅ ROOT-LEVEL: Node Context Architecture

## 🎯 Core Principle

**EVERY node MUST have context. This is MANDATORY, not optional.**

The AI MUST understand the context of every node to:
- Understand what each node does (semantic understanding)
- Match user intent to node capabilities
- Suggest alternatives based on context
- Generate workflows based on context understanding

---

## 🏗️ Architecture Components

### 1. **NodeContext Interface** (MANDATORY)

**File**: `worker/src/core/types/node-context.ts`

Every node MUST implement this interface:
- `description`: What the node does
- `useCases`: When to use this node
- `whenNotToUse`: When NOT to use this node
- `capabilities`: What the node can do
- `keywords`: Terms that describe the node
- `platforms`: Platform information
- `examples`: Example scenarios
- `inputContext`: What data the node expects
- `outputContext`: What data the node produces
- `integrationContext`: How the node connects to others

**Validation**: Every node is validated to ensure complete context.

---

### 2. **NodeContextRegistry** (SINGLE SOURCE OF TRUTH)

**File**: `worker/src/core/registry/node-context-registry.ts`

- Stores ALL node contexts
- Validates all contexts on startup
- Provides contexts to AI in readable format
- Throws error if any node missing context

**Initialization**: Automatically extracts context from NodeLibrary schemas.

---

### 3. **Context-Aware Node Selector** (AI UNDERSTANDING SYSTEM)

**File**: `worker/src/services/ai/context-aware-node-selector.ts`

- Analyzes user prompt context
- Reads ALL node contexts
- Matches user intent to node capabilities semantically
- Selects nodes based on context understanding
- Suggests alternatives when needed

**AI Process**:
1. Analyze user prompt → extract intent, actions, resources, platforms
2. Read all node contexts → understand what each node does
3. Match semantically → match user intent to node capabilities
4. Select nodes → based on context understanding
5. Explain selection → why this node matches

---

### 4. **System Prompts** (AI TRAINING)

**File**: `worker/src/services/ai/system-prompts/node-context-understanding.md`

- Trains AI to read node contexts
- Trains AI to understand semantically (not just keywords)
- Trains AI to match user intent to node capabilities
- Trains AI to explain selections

---

## ✅ Validation & Enforcement

### NodeLibrary Validation

**File**: `worker/src/services/nodes/node-library.ts`

On startup, NodeLibrary validates:
- ✅ Every node has `description`
- ✅ Every node has `aiSelectionCriteria` with `useCases` and `keywords`
- ✅ Every node has `capabilities` OR `keywords`

**If validation fails**: System throws error and stops boot.

---

### NodeContextRegistry Validation

**File**: `worker/src/core/registry/node-context-registry.ts`

On startup, NodeContextRegistry validates:
- ✅ Every node has complete context
- ✅ All contexts are valid (all required fields present)
- ✅ Contexts are properly formatted

**If validation fails**: System throws error and stops boot.

---

## 🔄 How It Works

### Step 1: Node Definition

Every node in NodeLibrary MUST have:
```typescript
{
  type: 'google_gmail',
  description: 'Send/receive emails via Gmail API (OAuth)',
  aiSelectionCriteria: {
    whenToUse: ['Email sending needed', 'Gmail integration'],
    whenNotToUse: ['Other email providers'],
    keywords: ['gmail', 'google mail', 'email'],
    useCases: ['Email notifications', 'Email automation'],
  },
  capabilities: ['email.send', 'gmail.send', 'google.mail'],
  providers: ['google'],
  keywords: ['gmail', 'google mail', 'google email'],
}
```

### Step 2: Context Extraction

NodeContextRegistry automatically extracts context:
```typescript
const context = extractNodeContext(schema);
// Creates complete NodeContext with all fields
```

### Step 3: Context Validation

System validates context on startup:
```typescript
const validation = validateNodeContext(context);
if (!validation.valid) {
  throw new Error('Node missing required context');
}
```

### Step 4: AI Context Understanding

When user gives prompt:
```typescript
// AI analyzes user prompt
const userContext = await selector.analyzeUserPromptContext(userPrompt);

// AI reads all node contexts
const allContexts = nodeContextRegistry.getAllContextsForAI();

// AI matches user context to node contexts
const matches = await selector.matchUserContextToNodes(userContext);

// AI selects nodes based on context understanding
const selectedNodes = matches.matches.map(m => m.nodeType);
```

### Step 5: Node Selection

AI selects nodes based on:
- ✅ User intent matches node capabilities
- ✅ User use case matches node use cases
- ✅ User keywords match node keywords (semantically)
- ✅ Platform preferences match node platforms

---

## 🎯 Example Flow

### User Prompt: "Monitor Git repos and alert DevOps if build fails"

**Step 1: AI Analyzes User Context**
```typescript
{
  intent: "Monitor Git repositories and send alerts",
  actions: ["monitor", "alert"],
  resources: ["git", "repos", "build"],
  platforms: ["github"],
  useCase: "monitoring + notification"
}
```

**Step 2: AI Reads Node Contexts**

**github node context**:
- Description: "Monitor Git repositories and trigger workflows"
- Use Cases: ["Git repository monitoring", "Build status tracking"]
- Capabilities: ["git.monitor", "repository.watch", "webhook.trigger"]
- Keywords: ["github", "git", "repository", "build"]
- ✅ MATCHES: "monitor Git repos"

**slack_message node context**:
- Description: "Send messages to Slack channels"
- Use Cases: ["Team notifications", "Alerts", "DevOps notifications"]
- Capabilities: ["notification.send", "alert.send"]
- Keywords: ["slack", "notification", "alert", "devops"]
- ✅ MATCHES: "alert DevOps"

**Step 3: AI Matches Contexts**

AI matches:
- User intent "monitor Git repos" → `github` node capability "git.monitor" ✅
- User intent "alert DevOps" → `slack_message` node use case "DevOps notifications" ✅

**Step 4: AI Selects Nodes**

AI selects:
- `github` (trigger) - matches "monitor Git repos"
- `slack_message` (output) - matches "alert DevOps"

**Step 5: Validation**

- `assertValidNodeType('github')` ✅
- `assertValidNodeType('slack_message')` ✅
- Registry lookup ✅

---

## ✅ Benefits

### 1. **Root-Level Architecture**
- Context is MANDATORY for all nodes
- No patchwork - systematic context for all nodes
- Validation ensures completeness

### 2. **AI Understanding**
- AI reads node contexts (not just types)
- AI understands semantically (not just keywords)
- AI matches user intent to node capabilities

### 3. **No New Nodes Needed**
- Understand existing nodes better
- Use capabilities for matching
- Suggest alternatives when needed

### 4. **Systematic Context**
- Every node has same context structure
- AI can process all nodes uniformly
- No special cases or patches

---

## 🚨 Error Handling

### If Node Missing Context

**NodeLibrary startup**:
```
[NodeLibrary] ❌ ROOT-LEVEL ERROR: 5 node(s) missing required context:
  - node1 (missing description)
  - node2 (missing useCases in aiSelectionCriteria)
  - node3 (missing capabilities or keywords)
  
Every node MUST have complete context. This is a root-level architectural requirement.
```

**System stops boot** - Fix nodes before continuing.

### If Context Invalid

**NodeContextRegistry startup**:
```
[NodeContextRegistry] ❌ 3 node(s) have invalid context:
  - node1: missing description
  - node2: missing use cases
  
Fix these nodes: node1, node2, node3
```

**System stops boot** - Fix contexts before continuing.

---

## 📊 Summary

**✅ ROOT-LEVEL Architecture**:
- Every node MUST have context (mandatory)
- Context is validated on startup
- AI reads and understands all contexts
- AI matches user intent to node contexts semantically
- No patchwork - systematic context for all nodes

**✅ AI Understanding**:
- AI analyzes user prompt context
- AI reads all node contexts
- AI matches semantically (not just keywords)
- AI selects based on context understanding
- AI explains selections

**✅ Validation**:
- NodeLibrary validates all nodes have context
- NodeContextRegistry validates all contexts are complete
- System stops boot if validation fails

**This is a ROOT-LEVEL architectural requirement. Every node has context, and AI MUST use it to understand and select nodes.**

---

**Last Updated**: Root-level node context architecture implementation
**Status**: ✅ **IMPLEMENTED** - Context is mandatory for all nodes
