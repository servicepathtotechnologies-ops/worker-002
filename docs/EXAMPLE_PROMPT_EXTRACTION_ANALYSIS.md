# Example: Prompt Extraction Analysis

## User Prompt
```
"Repo monitoring for GitHub, GitLab, Bitbucket, integrated with Jenkins"
```

---

## 🔍 AI Extraction Process (Step-by-Step)

### Step 1: SimpleIntent Extraction (AI/LLM)

**What the AI extracts automatically:**

```json
{
  "verbs": ["monitoring", "integrated"],
  "sources": [],
  "destinations": [],
  "transformations": [],
  "nodeMentions": [  // ✅ AI extracts node types directly mentioned
    {
      "nodeType": "github",
      "context": "Repo monitoring for GitHub",
      "inferredOperation": "monitor",  // From "monitoring"
      "category": "dataSource"  // Monitoring = reading data
    },
    {
      "nodeType": "gitlab",
      "context": "Repo monitoring for GitLab",
      "inferredOperation": "monitor",
      "category": "dataSource"
    },
    {
      "nodeType": "bitbucket",
      "context": "Repo monitoring for Bitbucket",
      "inferredOperation": "monitor",
      "category": "dataSource"
    },
    {
      "nodeType": "jenkins",
      "context": "integrated with Jenkins",
      "inferredOperation": "integrate",  // From "integrated with"
      "category": "output"  // Integration = triggering/action
    }
  ],
  "trigger": {
    "type": "schedule",  // Monitoring implies scheduled checks
    "description": "Periodic repo monitoring"
  }
}
```

---

## 🎯 Operation Inference (Schema-Based)

### How Operations Are Inferred

#### 1. "monitoring" → Operation Mapping

**Context**: "Repo monitoring for GitHub, GitLab, Bitbucket"

**AI Reasoning**:
- "monitoring" = checking status repeatedly
- For DevOps nodes (github, gitlab, bitbucket), monitoring operations are:
  - `listRepos` - List repositories
  - `getRepo` - Get repository details
  - `listCommits` - List commits
  - `getWorkflowRuns` - Get workflow runs
  - `listIssues` - List issues

**Schema Match**:
- GitHub schema has: `listRepos`, `getRepo`, `listCommits`, `getWorkflowRuns`
- "monitoring" verb → matches `listRepos` or `getWorkflowRuns` (monitoring operations)
- **Selected Operation**: `listRepos` (highest confidence for monitoring)

#### 2. "integrated with" → Operation Mapping

**Context**: "integrated with Jenkins"

**AI Reasoning**:
- "integrated with" = triggering/connecting
- For Jenkins, integration operations are:
  - `build_job` - Trigger Jenkins job
  - `get_build_status` - Get build status
  - `poll_build_status` - Poll build status

**Schema Match**:
- Jenkins schema has: `build_job`, `get_build_status`, `poll_build_status`
- "integrated with" verb → matches `build_job` or `get_build_status`
- **Selected Operation**: `get_build_status` (monitoring integration)

---

## 📋 Final StructuredIntent (After Planning)

### Actions Generated

```json
{
  "trigger": "schedule",
  "trigger_config": {
    "interval": "hourly"  // Monitoring = periodic checks
  },
  "dataSources": [
    {
      "type": "github",
      "operation": "listRepos",  // ✅ From "monitoring" verb
      "config": {}
    },
    {
      "type": "gitlab",
      "operation": "listRepos",  // ✅ From "monitoring" verb
      "config": {}
    },
    {
      "type": "bitbucket",
      "operation": "listRepos",  // ✅ From "monitoring" verb
      "config": {}
    }
  ],
  "actions": [
    {
      "type": "jenkins",
      "operation": "get_build_status",  // ✅ From "integrated with" verb
      "config": {}
    }
  ],
  "transformations": [],
  "conditions": []
}
```

---

## 🔑 Key Points

### ✅ What the AI Does Automatically

1. **Extracts Node Types**: 
   - Directly mentioned: `github`, `gitlab`, `bitbucket`, `jenkins`
   - No user formatting needed

2. **Infers Operations**:
   - "monitoring" → `listRepos` (from schema)
   - "integrated with" → `get_build_status` (from schema)

3. **Determines Categories**:
   - Monitoring = dataSource (reading data)
   - Integration = output (triggering action)

4. **Maps to Schema Operations**:
   - Uses actual operations from node schema
   - Not hardcoded - works for all nodes

### ❌ What Users DON'T Need to Do

- ❌ Don't need to specify operations explicitly
- ❌ Don't need to format as "github.listRepos"
- ❌ Don't need to structure as JSON
- ❌ Don't need to know schema operations

### ✅ What Users CAN Do (Natural Language)

Users can write prompts naturally:
- "Monitor GitHub repos"
- "Check GitLab repositories"
- "Track Bitbucket changes"
- "Integrate with Jenkins"
- "Repo monitoring for GitHub, GitLab, Bitbucket, integrated with Jenkins"

**The AI extracts everything automatically!**

---

## 🧪 Alternative Prompts (Same Result)

All these prompts will extract the same node types and operations:

1. **"Monitor repositories on GitHub, GitLab, and Bitbucket, then trigger Jenkins builds"**
   - Extracts: github, gitlab, bitbucket (monitoring), jenkins (triggering)

2. **"Check GitHub, GitLab, Bitbucket repo status and integrate with Jenkins"**
   - Extracts: github, gitlab, bitbucket (checking), jenkins (integration)

3. **"Watch GitHub, GitLab, Bitbucket repos and connect to Jenkins"**
   - Extracts: github, gitlab, bitbucket (watching), jenkins (connecting)

4. **"Repo monitoring for GitHub, GitLab, Bitbucket, integrated with Jenkins"**
   - Extracts: github, gitlab, bitbucket (monitoring), jenkins (integration)

**All produce the same StructuredIntent with correct operations!**

---

## 🎯 Summary

**User writes**: Natural language prompt
**AI extracts**: Node types + operations automatically
**System generates**: StructuredIntent with correct operations from schema

**No user formatting required - AI does everything!**
