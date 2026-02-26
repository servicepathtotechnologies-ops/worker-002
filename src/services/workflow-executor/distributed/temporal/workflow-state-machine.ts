/**
 * Workflow State Machine
 * 
 * Manages workflow execution state transitions.
 * States:
 * - CREATED → RUNNING → COMPLETED
 * - CREATED → RUNNING → FAILED → RUNNING (retry)
 * - CREATED → RUNNING → PAUSED → RUNNING (resume)
 * - CREATED → RUNNING → CANCELLED
 */

export enum WorkflowState {
  CREATED = 'created',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
  TIMED_OUT = 'timed_out',
}

export interface StateTransition {
  from: WorkflowState;
  to: WorkflowState;
  timestamp: number;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface WorkflowStateMachine {
  workflowId: string;
  executionId: string;
  currentState: WorkflowState;
  transitions: StateTransition[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
}

/**
 * Allowed state transitions
 */
const ALLOWED_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  [WorkflowState.CREATED]: [WorkflowState.RUNNING, WorkflowState.CANCELLED],
  [WorkflowState.RUNNING]: [
    WorkflowState.COMPLETED,
    WorkflowState.FAILED,
    WorkflowState.PAUSED,
    WorkflowState.CANCELLED,
    WorkflowState.TIMED_OUT,
  ],
  [WorkflowState.FAILED]: [WorkflowState.RUNNING, WorkflowState.CANCELLED], // Retry
  [WorkflowState.PAUSED]: [WorkflowState.RUNNING, WorkflowState.CANCELLED], // Resume
  [WorkflowState.COMPLETED]: [], // Terminal state
  [WorkflowState.CANCELLED]: [], // Terminal state
  [WorkflowState.TIMED_OUT]: [WorkflowState.RUNNING, WorkflowState.CANCELLED], // Retry
};

/**
 * Workflow State Machine
 * Manages workflow state transitions
 */
export class WorkflowStateMachineManager {
  /**
   * Check if transition is allowed
   */
  canTransition(from: WorkflowState, to: WorkflowState): boolean {
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  /**
   * Create state machine
   */
  create(workflowId: string, executionId: string): WorkflowStateMachine {
    return {
      workflowId,
      executionId,
      currentState: WorkflowState.CREATED,
      transitions: [{
        from: WorkflowState.CREATED,
        to: WorkflowState.CREATED,
        timestamp: Date.now(),
        reason: 'Workflow created',
      }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Transition state
   */
  transition(
    stateMachine: WorkflowStateMachine,
    to: WorkflowState,
    reason?: string,
    metadata?: Record<string, any>
  ): WorkflowStateMachine {
    if (!this.canTransition(stateMachine.currentState, to)) {
      throw new Error(
        `Invalid transition from ${stateMachine.currentState} to ${to}`
      );
    }

    const transition: StateTransition = {
      from: stateMachine.currentState,
      to,
      timestamp: Date.now(),
      reason,
      metadata,
    };

    return {
      ...stateMachine,
      currentState: to,
      transitions: [...stateMachine.transitions, transition],
      updatedAt: Date.now(),
    };
  }

  /**
   * Get state history
   */
  getStateHistory(stateMachine: WorkflowStateMachine): StateTransition[] {
    return stateMachine.transitions;
  }

  /**
   * Check if workflow is terminal
   */
  isTerminal(state: WorkflowState): boolean {
    return state === WorkflowState.COMPLETED ||
           state === WorkflowState.CANCELLED;
  }

  /**
   * Check if workflow can be resumed
   */
  canResume(state: WorkflowState): boolean {
    return state === WorkflowState.FAILED ||
           state === WorkflowState.PAUSED ||
           state === WorkflowState.TIMED_OUT;
  }
}

// Export singleton instance
export const workflowStateMachineManager = new WorkflowStateMachineManager();
