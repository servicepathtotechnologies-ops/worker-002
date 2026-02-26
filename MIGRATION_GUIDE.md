# Database Migration Guide: Workflows Table Schema

## Overview

The `workflows` table needs three additional columns for long-term functionality:
- `settings` (JSONB) - Workflow configuration and settings
- `graph` (JSONB) - Complete workflow graph structure (nodes + edges combined)
- `metadata` (JSONB) - Additional workflow metadata

## Current Status

✅ **Code is ready**: The codebase has been updated to work with or without these columns using fallbacks.

⚠️ **Migration needed**: The database migration should be run to add these columns for optimal functionality.

## Why Run the Migration?

1. **Codebase expects these columns**: Many parts of the codebase use `settings`, `graph`, and `metadata`:
   - `save-workflow.ts` - Saves workflow settings and graph
   - `workflow-versioning.ts` - Stores version history with settings/graph/metadata
   - `MemoryManager.ts` - Uses settings for workflow configuration
   - `attach-inputs.ts` - Uses graph and metadata for workflow structure

2. **Better data organization**: 
   - `graph` column stores complete workflow structure in one place
   - `settings` column stores workflow configuration separately
   - `metadata` column stores additional workflow information

3. **Performance**: GIN indexes are created for efficient JSONB queries

## How to Run the Migration

### Option 1: Supabase SQL Editor (Recommended)

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the contents of `worker/migrations/010_add_workflows_metadata.sql`
4. Paste and run the SQL script
5. Verify the migration completed successfully

### Option 2: Command Line (if using Supabase CLI)

```bash
cd worker
supabase db execute -f migrations/010_add_workflows_metadata.sql
```

## Migration Safety

✅ **Safe to run**: The migration:
- Checks if columns exist before adding them (idempotent)
- Sets default values for existing rows
- Creates indexes for performance
- Does NOT delete or modify existing data

## Verification

After running the migration, verify it worked:

```sql
-- Check if columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'workflows' 
  AND column_name IN ('settings', 'graph', 'metadata');

-- Should return 3 rows
```

## Code Compatibility

The codebase is designed to work **with or without** these columns:

- ✅ Uses fallbacks: `(workflow as any).settings || {}`
- ✅ Safe type assertions: `(updateData as any).graph || {}`
- ✅ Defensive coding: All usages have default values

**However**, running the migration is recommended for:
- Full feature support
- Better data organization
- Optimal performance

## After Migration

1. **Regenerate TypeScript types** (if using Supabase CLI):
   ```bash
   supabase gen types typescript --local > ctrl_checks/src/integrations/supabase/types.ts
   ```

2. **Restart the worker** to ensure it picks up the new schema

3. **Test workflow operations** to verify everything works correctly

## Troubleshooting

### Error: "column does not exist"
- **Cause**: Migration not run
- **Solution**: Run the migration script

### Error: "duplicate column"
- **Cause**: Migration already run
- **Solution**: Safe to ignore - columns already exist

### TypeScript errors after migration
- **Cause**: Types not regenerated
- **Solution**: Regenerate Supabase types (see above)

## Long-Term Benefits

1. **Consistent schema**: All workflows have the same structure
2. **Better queries**: GIN indexes enable fast JSONB searches
3. **Versioning support**: Full workflow state can be versioned
4. **Future-proof**: Ready for new features that use these columns
