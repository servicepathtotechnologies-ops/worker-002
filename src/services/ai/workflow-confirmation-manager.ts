/**
 * Workflow Confirmation Manager
 * 
 * Manages workflow confirmation state and transitions.
 * Implements state machine for workflow confirmation flow.
 */

export enum WorkflowState {
  /**
   * Workflow has been built but not yet sent for confirmation
   */
  STATE_WORKFLOW_BUILT = 'STATE_WORKFLOW_BUILT',
  
  /**
   * Workflow sent to user and waiting for confirmation
   */
  STATE_WAITING_CONFIRMATION = 'STATE_WAITING_CONFIRMATION',
  
  /**
   * User has confirmed the workflow
   */
  STATE_CONFIRMED = 'STATE_CONFIRMED',
  
  /**
   * User has rejected the workflow
   */
  STATE_REJECTED = 'STATE_REJECTED',
}

export interface WorkflowConfirmationRequest {
  /**
   * Workflow ID or temporary identifier
   */
  workflowId: string;
  
  /**
   * Built workflow (nodes and edges)
   */
  workflow: {
    nodes: any[];
    edges: any[];
  };
  
  /**
   * Explanation of the workflow (human-readable text)
   */
  explanation: string;
  
  /**
   * Structured workflow explanation (if available)
   */
  workflowExplanation?: any;
  
  /**
   * Confidence score (if available)
   */
  confidenceScore?: number;
  
  /**
   * Expanded intent (if available)
   */
  expandedIntent?: string;
  
  /**
   * Pipeline context
   */
  pipelineContext?: any;
  
  /**
   * Current state
   */
  state: WorkflowState;
  
  /**
   * Timestamp when workflow was built
   */
  builtAt: Date;
}

export interface WorkflowConfirmationResponse {
  /**
   * Workflow ID
   */
  workflowId: string;
  
  /**
   * User's decision
   */
  confirmed: boolean;
  
  /**
   * Optional feedback from user
   */
  feedback?: string;
  
  /**
   * Timestamp of confirmation
   */
  confirmedAt: Date;
}

/**
 * Workflow Confirmation Manager
 * 
 * Manages confirmation state and transitions for workflows.
 */
export class WorkflowConfirmationManager {
  private confirmations: Map<string, WorkflowConfirmationRequest> = new Map();
  private responses: Map<string, WorkflowConfirmationResponse> = new Map();

  /**
   * Create a confirmation request for a workflow
   */
  createConfirmationRequest(
    workflowId: string,
    workflow: { nodes: any[]; edges: any[] },
    explanation: string,
    options?: {
      confidenceScore?: number;
      expandedIntent?: string;
      pipelineContext?: any;
      workflowExplanation?: any;
    }
  ): WorkflowConfirmationRequest {
    const request: WorkflowConfirmationRequest = {
      workflowId,
      workflow,
      explanation,
      workflowExplanation: options?.workflowExplanation,
      confidenceScore: options?.confidenceScore,
      expandedIntent: options?.expandedIntent,
      pipelineContext: options?.pipelineContext,
      state: WorkflowState.STATE_WORKFLOW_BUILT,
      builtAt: new Date(),
    };

    this.confirmations.set(workflowId, request);
    return request;
  }

  /**
   * Mark workflow as waiting for confirmation
   */
  markWaitingForConfirmation(workflowId: string): void {
    const request = this.confirmations.get(workflowId);
    if (request) {
      request.state = WorkflowState.STATE_WAITING_CONFIRMATION;
      this.confirmations.set(workflowId, request);
    }
  }

  /**
   * Mark workflow as rejected (due to build failure or user rejection)
   */
  async markRejected(workflowId: string, reason?: string): Promise<void> {
    let request = this.confirmations.get(workflowId);
    
    // If no request exists, create one for error tracking
    if (!request) {
      request = {
        workflowId,
        workflow: { nodes: [], edges: [] },
        explanation: reason || 'Workflow build failed',
        state: WorkflowState.STATE_REJECTED,
        builtAt: new Date(),
      };
    } else {
      request.state = WorkflowState.STATE_REJECTED;
      if (reason) {
        request.explanation = reason;
      }
    }
    
    this.confirmations.set(workflowId, request);
    
    // Also create a rejection response for tracking
    const response: WorkflowConfirmationResponse = {
      workflowId,
      confirmed: false,
      feedback: reason,
      confirmedAt: new Date(),
    };
    this.responses.set(workflowId, response);
  }

  /**
   * Submit user confirmation response
   */
  submitConfirmation(
    workflowId: string,
    confirmed: boolean,
    feedback?: string
  ): WorkflowConfirmationResponse {
    const request = this.confirmations.get(workflowId);
    if (!request) {
      throw new Error(`Workflow confirmation request not found: ${workflowId}`);
    }

    const response: WorkflowConfirmationResponse = {
      workflowId,
      confirmed,
      feedback,
      confirmedAt: new Date(),
    };

    this.responses.set(workflowId, response);

    // Update state based on response
    if (confirmed) {
      request.state = WorkflowState.STATE_CONFIRMED;
    } else {
      request.state = WorkflowState.STATE_REJECTED;
    }

    this.confirmations.set(workflowId, request);
    return response;
  }

  /**
   * Get confirmation request
   */
  getConfirmationRequest(workflowId: string): WorkflowConfirmationRequest | undefined {
    return this.confirmations.get(workflowId);
  }

  /**
   * Get confirmation response
   */
  getConfirmationResponse(workflowId: string): WorkflowConfirmationResponse | undefined {
    return this.responses.get(workflowId);
  }

  /**
   * Check if workflow is confirmed
   */
  isConfirmed(workflowId: string): boolean {
    const request = this.confirmations.get(workflowId);
    return request?.state === WorkflowState.STATE_CONFIRMED;
  }

  /**
   * Check if workflow is rejected
   */
  isRejected(workflowId: string): boolean {
    const request = this.confirmations.get(workflowId);
    return request?.state === WorkflowState.STATE_REJECTED;
  }

  /**
   * Check if workflow is waiting for confirmation
   */
  isWaitingForConfirmation(workflowId: string): boolean {
    const request = this.confirmations.get(workflowId);
    return request?.state === WorkflowState.STATE_WAITING_CONFIRMATION;
  }

  /**
   * Get current state
   */
  getState(workflowId: string): WorkflowState | undefined {
    return this.confirmations.get(workflowId)?.state;
  }

  /**
   * Clear confirmation data (cleanup)
   */
  clear(workflowId: string): void {
    this.confirmations.delete(workflowId);
    this.responses.delete(workflowId);
  }
}

export const workflowConfirmationManager = new WorkflowConfirmationManager();
