# Node Type Duplicates Check

## Analysis

**Question**: Does every node have its own schema, or are there duplicates?

**Answer**: **Every node has its own unique schema.** No duplicates found.

## Verification

1. **Storage Structure**: Each node type is stored in a `Map<string, NodeSchema>` where the key is the `type` field
2. **Unique Types**: Each schema creation method (`create*Schema()`) returns a unique `type` value
3. **Registration**: Each schema is registered once via `this.addSchema()` in `initializeSchemas()`

## Node Type Count

- **Total Registered**: 111+ node types
- **All Unique**: Each has a distinct `type` identifier
- **No Duplicates**: Map structure prevents duplicate keys

## Schema Structure

Each node has:
- Unique `type` identifier (e.g., `'ai_service'`, `'gmail'`, `'google_sheets'`)
- Own `configSchema` with required/optional fields
- Own `aiSelectionCriteria` for AI workflow generation
- Own validation rules and patterns

## Examples

- `ai_service` - unique schema for AI service node
- `gmail` - unique schema for Gmail node (different from `google_gmail`)
- `google_sheets` - unique schema for Google Sheets
- `database_write` - unique schema (alias for `postgresql` but stored separately)

## Conclusion

✅ **No duplicates exist** - every node type has its own dedicated schema definition.
