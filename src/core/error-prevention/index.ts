/**
 * Error Prevention Validators - Central Export
 * 
 * ✅ CRITICAL: All error prevention validators exported from here
 * 
 * This module provides universal validators that prevent all 5 critical errors:
 * - Error #1: Invalid source handle for branching nodes
 * - Error #2: Workflow execution order incorrect
 * - Error #3: Multiple outgoing edges from non-branching nodes
 * - Error #4: Orphan nodes not reconnected
 * - Error #5: Parallel branches from multiple sources
 */

export { universalHandleResolver, UniversalHandleResolver } from '../utils/universal-handle-resolver';
export { universalBranchingValidator, UniversalBranchingValidator } from '../validation/universal-branching-validator';
export { universalCategoryResolver, UniversalCategoryResolver } from '../utils/universal-category-resolver';
export { edgeCreationValidator, EdgeCreationValidator } from '../validation/edge-creation-validator';
export { executionOrderBuilder, ExecutionOrderBuilder } from '../execution/execution-order-builder';

export type { HandleResolutionResult } from '../utils/universal-handle-resolver';
export type { BranchingValidationResult } from '../validation/universal-branching-validator';
export type { DSLCategory } from '../utils/universal-category-resolver';
export type { EdgeCreationValidationResult } from '../validation/edge-creation-validator';
export type { ExecutionOrder } from '../execution/execution-order-builder';
