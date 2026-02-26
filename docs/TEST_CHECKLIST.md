# Workflow Generation Test Checklist

Use this checklist to manually validate each generated workflow.

## ✅ Basic Structure Validation

- [ ] Workflow has exactly **one trigger node**
- [ ] All nodes are **connected** (no orphan nodes)
- [ ] No **circular dependencies**
- [ ] Data flows correctly: **output → input**
- [ ] Workflow is **executable** (no missing pieces)

## ✅ Node Type Validation

- [ ] **No "custom" node types** (should use specific types)
- [ ] **Expected nodes are present** (check against test case)
- [ ] **Node types match** what was requested in prompt
- [ ] **Node count** is reasonable (not too few, not too many)

## ✅ Configuration Validation

- [ ] **All required fields are filled** (no placeholders like "TODO")
- [ ] **Template expressions** use correct syntax: `{{node.field}}`
- [ ] **Field references** point to correct previous nodes
- [ ] **Credentials** are properly referenced (not hardcoded)
- [ ] **Default values** are sensible when provided

## ✅ Trigger Node Validation

- [ ] **Webhook**: Method, path, and body mapping configured
- [ ] **Chat Trigger**: Message handling configured
- [ ] **Form**: Form fields mapped correctly
- [ ] **Schedule**: Cron expression is valid
- [ ] **HTTP Request**: URL, method, headers configured

## ✅ Logic Node Validation

- [ ] **If/Else**: Condition is valid expression
- [ ] **Switch**: Cases cover all scenarios, default case exists
- [ ] **Set Variable**: Variables are set correctly
- [ ] **Merge**: Waits for all inputs, merge mode correct
- [ ] **Wait**: Duration/condition is reasonable
- [ ] **Limit**: Limit value is set
- [ ] **Aggregate**: Grouping field is correct
- [ ] **Sort**: Sort field and direction are correct
- [ ] **JavaScript/Code**: Code is valid, handles edge cases
- [ ] **NoOp**: Passes data through unchanged

## ✅ Integration Node Validation

### CRM Nodes
- [ ] **HubSpot**: Resource and operation selected
- [ ] **Zoho**: Resource and operation selected
- [ ] **Pipedrive**: Resource and operation selected
- [ ] **Notion**: Database and operation selected
- [ ] **Airtable**: Base, table, and operation selected
- [ ] **ClickUp**: Workspace, list, and operation selected

### Communication Nodes
- [ ] **Gmail**: Recipient, subject, body configured
- [ ] **Slack**: Channel/user and message configured
- [ ] **Telegram**: Chat ID and message configured
- [ ] **Outlook**: Recipient, subject, body configured
- [ ] **Google Calendar**: Event details configured

### Other Integrations
- [ ] **LinkedIn**: Post content configured
- [ ] **GitHub**: Repository and operation configured

## ✅ AI Node Validation

- [ ] **AI Chat Model**: Model selected, prompt configured
- [ ] **Prompt** includes necessary context
- [ ] **Response** is properly used in next node

## ✅ HTTP Node Validation

- [ ] **HTTP Request**: URL is valid
- [ ] **Method** is appropriate (GET, POST, etc.)
- [ ] **Headers** are configured if needed
- [ ] **Body** is formatted correctly
- [ ] **Error handling** exists for failures

## ✅ Data Flow Validation

- [ ] **Input fields** reference previous node outputs
- [ ] **Data types** are compatible (array → array, object → object)
- [ ] **Arrays** are handled correctly (loops, filters, etc.)
- [ ] **Objects** are properly accessed (dot notation)
- [ ] **Template expressions** resolve correctly

## ✅ Edge Case Validation

- [ ] **Error handling** for API failures
- [ ] **Empty data** is handled (null checks)
- [ ] **Array bounds** are checked (limit, sort)
- [ ] **Conditional branches** have fallbacks
- [ ] **Timeouts** are reasonable (wait, HTTP requests)

## ✅ Real-World Validation

- [ ] **Workflow makes sense** for the use case
- [ ] **All steps** from prompt are implemented
- [ ] **No missing steps** (e.g., "then send email" but no email node)
- [ ] **Integration order** is logical (fetch → process → send)
- [ ] **Error scenarios** are considered

## 🐛 Common Issues to Check

- [ ] **Missing nodes** - Expected node not generated
- [ ] **Wrong node types** - Using generic instead of specific
- [ ] **Broken connections** - Nodes not wired properly
- [ ] **Empty required fields** - Placeholders instead of values
- [ ] **Template errors** - Wrong field references
- [ ] **Logic errors** - Conditions always true/false
- [ ] **Type mismatches** - Arrays vs objects
- [ ] **Missing error handling** - No retry logic
- [ ] **Infinite loops** - Loops without limits
- [ ] **Orphan nodes** - Nodes not reachable

## 📝 Test Execution Notes

**Test ID**: _______________

**Test Name**: _______________

**Prompt**: _______________

**Date**: _______________

**Result**: [ ] PASS [ ] FAIL [ ] PARTIAL

**Issues Found**:
1. 
2. 
3. 

**Notes**:
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

---

## Quick Validation Commands

After generating a workflow, check:

```bash
# Count nodes
echo "Nodes: $(jq '.nodes | length' workflow.json)"

# List node types
jq -r '.nodes[].type' workflow.json | sort | uniq

# Check for custom nodes
jq -r '.nodes[].type' workflow.json | grep -i custom

# Count edges
echo "Edges: $(jq '.edges | length' workflow.json)"

# Find orphan nodes
# (nodes not in any edge as target)
```
