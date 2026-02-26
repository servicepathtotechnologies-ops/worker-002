# Workflow Generation Testing Guide

## Quick Start

### Run All Tests
```bash
cd worker
npm run test:workflows
# or
ts-node scripts/test-workflow-generation.ts
```

### Run High Priority Tests Only
```bash
ts-node scripts/test-workflow-generation.ts --priority=high
```

### Run Tests by Category
```bash
# Test only trigger nodes
ts-node scripts/test-workflow-generation.ts --category=triggers

# Test only logic nodes
ts-node scripts/test-workflow-generation.ts --category=logic

# Test only CRM integrations
ts-node scripts/test-workflow-generation.ts --category=crm
```

### Save Results to File
```bash
ts-node scripts/test-workflow-generation.ts --output=my-test-results.txt
```

## Test Categories

### 1. Triggers (5 tests)
- Webhook, Chat Trigger, Form, Schedule, HTTP Request

### 2. Logic Nodes (10 tests)
- If/Else, Switch, Set Variable, Merge, Wait, Limit, Aggregate, Sort, JavaScript, NoOp

### 3. AI & HTTP (2 tests)
- AI Chat Model, HTTP Request

### 4. CRM Integrations (6 tests)
- HubSpot, Zoho, Pipedrive, Notion, Airtable, ClickUp

### 5. Communication (5 tests)
- Gmail, Slack, Telegram, Outlook, Google Calendar

### 6. Complex Workflows (3 tests)
- Multi-node workflows combining multiple categories

## What Gets Tested

For each test prompt, the system validates:

1. **Structure**
   - ✅ Has exactly one trigger node
   - ✅ All nodes are connected (no orphans)
   - ✅ No circular dependencies
   - ✅ Proper data flow

2. **Node Generation**
   - ✅ Expected nodes are generated
   - ✅ No "custom" or invalid node types
   - ✅ Correct node count

3. **Configuration**
   - ✅ All required fields are filled
   - ✅ Template expressions use correct syntax
   - ✅ Credentials properly referenced

4. **Logic**
   - ✅ If/Else conditions are valid
   - ✅ Switch cases cover scenarios
   - ✅ Loops have proper limits
   - ✅ Merge waits for inputs

## Understanding Test Results

### Pass Criteria
A test passes if:
- All expected nodes are generated
- Workflow has a valid trigger
- All nodes are connected
- No errors during generation
- No unexpected node types (like "custom")

### Common Failures

1. **Missing Nodes**
   - Expected node not generated
   - Check if node type is registered in node library

2. **Orphan Nodes**
   - Nodes not reachable from trigger
   - Check edge connections

3. **Invalid Node Types**
   - "custom" nodes generated
   - Check node type mapping

4. **Missing Configuration**
   - Required fields empty
   - Check template expression generation

## Manual Testing

For manual testing, use the test prompts from `comprehensive-node-testing-suite.md`:

1. Copy a test prompt
2. Submit to workflow generation API
3. Validate the generated workflow:
   - Check node types match expected
   - Verify all connections
   - Test with sample data
   - Check for errors

## Debugging Failed Tests

1. **Check the generated workflow JSON**
   - Look for missing nodes
   - Verify node types
   - Check connections

2. **Review generation logs**
   - Look for errors during generation
   - Check node selection logic
   - Verify requirements extraction

3. **Test individual nodes**
   - Test each node type separately
   - Verify node schemas are correct
   - Check node library registration

## Adding New Tests

To add a new test case, edit `test-workflow-generation.ts`:

```typescript
{
  id: 'new-test-001',
  name: 'Test Description',
  prompt: 'Natural language prompt here',
  expectedNodes: ['node1', 'node2', 'node3'],
  category: 'category-name',
  priority: 'high' | 'medium' | 'low',
}
```

## Test Execution Tips

1. **Start with high priority tests** - These cover the most common use cases
2. **Run by category** - Focus on one area at a time
3. **Check logs** - Review console output for detailed errors
4. **Save results** - Always save test reports for comparison
5. **Iterate** - Fix issues and re-run tests

## Expected Test Coverage

- **Triggers**: 5 tests (100% coverage)
- **Logic Nodes**: 10 tests (covers all major logic nodes)
- **CRM**: 6 tests (covers all listed CRM integrations)
- **Communication**: 5 tests (covers all listed communication nodes)
- **Complex**: 3 tests (real-world scenarios)

Total: **31 comprehensive test cases**
