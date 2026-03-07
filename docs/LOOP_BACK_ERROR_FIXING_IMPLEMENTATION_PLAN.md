# Loop-Back Error Fixing Architecture - Implementation Plan

## 🎯 Objective

Implement a self-healing workflow generation system that automatically loops back to the correct stage to fix errors at their source, ensuring only perfect workflows are returned.

---

## 📊 Phase 1: Error Analysis & Stage Mapping

### 1.1 Complete Error Catalog

**Error Categories & Their Fixable Stages:**

#### **Category A: Node Type Errors**
- **Errors:**
  - Invalid node type (not in registry)
  - Ambiguous node type (CRM without platform)
  - Node type normalization needed
- **Fixable At:** Stage 2 (Structure Building) or Stage 5 (DSL Compilation)
- **Priority:** HIGH (blocks compilation)

#### **Category B: Edge/Connection Errors**
- **Errors:**
  - Duplicate edges (same source-target pair)
  - Invalid source handle (e.g., "output" for if_else)
  - Invalid target handle
  - Multiple outgoing edges from non-branching nodes
  - Burst flow from trigger
  - Cycles in graph
- **Fixable At:** Stage 5 (DSL Compilation) or Stage 6 (Node Injection)
- **Priority:** HIGH (blocks validation)

#### **Category C: Structure/Graph Errors**
- **Errors:**
  - Orphan nodes (not connected)
  - Missing required nodes
  - Execution order violations
  - Missing log_output node
- **Fixable At:** Stage 5 (DSL Compilation) or Stage 6 (Node Injection)
- **Priority:** MEDIUM (blocks execution)

#### **Category D: DSL Structure Errors**
- **Errors:**
  - Missing trigger in DSL
  - Empty dataSources/transformations/outputs
  - Uncategorized actions
  - Missing intent actions
  - Minimum component violations
- **Fixable At:** Stage 3 (DSL Generation) or Stage 2 (Structure Building)
- **Priority:** CRITICAL (blocks compilation)

#### **Category E: Configuration Errors**
- **Errors:**
  - Missing required config fields
  - Invalid config field types
  - Missing default values
- **Fixable At:** Stage 5 (DSL Compilation) or Stage 7 (Validation)
- **Priority:** MEDIUM (blocks execution)

#### **Category F: Credential Errors**
- **Errors:**
  - Missing required credentials
  - Invalid credential format
  - Credential injection failed
- **Fixable At:** Stage 8 (Credential Discovery)
- **Priority:** MEDIUM (blocks execution)

#### **Category G: Type Compatibility Errors**
- **Errors:**
  - Type incompatibility between connected nodes
  - Invalid data flow
- **Fixable At:** Stage 5 (DSL Compilation) or Stage 7 (Validation)
- **Priority:** MEDIUM (blocks execution)

#### **Category H: Intent Coverage Errors**
- **Errors:**
  - Intent actions not covered by workflow
  - Missing transformations
- **Fixable At:** Stage 2 (Structure Building) or Stage 3 (DSL Generation)
- **Priority:** HIGH (blocks validation)

### 1.2 Error-to-Stage Mapping Table

| Error Type | Error Message Pattern | Fixable Stage | Alternative Stage |
|------------|----------------------|---------------|-------------------|
| Invalid node type | "not found in registry", "unknown node type" | Stage 5 | Stage 2 |
| Duplicate edges | "duplicate edge", "same source-target" | Stage 5 | Stage 6 |
| Invalid handle | "invalid source handle", "invalid target handle" | Stage 5 | Stage 7 |
| Orphan nodes | "orphan node", "not connected" | Stage 6 | Stage 5 |
| Missing trigger | "missing trigger", "no trigger" | Stage 3 | Stage 2 |
| Empty DSL arrays | "empty dataSources", "no outputs" | Stage 3 | Stage 2 |
| Missing credentials | "missing credential", "credential required" | Stage 8 | N/A |
| Type incompatibility | "type incompatible", "cannot connect" | Stage 5 | Stage 7 |
| Execution order | "execution order violation", "wrong order" | Stage 5 | Stage 7 |
| Intent not covered | "intent action missing", "not in workflow" | Stage 2 | Stage 3 |

---

## 📋 Phase 2: Core Components Implementation

### 2.1 ErrorStageMapper Component

**Purpose:** Maps errors to their fixable stages

**Location:** `worker/src/services/ai/error-stage-mapper.ts`

**Key Methods:**
```typescript
class ErrorStageMapper {
  // Map error to fixable stage
  getFixableStage(error: ValidationError): number;
  
  // Get earliest fixable stage for multiple errors
  getEarliestFixableStage(errors: ValidationError[]): number;
  
  // Check if error can be fixed at a specific stage
  canFixAtStage(error: ValidationError, stage: number): boolean;
  
  // Get all fixable stages for an error (ordered by preference)
  getFixableStages(error: ValidationError): number[];
}
```

**Implementation Logic:**
- Parse error message to identify error type
- Match error type to fixable stage using mapping table
- Return earliest stage that can fix the error
- Handle multiple errors by finding common fixable stage

### 2.2 ErrorTracker Component

**Purpose:** Tracks errors across iterations

**Location:** `worker/src/services/ai/error-tracker.ts`

**Key Methods:**
```typescript
class ErrorTracker {
  // Track error with metadata
  trackError(error: ValidationError, stage: number, iteration: number): void;
  
  // Check if error was already fixed
  wasErrorFixed(errorId: string): boolean;
  
  // Get error history
  getErrorHistory(): ErrorHistoryEntry[];
  
  // Check if same error persists (infinite loop detection)
  isSameErrorPersisting(error: ValidationError, maxIterations: number): boolean;
  
  // Get new errors (not seen before)
  getNewErrors(errors: ValidationError[]): ValidationError[];
}
```

**Data Structure:**
```typescript
interface ErrorHistoryEntry {
  errorId: string;
  errorType: string;
  errorMessage: string;
  detectedAtStage: number;
  fixedAtStage?: number;
  fixedAtIteration?: number;
  iterations: number;
}
```

### 2.3 LoopBackEngine Component

**Purpose:** Decides when and where to loop back

**Location:** `worker/src/services/ai/loop-back-engine.ts`

**Key Methods:**
```typescript
class LoopBackEngine {
  // Decide if loop-back is needed
  shouldLoopBack(errors: ValidationError[], currentStage: number): boolean;
  
  // Determine target stage for loop-back
  getTargetStage(errors: ValidationError[], currentStage: number): number;
  
  // Check if loop-back is allowed (max iterations, no infinite loops)
  canLoopBack(errors: ValidationError[], iteration: number): boolean;
  
  // Get loop-back strategy
  getLoopBackStrategy(errors: ValidationError[]): LoopBackStrategy;
}
```

**Loop-Back Strategy:**
```typescript
interface LoopBackStrategy {
  targetStage: number;
  reason: string;
  expectedFixes: string[];
  maxIterations: number;
  preserveState: boolean;
}
```

### 2.4 StageReExecutor Component

**Purpose:** Re-executes stages from a checkpoint

**Location:** `worker/src/services/ai/stage-re-executor.ts`

**Key Methods:**
```typescript
class StageReExecutor {
  // Save checkpoint before stage
  saveCheckpoint(stage: number, state: PipelineState): void;
  
  // Restore checkpoint
  restoreCheckpoint(stage: number): PipelineState;
  
  // Re-execute from target stage
  reExecuteFrom(targetStage: number, preservedState?: PipelineState): Promise<PipelineResult>;
  
  // Get stages to re-execute
  getStagesToReExecute(fromStage: number, toStage: number): number[];
}
```

**Checkpoint System:**
```typescript
interface PipelineCheckpoint {
  stage: number;
  timestamp: number;
  state: {
    structuredIntent?: StructuredIntent;
    workflowStructure?: WorkflowStructure;
    dsl?: WorkflowDSL;
    workflow?: Workflow;
    errors: ValidationError[];
  };
}
```

### 2.5 ValidationLoop Component

**Purpose:** Main loop that orchestrates error fixing

**Location:** `worker/src/services/ai/validation-loop.ts`

**Key Methods:**
```typescript
class ValidationLoop {
  // Main validation loop
  async validateWithLoopBack(
    workflow: Workflow,
    originalPrompt: string,
    maxIterations: number = 5
  ): Promise<ValidationLoopResult>;
  
  // Single iteration
  async validateIteration(
    workflow: Workflow,
    iteration: number
  ): Promise<ValidationIterationResult>;
  
  // Check if workflow is perfect
  isPerfect(workflow: Workflow, errors: ValidationError[]): boolean;
}
```

**Result Structure:**
```typescript
interface ValidationLoopResult {
  workflow: Workflow;
  perfect: boolean;
  iterations: number;
  errors: ValidationError[];
  warnings: string[];
  fixesApplied: FixRecord[];
  loopBackHistory: LoopBackRecord[];
}
```

### 2.6 ErrorResolutionVerifier Component

**Purpose:** Verifies errors are actually fixed after loop-back

**Location:** `worker/src/services/ai/error-resolution-verifier.ts`

**Key Methods:**
```typescript
class ErrorResolutionVerifier {
  // Verify original error is fixed
  verifyErrorFixed(originalError: ValidationError, workflow: Workflow): boolean;
  
  // Check for new errors introduced by fix
  checkForNewErrors(originalErrors: ValidationError[], newErrors: ValidationError[]): ValidationError[];
  
  // Validate fix didn't break previous fixes
  validateFixIntegrity(workflow: Workflow, previousWorkflow: Workflow): boolean;
  
  // Mark errors as resolved
  markResolved(errors: ValidationError[]): void;
}
```

### 2.7 LoopControl Component

**Purpose:** Controls loop-back iterations and prevents infinite loops

**Location:** `worker/src/services/ai/loop-control.ts`

**Key Methods:**
```typescript
class LoopControl {
  // Check if max iterations reached
  hasReachedMaxIterations(iteration: number, maxIterations: number): boolean;
  
  // Detect infinite loop (same error, same stage)
  isInfiniteLoop(error: ValidationError, stage: number, history: ErrorHistoryEntry[]): boolean;
  
  // Get remaining iterations
  getRemainingIterations(iteration: number, maxIterations: number): number;
  
  // Decide: loop back, fix here, or fail
  decideAction(
    errors: ValidationError[],
    iteration: number,
    maxIterations: number
  ): 'loop_back' | 'fix_here' | 'fail';
}
```

---

## 🔧 Phase 3: Integration with Existing Pipeline

### 3.1 Modify WorkflowPipelineOrchestrator

**Changes Needed:**
1. Wrap pipeline execution in validation loop
2. Add checkpoint system before each stage
3. Integrate loop-back logic
4. Only return workflow when perfect

**Modified Method:**
```typescript
async executePipelineInternal(...): Promise<PipelineResult> {
  const validationLoop = new ValidationLoop();
  const errorTracker = new ErrorTracker();
  const loopBackEngine = new LoopBackEngine();
  const stageReExecutor = new StageReExecutor();
  
  let workflow: Workflow | undefined;
  let errors: ValidationError[] = [];
  let iteration = 0;
  const MAX_ITERATIONS = 5;
  
  do {
    // Execute pipeline stages
    const result = await this.executeStages(userPrompt, ...);
    workflow = result.workflow;
    errors = this.collectErrors(result);
    
    if (errors.length > 0) {
      // Track errors
      errors.forEach(err => errorTracker.trackError(err, currentStage, iteration));
      
      // Check if loop-back is needed
      if (loopBackEngine.shouldLoopBack(errors, currentStage)) {
        const targetStage = loopBackEngine.getTargetStage(errors, currentStage);
        
        // Loop back
        const reExecutionResult = await stageReExecutor.reExecuteFrom(targetStage);
        workflow = reExecutionResult.workflow;
        errors = reExecutionResult.errors;
        iteration++;
      } else {
        // Try to fix at current stage
        const fixResult = await this.attemptFixAtCurrentStage(errors, workflow);
        workflow = fixResult.workflow;
        errors = fixResult.errors;
      }
    }
  } while (errors.length > 0 && iteration < MAX_ITERATIONS);
  
  // Only return if perfect
  if (errors.length === 0 && workflow) {
    return { success: true, workflow, ... };
  } else {
    return { success: false, errors, ... };
  }
}
```

### 3.2 Add Checkpoint System

**Before Each Stage:**
```typescript
// Save checkpoint before stage execution
stageReExecutor.saveCheckpoint(stageNumber, {
  structuredIntent,
  workflowStructure,
  dsl,
  workflow,
  errors: []
});
```

**On Loop-Back:**
```typescript
// Restore checkpoint
const checkpoint = stageReExecutor.restoreCheckpoint(targetStage);
// Use checkpoint state as starting point
```

### 3.3 Integrate with WorkflowValidator

**Modify validateAndFix method:**
```typescript
async validateAndFix(workflow: Workflow, ...): Promise<ValidationResult> {
  // Run validation
  const result = await this.validate(workflow);
  
  // If errors found, check if loop-back is better than auto-fix
  if (result.errors.length > 0) {
    const loopBackEngine = new LoopBackEngine();
    const shouldLoopBack = loopBackEngine.shouldLoopBack(result.errors, 7); // Stage 7
    
    if (shouldLoopBack) {
      // Return errors for loop-back (don't auto-fix here)
      return {
        valid: false,
        errors: result.errors,
        requiresLoopBack: true,
        targetStage: loopBackEngine.getTargetStage(result.errors, 7)
      };
    } else {
      // Auto-fix at current stage
      return await this.attemptAutoFix(workflow, result);
    }
  }
  
  return result;
}
```

---

## 🎯 Phase 4: Error Fixing Strategies by Stage

### 4.1 Stage 2: Structure Building Fixes

**Errors Fixed:**
- Invalid node types → Normalize using NodeTypeNormalizationService
- Ambiguous platforms → Auto-select default platform
- Missing nodes → Inject missing nodes

**Fix Implementation:**
```typescript
async fixAtStage2(errors: ValidationError[], structure: WorkflowStructure): Promise<WorkflowStructure> {
  for (const error of errors) {
    if (error.type === 'invalid_node_type') {
      // Normalize node type
      structure = await nodeTypeNormalizationService.normalizeStructure(structure);
    } else if (error.type === 'ambiguous_platform') {
      // Auto-select platform
      structure = await platformSelectionResolver.resolvePlatform(structure);
    } else if (error.type === 'missing_node') {
      // Inject missing node
      structure = await missingNodeDetector.injectMissingNodes(structure);
    }
  }
  return structure;
}
```

### 4.2 Stage 3: DSL Generation Fixes

**Errors Fixed:**
- Missing trigger → Add default trigger
- Empty arrays → Ensure minimum components
- Uncategorized actions → Categorize actions properly

**Fix Implementation:**
```typescript
async fixAtStage3(errors: ValidationError[], dsl: WorkflowDSL): Promise<WorkflowDSL> {
  for (const error of errors) {
    if (error.type === 'missing_trigger') {
      // Add default trigger
      dsl.trigger = { type: 'manual_trigger', config: {} };
    } else if (error.type === 'empty_arrays') {
      // Ensure minimum components
      if (dsl.dataSources.length === 0) {
        // Add minimal data source
      }
      if (dsl.outputs.length === 0) {
        // Add log_output
      }
    }
  }
  return dsl;
}
```

### 4.3 Stage 5: DSL Compilation Fixes

**Errors Fixed:**
- Invalid node types → Normalize before compilation
- Duplicate edges → Remove duplicates using UniversalEdgeCreationService
- Invalid handles → Resolve handles dynamically
- Cycles → Break cycles

**Fix Implementation:**
```typescript
async fixAtStage5(errors: ValidationError[], dsl: WorkflowDSL): Promise<WorkflowDSL> {
  // Validate and normalize node types BEFORE compilation
  const normalizedDSL = await nodeTypeNormalizationService.normalizeDSL(dsl);
  
  // Compile with fixes
  const compiler = new WorkflowDSLCompiler();
  const result = compiler.compile(normalizedDSL);
  
  // Fix edge issues
  if (result.errors.some(e => e.includes('duplicate'))) {
    result.workflow = await this.removeDuplicateEdges(result.workflow);
  }
  
  return result;
}
```

### 4.4 Stage 6: Node Injection Fixes

**Errors Fixed:**
- Orphan nodes → Reconnect using smart reconnection
- Missing log_output → Inject log_output node
- Terminal nodes not connected → Connect to log_output

**Fix Implementation:**
```typescript
async fixAtStage6(errors: ValidationError[], workflow: Workflow): Promise<Workflow> {
  for (const error of errors) {
    if (error.type === 'orphan_node') {
      // Smart orphan reconnection
      workflow = await orphanReconnector.reconnectOrphans(workflow);
    } else if (error.type === 'missing_log_output') {
      // Inject log_output
      workflow = await logOutputEnsurer.ensureLogOutput(workflow);
    }
  }
  return workflow;
}
```

### 4.5 Stage 7: Validation Fixes

**Errors Fixed:**
- Missing config fields → Add defaults
- Type incompatibility → Fix connections
- Execution order → Reorder nodes

**Fix Implementation:**
```typescript
async fixAtStage7(errors: ValidationError[], workflow: Workflow): Promise<Workflow> {
  // Use existing auto-fix logic
  const validator = new WorkflowValidator();
  const result = await validator.validateAndFix(workflow);
  return result.workflow;
}
```

### 4.6 Stage 8: Credential Fixes

**Errors Fixed:**
- Missing credentials → Prompt user (can't auto-fix)
- Invalid format → Validate and reformat

**Fix Implementation:**
```typescript
async fixAtStage8(errors: ValidationError[], workflow: Workflow): Promise<Workflow> {
  // Credentials can't be auto-fixed - must return requiresCredentials
  if (errors.some(e => e.type === 'missing_credential')) {
    return {
      workflow,
      requiresCredentials: true,
      missingCredentials: errors.filter(e => e.type === 'missing_credential')
    };
  }
  return workflow;
}
```

---

## 🔄 Phase 5: Main Loop Implementation

### 5.1 Validation Loop Algorithm

```typescript
async function validateWithLoopBack(
  workflow: Workflow,
  originalPrompt: string,
  maxIterations: number = 5
): Promise<ValidationLoopResult> {
  const errorTracker = new ErrorTracker();
  const loopBackEngine = new LoopBackEngine();
  const stageReExecutor = new StageReExecutor();
  const errorStageMapper = new ErrorStageMapper();
  
  let currentWorkflow = workflow;
  let errors: ValidationError[] = [];
  let iteration = 0;
  const fixesApplied: FixRecord[] = [];
  const loopBackHistory: LoopBackRecord[] = [];
  
  do {
    // Validate current workflow
    const validationResult = await validateWorkflow(currentWorkflow);
    errors = validationResult.errors;
    
    // Check if perfect
    if (errors.length === 0) {
      return {
        workflow: currentWorkflow,
        perfect: true,
        iterations: iteration,
        errors: [],
        warnings: validationResult.warnings,
        fixesApplied,
        loopBackHistory
      };
    }
    
    // Track errors
    errors.forEach(err => {
      errorTracker.trackError(err, 9, iteration); // Stage 9 = Final Validation
    });
    
    // Check for infinite loop
    if (loopControl.isInfiniteLoop(errors[0], 9, errorTracker.getErrorHistory())) {
      return {
        workflow: currentWorkflow,
        perfect: false,
        iterations: iteration,
        errors,
        warnings: ['Infinite loop detected - same error persists'],
        fixesApplied,
        loopBackHistory
      };
    }
    
    // Find fixable stage
    const fixableStage = errorStageMapper.getEarliestFixableStage(errors);
    
    // Decide: loop back or fix here
    const action = loopControl.decideAction(errors, iteration, maxIterations);
    
    if (action === 'loop_back' && fixableStage < 9) {
      // Loop back to fixable stage
      loopBackHistory.push({
        iteration,
        fromStage: 9,
        toStage: fixableStage,
        reason: `Fixing ${errors.length} error(s) at source stage ${fixableStage}`
      });
      
      // Re-execute from fixable stage
      const reExecutionResult = await stageReExecutor.reExecuteFrom(
        fixableStage,
        originalPrompt
      );
      
      currentWorkflow = reExecutionResult.workflow;
      errors = reExecutionResult.errors;
      iteration++;
      
    } else if (action === 'fix_here') {
      // Try to fix at current stage
      const fixResult = await attemptFixAtStage9(errors, currentWorkflow);
      currentWorkflow = fixResult.workflow;
      errors = fixResult.errors;
      fixesApplied.push(...fixResult.fixesApplied);
      iteration++;
      
    } else {
      // Fail - can't fix
      return {
        workflow: currentWorkflow,
        perfect: false,
        iterations: iteration,
        errors,
        warnings: ['Max iterations reached or unable to fix'],
        fixesApplied,
        loopBackHistory
      };
    }
    
  } while (errors.length > 0 && iteration < maxIterations);
  
  // Final result
  return {
    workflow: currentWorkflow,
    perfect: errors.length === 0,
    iterations: iteration,
    errors,
    warnings: [],
    fixesApplied,
    loopBackHistory
  };
}
```

---

## ✅ Phase 6: Testing & Validation

### 6.1 Unit Tests

**Test ErrorStageMapper:**
- Test error-to-stage mapping for all error types
- Test earliest fixable stage calculation
- Test multiple errors handling

**Test LoopBackEngine:**
- Test loop-back decision logic
- Test infinite loop detection
- Test max iterations handling

**Test StageReExecutor:**
- Test checkpoint save/restore
- Test re-execution from different stages
- Test state preservation

### 6.2 Integration Tests

**Test Scenarios:**
1. Error at Stage 9 → Loop back to Stage 5 → Fix → Re-validate → Perfect
2. Multiple errors → Loop back to earliest fixable stage → Fix all → Perfect
3. Infinite loop detection → Stop after max iterations
4. Credential errors → Return requiresCredentials (can't auto-fix)

### 6.3 Error Scenarios

**Scenario 1: Invalid Node Type**
```
Initial: Stage 5 creates "custom_crm" → Stage 9 detects error
Loop-back: Stage 9 → Stage 5 → Normalize "custom_crm" → "zoho_crm" → Re-validate → Perfect
```

**Scenario 2: Duplicate Edges**
```
Initial: Stage 5 creates duplicate edges → Stage 9 detects error
Loop-back: Stage 9 → Stage 5 → Remove duplicates → Re-validate → Perfect
```

**Scenario 3: Orphan Nodes**
```
Initial: Stage 6 creates orphan → Stage 9 detects error
Loop-back: Stage 9 → Stage 6 → Reconnect orphan → Re-validate → Perfect
```

---

## 🚀 Phase 7: Deployment & Monitoring

### 7.1 Logging

**Log Loop-Back Events:**
```typescript
console.log(`[LoopBack] Iteration ${iteration}: Looping back from Stage ${fromStage} to Stage ${toStage}`);
console.log(`[LoopBack] Reason: ${reason}`);
console.log(`[LoopBack] Errors to fix: ${errors.map(e => e.message).join(', ')}`);
```

### 7.2 Metrics

**Track Metrics:**
- Loop-back frequency by error type
- Average iterations per workflow
- Success rate after loop-back
- Most common fixable stages

### 7.3 Monitoring

**Monitor:**
- Infinite loop occurrences
- Max iterations reached
- Loop-back effectiveness
- Error resolution rate

---

## 📝 Implementation Checklist

### Phase 1: Error Analysis ✅
- [ ] Catalog all error types
- [ ] Map errors to fixable stages
- [ ] Create error-to-stage mapping table

### Phase 2: Core Components ✅
- [ ] Implement ErrorStageMapper
- [ ] Implement ErrorTracker
- [ ] Implement LoopBackEngine
- [ ] Implement StageReExecutor
- [ ] Implement ValidationLoop
- [ ] Implement ErrorResolutionVerifier
- [ ] Implement LoopControl

### Phase 3: Integration ✅
- [ ] Modify WorkflowPipelineOrchestrator
- [ ] Add checkpoint system
- [ ] Integrate with WorkflowValidator

### Phase 4: Error Fixing Strategies ✅
- [ ] Implement Stage 2 fixes
- [ ] Implement Stage 3 fixes
- [ ] Implement Stage 5 fixes
- [ ] Implement Stage 6 fixes
- [ ] Implement Stage 7 fixes
- [ ] Implement Stage 8 fixes

### Phase 5: Main Loop ✅
- [ ] Implement validation loop algorithm
- [ ] Add iteration control
- [ ] Add infinite loop detection

### Phase 6: Testing ✅
- [ ] Unit tests for all components
- [ ] Integration tests
- [ ] Error scenario tests

### Phase 7: Deployment ✅
- [ ] Add logging
- [ ] Add metrics
- [ ] Add monitoring

---

## 🎯 Success Criteria

1. **Error Resolution Rate:** > 90% of errors fixed automatically
2. **Average Iterations:** < 3 iterations per workflow
3. **Infinite Loop Prevention:** 0 infinite loops
4. **Perfect Workflow Rate:** 100% of returned workflows are perfect (zero errors)
5. **Performance:** Loop-back adds < 2 seconds per iteration

---

## 🔄 Best Practices

1. **Always loop back to earliest fixable stage** - Fix at source, not symptom
2. **Preserve valid work** - Don't discard good work when looping back
3. **Detect infinite loops** - Stop if same error persists
4. **Limit iterations** - Max 5 iterations to prevent infinite loops
5. **Log everything** - Track all loop-back events for debugging
6. **Verify fixes** - Always verify error is actually fixed after loop-back
7. **Fail gracefully** - If can't fix, return detailed error report

---

**End of Implementation Plan**
