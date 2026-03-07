# Complete Fix Script - Remaining Mutations

## Remaining `.push()` calls to fix:

### workflow-dsl-compiler.ts:
1. Line 319: `categoryUsage.get(category)!.push({...})` - Map mutation
2. Line 338: `warnings.push(...)` - Array mutation
3. Line 376: `warnings.push(...)` - Array mutation
4. Lines 437, 445, 455, 465: `nodeTypesToValidate.push(...)` - Array mutations (already fixed above but need to verify)
5. Lines 1044-1048: `aliases.push(...)` - Array mutations (local array, less critical)
6. Line 1058: `nodeTypeMentions.push(...)` - Array mutation
7. Lines 1089, 1128, 1139: `switchCases.push(...)` - Array mutations
8. Line 1193: `edges.push(edge)` - Array mutation (in buildLinearPipeline)
9. Lines 1199, 1202: `warnings.push(...)` - Array mutations

### workflow-dsl.ts:
1. Line 268: `missingActions.push(...)` - Array mutation
2. Lines 329, 346, 397, 420: `violations.push(...)` - Array mutations
3. Lines 552, 559, 609, 771, 780, 784, 797, 806, 822, 936, 989: `dataSources.push`, `transformations.push`, `outputs.push`, `mappedActionsToDataSources.push`, `mappedActionsToOutputs.push`, `uncategorizedActions.push` - Array mutations

## Strategy:
Since there are many mutations, I'll create a comprehensive replacement script that fixes all of them systematically.
