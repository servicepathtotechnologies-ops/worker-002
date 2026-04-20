# log_output Hardcode Cleanup Plan

## Status

**Core Fix**: ✅ COMPLETE
- Capability fields added to UnifiedNodeDefinition
- log_output registered with allowsMultipleInputs: true, isTerminal: true, maxOutDegree: 0
- Core enforcement layers updated (splitMultiInputLogOutputs, DAG validator, branching validator)
- Bug condition tests: ✅ ALL 5 PASSING

**Remaining Work**: ❌ INCOMPLETE
- Many hardcoded `'log_output'` string literals remain in enforcement files
- Violates requirements 2.6 and 2.7 (zero hardcoded type-string checks)

## Hardcoded References Found

### edge-reconciliation-engine.ts (18 occurrences)
1. Line 124: `if (targetLinearType === 'log_output' || sourceLinearType === 'log_output')`
2. Line 351: `if (outputNodeType === 'log_output') continue;`
3. Line 442: `return nodeType === 'log_output';`
4. Line 620: `return !!tNode && this.getNodeType(tNode) === 'log_output';`
5. Line 654: `if (this.getNodeType(tNode) === 'log_output') return false;`
6. Line 691: `const logOutputNodeDef = unifiedNodeRegistry.get('log_output');`
7. Line 742: `.filter((n) => this.getNodeType(n) === 'log_output')`
8. Line 771: `return !!t && this.getNodeType(t) === 'log_output';`
9. Line 859: `: { type: 'log_output', label: \`\${baseLabel} (branch \${splitIndex + 1})\` };`
10. Line 1186: `'log_output';`
11. Line 1626: `if (targetType === 'log_output' && isOutputNode(sourceNode))`
12. Line 1730: `if (targetDef?.allowsMultipleInputs !== true && targetType === 'log_output')`
13. Line 1771: `if (!targetNode || this.getNodeType(targetNode) !== 'log_output') continue;`
14. Line 1795: `const logOutputNodes = workflow.nodes.filter((n) => this.getNodeType(n) === 'log_output');`
15. Line 1907: `const isLogOutputConnection = targetType === 'log_output';`
16. Line 2009: `if (sourceType === 'log_output' && targetType === 'log_output')`
17. Line 2051: `if (targetType === 'log_output') return true;`
18. Line 2064: `if (sourceIsOutput && targetType === 'log_output') return true;`

### dag-validator.ts (1 occurrence)
1. Line 293: `return normalizedType === 'log_output' || (nodeDef?.tags || []).includes('terminal');`

### workflow-build-manifest-utils.ts (3 occurrences)
1. Line 132: `if (terminalTagged.includes('log_output')) return 'log_output';`
2. Line 135: `return anyTerminal ?? 'log_output';`

### workflow-graph-normalizer.ts (4 occurrences)
1. Line 272: `const logNodes = normalizedNodes.filter((n: any) => getType(n) === 'log_output');`
2. Line 301: `.filter((n: any) => getType(n) !== 'log_output');`
3. Line 319: `type: existingLog.type || 'log_output',`
4. Line 324: `type: 'log_output',`
5. Line 344: `const targetType = 'log_output';`

## Replacement Strategy

### Pattern 1: Type Comparison
**Before**: `nodeType === 'log_output'`
**After**: `nodeDef?.isTerminal === true` or `nodeDef?.allowsMultipleInputs === true` (depending on context)

### Pattern 2: Type Assignment
**Before**: `type: 'log_output'`
**After**: Query registry for terminal node type or use a helper function

### Pattern 3: Registry Query
**Before**: `unifiedNodeRegistry.get('log_output')`
**After**: This is acceptable when needed for specific log_output behavior, but should be minimized

## Implementation Plan

1. **edge-reconciliation-engine.ts**: Replace all type comparisons with registry capability checks
2. **dag-validator.ts**: Replace hardcoded terminal check with registry query
3. **workflow-build-manifest-utils.ts**: Use registry to find terminal node types
4. **workflow-graph-normalizer.ts**: Use registry to identify terminal nodes

## Validation

After cleanup:
```bash
Get-ChildItem -Path worker/src/core/orchestration,worker/src/core/validation,worker/src/core/utils -Recurse -File -Exclude "*test*" | Select-String -Pattern "'log_output'"
```

Should return ZERO results (excluding test files and comments).
