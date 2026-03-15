/**
 * ✅ UNIFIED GRAPH ORCHESTRATION - Central Export
 * 
 * This module provides the unified orchestration layer for all graph operations.
 * 
 * Components:
 * 1. ExecutionOrderManager - Maintains dynamic execution order
 * 2. EdgeReconciliationEngine - Automatically reconciles edges
 * 3. NodeInjectionCoordinator - Unified API for node injections
 * 4. UnifiedGraphOrchestrator - Main coordinator
 * 
 * All graph operations MUST go through this orchestrator to ensure:
 * - Execution order and edges are always in sync
 * - No broken connections possible
 * - Linear structure enforced by default
 */

export { executionOrderManager, ExecutionOrderManager, ExecutionOrder } from './execution-order-manager';
export { edgeReconciliationEngine, EdgeReconciliationEngine, EdgeReconciliationResult, EdgeValidationResult } from './edge-reconciliation-engine';
export { nodeInjectionCoordinator, NodeInjectionCoordinator, InjectionContext, NodeInjectionResult } from './node-injection-coordinator';
export { unifiedGraphOrchestrator, UnifiedGraphOrchestrator, WorkflowValidationResult } from './unified-graph-orchestrator';
