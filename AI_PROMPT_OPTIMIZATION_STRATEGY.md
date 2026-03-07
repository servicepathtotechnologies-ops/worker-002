# AI Prompt Optimization Strategy
## Ensuring Keywords Are Always Available to AI

---

## 🎯 Problem Statement

**Current Issue**: Keywords are provided to AI in some stages but not others, causing inconsistent node type resolution.

**Solution**: Optimize AI prompts at every stage to include:
1. Node metadata (keywords, capabilities, descriptions)
2. Semantic context from previous stages
3. Resolved node types with reasoning
4. User intent understanding

---

## 📋 AI Prompt Templates

### Template 1: Semantic Intent Analyzer

**Purpose**: Understand user intent at word level

**System Prompt**:
```
You are a semantic intent analyzer. Your job is to understand what the user wants to do at a deep, semantic level.

Your task:
1. Parse the user prompt word by word
2. Extract semantic meaning (not just literal words)
3. Identify:
   - Actions: What does the user want to do? (post, publish, send, create, read, etc.)
   - Targets: Where/what is the target? (linkedin, twitter, email, crm, etc.)
   - Categories: What domain? (social_media, communication, data_storage, etc.)
4. Generate semantic keywords that capture the intent

Examples:
- "post on linkedin" → Actions: ["post", "publish"], Target: ["linkedin"], Category: ["social_media"], Keywords: ["post", "publish", "share", "linkedin", "social"]
- "send email via gmail" → Actions: ["send", "email"], Target: ["gmail"], Category: ["communication"], Keywords: ["send", "email", "mail", "gmail", "communication"]

Output Format (JSON):
{
  "actions": ["action1", "action2"],
  "targets": ["target1", "target2"],
  "categories": ["category1", "category2"],
  "primaryIntent": "main_intent_description",
  "semanticKeywords": ["keyword1", "keyword2", "keyword3"]
}
```

**Key Features**:
- Word-level analysis
- Semantic understanding
- Context extraction
- Keyword generation

---

### Template 2: Node Type Resolver

**Purpose**: Match semantic intent to node types

**System Prompt**:
```
You are a node type resolver. Your job is to match user intent to the best available node type using semantic understanding.

Available Nodes:
{formatted_node_metadata}

Each node has:
- type: Canonical node type name
- keywords: All possible keywords/aliases (e.g., ["linkedin", "li", "linked_in", "post", "publish"])
- capabilities: What the node can do (e.g., ["send_post", "output", "social_media"])
- description: Natural language description
- useCases: Common use cases

User Intent:
{formatted_semantic_intent}

Your Task:
1. Understand what the user wants to do semantically
2. Find the best matching node based on:
   - Semantic similarity (not exact string match)
   - Keyword relevance (user words match node keywords)
   - Capability alignment (node can do what user wants)
   - Use case match (node is used for this purpose)
3. Consider variations:
   - "post on linkedin" = "post_to_linkedin" = "linkedin_post" = "publish to linkedin"
   - All should resolve to node type "linkedin"
4. Provide confidence score (0.0 - 1.0)
5. Explain your reasoning

Important Rules:
- Use SEMANTIC understanding, not pattern matching
- Handle variations automatically (spaces, dashes, prepositions)
- Match based on meaning, not exact words
- If user says "post on linkedin", match to "linkedin" node (keywords include "post" and "linkedin")

Output Format (JSON):
{
  "type": "canonical_node_type",
  "confidence": 0.95,
  "semanticMatch": {
    "matchedKeywords": ["keyword1", "keyword2"],
    "matchedCapabilities": ["capability1"],
    "reasoning": "User wants to publish to LinkedIn. Node 'linkedin' has keywords 'post', 'publish', 'linkedin' and capability 'send_post', which semantically matches the intent."
  },
  "alternatives": [
    {
      "type": "alternative_type",
      "confidence": 0.60,
      "reasoning": "..."
    }
  ]
}
```

**Key Features**:
- Semantic matching (not pattern)
- Handles all variations
- Confidence scoring
- Reasoning provided

---

### Template 3: Workflow Planner

**Purpose**: Generate workflow structure with node types

**System Prompt**:
```
You are a Workflow Planner Agent. Your job is to convert user prompts into workflow specifications.

IMPORTANT: Available Node Types (with keywords and capabilities):
{formatted_node_metadata}

When generating node types:
1. Use the CANONICAL node type names from the list above
2. Match user intent to nodes using SEMANTIC understanding
3. Consider keywords: If user says "post on linkedin", use node type "linkedin" (keywords include "post" and "linkedin")
4. Consider capabilities: If user wants to "send email", use node type "google_gmail" (capability: "send_email")

User Prompt:
{user_prompt}

Semantic Intent (from previous analysis):
{semantic_intent}

Resolved Node Types (if any):
{resolved_nodes}

Your Task:
1. Understand user intent semantically
2. Select appropriate node types from the available list
3. Use CANONICAL type names only
4. Match based on semantic meaning, not exact words

Output Format (JSON):
{
  "trigger": "manual" | "schedule" | "webhook",
  "data_sources": ["canonical_node_type"],
  "actions": ["canonical_node_type"],
  "transformations": ["canonical_node_type"],
  ...
}
```

**Key Features**:
- Node metadata always available
- Semantic context included
- Canonical types enforced
- Intent understanding

---

### Template 4: DSL Generator

**Purpose**: Generate DSL with correct node types

**System Prompt**:
```
You are a DSL Generator. Your job is to convert structured intent into workflow DSL.

IMPORTANT: Available Node Types (with keywords):
{formatted_node_metadata}

Resolved Node Types (from semantic analysis):
{resolved_nodes}

When categorizing nodes:
1. Use CANONICAL node type names
2. Match based on semantic understanding
3. Consider keywords and capabilities

Structured Intent:
{structured_intent}

Your Task:
1. Use resolved node types when available
2. For new node types, match semantically to available nodes
3. Categorize correctly (dataSource, transformation, output)
4. Use canonical types only

Output: Workflow DSL with canonical node types
```

**Key Features**:
- Resolved types from previous stage
- Node metadata available
- Semantic matching for new types
- Canonical types enforced

---

### Template 5: Validator

**Purpose**: Validate node types exist and are correct

**System Prompt**:
```
You are a Workflow Validator. Your job is to validate that all node types are correct.

Available Node Types:
{formatted_node_metadata}

Workflow to Validate:
{workflow}

Your Task:
1. Check all node types exist in available nodes
2. Validate semantic matches are correct
3. Suggest corrections if needed

Output: Validation results
```

**Key Features**:
- Node metadata for validation
- Semantic match verification
- Correction suggestions

---

## 🔄 Context Propagation Strategy

### Stage 1: Summarizer → Planner

**What to Pass**:
```typescript
{
  originalPrompt: string;
  semanticIntent: SemanticIntent;
  resolvedNodes: NodeResolution[];
  nodeMetadata: NodeMetadata[];
}
```

**How to Use**:
- Include semantic intent in planner prompt
- Include resolved nodes as hints
- Include node metadata for reference

---

### Stage 2: Planner → DSL Generator

**What to Pass**:
```typescript
{
  structuredIntent: StructuredIntent;
  semanticIntent: SemanticIntent;
  resolvedNodes: NodeResolution[];
  nodeMetadata: NodeMetadata[];
}
```

**How to Use**:
- Use resolved nodes when available
- Match new nodes semantically
- Reference node metadata

---

### Stage 3: DSL Generator → Validator

**What to Pass**:
```typescript
{
  workflow: Workflow;
  semanticContext: SemanticIntent;
  nodeMetadata: NodeMetadata[];
}
```

**How to Use**:
- Validate node types exist
- Check semantic matches
- Verify capabilities

---

## 🎯 Optimization Principles

### Principle 1: Always Include Node Metadata

**Every AI call should include**:
- All available node types
- Keywords for each node
- Capabilities for each node
- Descriptions and use cases

**Why**: AI can make informed decisions

---

### Principle 2: Preserve Semantic Context

**Every stage should receive**:
- Semantic intent from previous stages
- Resolved node types with reasoning
- User intent understanding

**Why**: Maintains understanding across stages

---

### Principle 3: Use Canonical Types

**All stages should use**:
- Canonical node type names
- Unified node type format
- Consistent representation

**Why**: Prevents type mismatches

---

### Principle 4: Semantic Matching Over Patterns

**AI should**:
- Understand meaning, not match patterns
- Handle variations automatically
- Use semantic similarity

**Why**: Works with any natural language

---

## 📊 Formatting Node Metadata for AI

### Format 1: Structured List

```
Available Nodes:

1. linkedin
   Keywords: linkedin, li, linked_in, post, publish, share, social
   Capabilities: send_post, output, social_media
   Description: Publish content to LinkedIn platform
   Use Cases: Social media posting, content distribution

2. twitter
   Keywords: twitter, tweet, post, publish, x
   Capabilities: send_post, output, social_media
   Description: Publish content to Twitter/X platform
   Use Cases: Social media posting, microblogging

...
```

### Format 2: JSON Structure

```json
{
  "nodes": [
    {
      "type": "linkedin",
      "keywords": ["linkedin", "li", "linked_in", "post", "publish", "share"],
      "capabilities": ["send_post", "output", "social_media"],
      "description": "Publish content to LinkedIn platform",
      "useCases": ["social media posting", "content distribution"]
    },
    ...
  ]
}
```

### Format 3: Natural Language

```
You have access to these nodes:

- linkedin: Used for posting content to LinkedIn. Keywords include: linkedin, post, publish, share. Can send posts and output content.

- twitter: Used for posting content to Twitter. Keywords include: twitter, tweet, post, publish. Can send posts and output content.

...
```

**Recommendation**: Use Format 1 (Structured List) for clarity and readability.

---

## 🚀 Implementation Checklist

### For Each AI Call Stage:

- [ ] Include node metadata in system prompt
- [ ] Include semantic intent from previous stages
- [ ] Include resolved node types (if any)
- [ ] Format metadata clearly for AI
- [ ] Emphasize semantic matching over patterns
- [ ] Request canonical type names only
- [ ] Ask for reasoning/confidence

### For Context Propagation:

- [ ] Pass semantic intent between stages
- [ ] Pass resolved node types
- [ ] Pass node metadata
- [ ] Maintain context throughout pipeline

### For Validation:

- [ ] Check node types exist
- [ ] Verify semantic matches
- [ ] Validate capabilities
- [ ] Suggest corrections if needed

---

## 📈 Expected Improvements

### Before (Pattern-Based):
- ❌ "post on linkedin" → Not found
- ❌ "publish to linkedin" → Not found
- ❌ "linkedin_post" → Not found
- ✅ "post_to_linkedin" → Found (if pattern exists)

### After (Semantic AI):
- ✅ "post on linkedin" → Resolved to "linkedin"
- ✅ "publish to linkedin" → Resolved to "linkedin"
- ✅ "linkedin_post" → Resolved to "linkedin"
- ✅ "post_to_linkedin" → Resolved to "linkedin"
- ✅ Any variation → Resolved correctly

---

**This strategy ensures keywords and semantic context are always available to AI, enabling world-class node type resolution.**
