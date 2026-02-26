# Production Workflow Generation Prompt - Usage Guide

## Overview

The `PRODUCTION_WORKFLOW_GENERATION_PROMPT.md` is a comprehensive, production-level system prompt designed to address critical issues in workflow generation:

1. **Invalid Node Types** - Prevents using non-existent nodes (e.g., replacing `form` with `text_formatter`)
2. **Multiple Credential Requests** - Unifies all credential collection into a single stage
3. **Validation Errors** - Ensures workflows pass all validation checks
4. **Orphan Nodes** - Prevents disconnected nodes
5. **Incomplete Configurations** - Requires complete node configurations

## Key Features

### 3-Stage Process

1. **Stage 1: Initial Requirement Analysis**
   - Comprehensive parsing of user requirements
   - Trigger, action, condition, and channel identification
   - Data field extraction

2. **Stage 2: Analysis & Clarification**
   - Ask ONLY critical questions
   - Design complete workflow structure
   - Map all nodes and connections

3. **Stage 3: Final Workflow Generation**
   - Generate complete workflow JSON
   - Unified credential container
   - Configuration questions
   - Full validation

### Critical Improvements

#### 1. Node Type Validation
- **Problem**: System was generating `form` nodes but then replacing them with `text_formatter`
- **Solution**: Explicit validation against available node library
- **Rule**: `form` node EXISTS - use it for form submissions

#### 2. Unified Credential Management
- **Problem**: Multiple credential requests at different stages
- **Solution**: Single unified credential container presented ONCE after workflow generation
- **Format**: All credentials listed together with mappings to nodes

#### 3. Complete Workflow Structure
- **Problem**: Orphan nodes, missing connections, validation errors
- **Solution**: Mandatory validation checklist before finalization
- **Requirements**: All nodes must have proper connections and complete configurations

## Integration

### Option 1: Replace Existing Prompt

Update `workflow-builder.ts` to use the new prompt:

```typescript
private getWorkflowGenerationSystemPrompt(): string {
  try {
    // Try production prompt first
    const productionPromptPath = path.join(__dirname, 'PRODUCTION_WORKFLOW_GENERATION_PROMPT.md');
    if (fs.existsSync(productionPromptPath)) {
      const prompt = fs.readFileSync(productionPromptPath, 'utf-8');
      const nodeReference = this.generateNodeReference();
      return prompt + '\n' + nodeReference;
    }
    
    // Fallback to original
    const promptPath = path.join(__dirname, 'WORKFLOW_GENERATION_SYSTEM_PROMPT.md');
    if (fs.existsSync(promptPath)) {
      const prompt = fs.readFileSync(promptPath, 'utf-8');
      const nodeReference = this.generateNodeReference();
      return prompt + '\n' + nodeReference;
    }
    
    return this.getEssentialSystemPrompt();
  } catch (error) {
    console.warn('⚠️  Could not load system prompt, using fallback');
    return this.getEssentialSystemPrompt();
  }
}
```

### Option 2: Use as Reference

Keep the production prompt as a reference document and gradually integrate its principles into the existing prompt.

### Option 3: A/B Testing

Use the production prompt for specific workflow types (e.g., form-based workflows) while keeping the original for others.

## Expected Output Format

The prompt enforces a specific output format:

```json
{
  "phase": "WORKFLOW_GENERATED",
  "requiresConfiguration": true,
  "workflow": {
    "nodes": [...],
    "edges": [...]
  },
  "configuration": {
    "questions": [...]
  },
  "credentials": {
    "unified": true,
    "required": [...]
  },
  "validation": {
    "status": "valid",
    "checks": {...}
  }
}
```

## Validation Checklist

The prompt includes a mandatory validation checklist:

- [ ] All node types exist in library
- [ ] No orphan nodes
- [ ] All connections complete
- [ ] Credentials defined and unified
- [ ] Data flows complete
- [ ] All config fields present

## Example: Contact Form Workflow

For the prompt: "If someone fills out my 'Contact Us' Form, have the AI Agent check if it's spam. If it's real, gmail them a 'Thank You' and notify the team on Slack."

### Correct Implementation:

1. **Trigger**: `form` node (NOT webhook, NOT text_formatter)
2. **Spam Check**: `ollama_chat` node
3. **Condition**: `if_else` node
4. **Gmail**: `google_gmail` node
5. **Slack**: `slack_message` node

### Credentials (Unified):
- Google OAuth (Gmail)
- Slack Webhook URL

**All credentials presented ONCE in a single container.**

## Testing

To test the new prompt:

1. Use a form-based workflow prompt
2. Verify `form` node is used (not replaced)
3. Check credentials are unified in single container
4. Validate workflow passes all checks
5. Ensure no orphan nodes or validation errors

## Migration Notes

When migrating to the production prompt:

1. **Backup** existing prompt
2. **Test** with known workflows
3. **Monitor** for any regressions
4. **Adjust** as needed based on results

## Support

For issues or questions about the production prompt:

1. Check validation checklist
2. Verify node types against library
3. Ensure credentials are unified
4. Review workflow structure

---

**Last Updated**: 2026-02-01
**Version**: 3.0
