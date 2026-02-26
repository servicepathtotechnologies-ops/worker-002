# HubSpot Properties Field Fix Guide

## Problem

The Properties field has hardcoded values:
```json
{"email":"vusala@gmail.com","name":"shiva"}
```

This won't work because:
1. It uses hardcoded values instead of template expressions
2. HubSpot uses `firstname` not `name` for the first name field
3. It doesn't reference the webhook data

## Solution

### Option 1: Direct from Webhook (if no set_variable node)

If your workflow is: `webhook → hubspot`

Use this in Properties field:
```json
{"email":"{{$json.body.email}}","firstname":"{{$json.body.name}}"}
```

### Option 2: From set_variable (if you have extraction node)

If your workflow is: `webhook → set_variable → hubspot`

Use this in Properties field:
```json
{"email":"{{$json.email}}","firstname":"{{$json.name}}"}
```

### Option 3: From Previous Node Output

If data comes from a previous node, check what fields it outputs and reference them:
```json
{"email":"{{$json.email}}","firstname":"{{$json.firstname}}"}
```

## Important Notes

1. **HubSpot Field Names:**
   - Use `firstname` (not `name`)
   - Use `lastname` (not `surname`)
   - Use `email` (correct)

2. **Template Syntax:**
   - Always use `{{$json.fieldName}}` format
   - For webhook body: `{{$json.body.email}}`
   - For previous node: `{{$json.email}}`

3. **Testing:**
   - Make sure to trigger via actual webhook (not manual trigger)
   - Use the test payload: `worker/testing/payloads/test-1.1-webhook-contact.json`
   - Check execution logs to see what data each node receives

## Current Workflow Issue

Your workflow has: `webhook → if_else → hubspot`

The if_else node is outputting:
```json
{
  "output": true,
  "result": true,
  "_trigger": "manual",
  "condition": true,
  "condition_result": true
}
```

This doesn't have email/name! You need to either:
1. Remove if_else node (it shouldn't be there for this simple workflow)
2. Or ensure webhook data flows directly to HubSpot

## Recommended Workflow Structure

For Test 1.1, the workflow should be:
```
webhook → set_variable → hubspot
```

Where:
- **webhook** outputs: `{body: {email: "...", name: "..."}}`
- **set_variable** extracts: `{email: "...", name: "..."}`
- **hubspot** receives: `{email: "...", name: "..."}` and uses Properties: `{"email":"{{$json.email}}","firstname":"{{$json.name}}"}`
