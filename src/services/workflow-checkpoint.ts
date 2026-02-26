/**
 * Workflow Checkpoint Service
 * 
 * Allows workflow execution to resume after crash or failure.
 * 
 * Features:
 * - Save state after each node execution
 * - Store in database
 * - Resume from last successful node
 * - Support partial execution recovery
 * - Prevent re-running completed nodes
 */

import { getSupabaseClient } from '../core/database/supabase-compat';
import { WorkflowNode, WorkflowEdge } from '../core/types/ai-types';
import { LRUNodeOutputsCache } from '../core/cache/lru-node-outputs-cache';

/**
 * Checkpoint structure
 */
export interface WorkflowCheckpoint {
  workflowId: string;
  executionId: string;
  currentNode: string | null; // ID of node currently executing (null if completed)
  completedNodes: string[]; // IDs of successfully completed nodes
  failedNodes: string[]; // IDs of failed nodes
  nodeOutputs: Record<string, any>; // Outputs from completed nodes
  executionState: {
    input: any;
    ifElseResults: Record<string, boolean>;
    switchResults: Record<string, string | null>;
    context: Record<string, any>;
  };
  timestamp: number;
  status: 'running' | 'paused' | 'failed' | 'completed';
  metadata?: Record<string, any>;
}

/**
 * Checkpoint result
 */
export interface CheckpointResult {
  success: boolean;
  checkpointId?: string;
  error?: string;
}

/**
 * Resume result
 */
export interface ResumeResult {
  canResume: boolean;
  checkpoint?: WorkflowCheckpoint;
  completedNodeIds: Set<string>;
  nextNodeIndex: number;
  restoredState?: {
    nodeOutputs: LRUNodeOutputsCache;
    ifElseResults: Record<string, boolean>;
    switchResults: Record<string, string | null>;
  };
}

/**
 * Workflow Checkpoint Manager
 */
export class WorkflowCheckpointManager {
  private readonly tableName = 'workflow_checkpoints';
  
  /**
   * Save checkpoint after node execution
   */
  async saveCheckpoint(
    workflowId: string,
    executionId: string,
    completedNodeId: string,
    nodeOutput: any,
    executionState: {
      input: any;
      nodeOutputs: LRUNodeOutputsCache;
      ifElseResults: Record<string, boolean>;
      switchResults: Record<string, string | null>;
      context?: Record<string, any>;
    },
    executionOrder: WorkflowNode[],
    status: 'running' | 'paused' | 'failed' | 'completed' = 'running'
  ): Promise<CheckpointResult> {
    try {
      console.log(`[WorkflowCheckpoint] Saving checkpoint for execution ${executionId} after node ${completedNodeId}`);
      
      const supabase = getSupabaseClient();
      
      // Get existing checkpoint or create new
      const existing = await this.loadCheckpoint(executionId);
      
      const completedNodes = existing?.completedNodes || [];
      if (!completedNodes.includes(completedNodeId)) {
        completedNodes.push(completedNodeId);
      }
      
      // Get all node outputs
      const nodeOutputs: Record<string, any> = existing?.nodeOutputs || {};
      nodeOutputs[completedNodeId] = nodeOutput;
      
      // Merge with existing outputs
      const allOutputs = executionState.nodeOutputs.getAll();
      Object.entries(allOutputs).forEach(([nodeId, output]) => {
        nodeOutputs[nodeId] = output;
      });
      
      // Determine next node
      const nextNodeIndex = executionOrder.findIndex(n => n.id === completedNodeId) + 1;
      const currentNode = nextNodeIndex < executionOrder.length 
        ? executionOrder[nextNodeIndex].id 
        : null;
      
      const checkpoint: WorkflowCheckpoint = {
        workflowId,
        executionId,
        currentNode,
        completedNodes,
        failedNodes: existing?.failedNodes || [],
        nodeOutputs,
        executionState: {
          input: executionState.input,
          ifElseResults: executionState.ifElseResults,
          switchResults: executionState.switchResults,
          context: executionState.context || {},
        },
        timestamp: Date.now(),
        status: currentNode ? status : 'completed',
        metadata: {
          totalNodes: executionOrder.length,
          completedCount: completedNodes.length,
          nextNodeIndex,
        },
      };
      
      // Upsert checkpoint
      const { error } = await supabase
        .from(this.tableName)
        .upsert({
          execution_id: executionId,
          workflow_id: workflowId,
          checkpoint_data: checkpoint,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'execution_id',
        })
        .select();
      
      if (error) {
        console.error(`[WorkflowCheckpoint] Failed to save checkpoint:`, error);
        return {
          success: false,
          error: error.message,
        };
      }
      
      console.log(`[WorkflowCheckpoint] Checkpoint saved: ${completedNodes.length}/${executionOrder.length} nodes completed`);
      
      return {
        success: true,
        checkpointId: executionId,
      };
      
    } catch (error) {
      console.error(`[WorkflowCheckpoint] Error saving checkpoint:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * Load checkpoint for execution
   */
  async loadCheckpoint(executionId: string): Promise<WorkflowCheckpoint | null> {
    try {
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .from(this.tableName)
        .select('checkpoint_data')
        .eq('execution_id', executionId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          // No checkpoint found
          return null;
        }
        console.error(`[WorkflowCheckpoint] Failed to load checkpoint:`, error);
        return null;
      }
      
      if (!data || !data.checkpoint_data) {
        return null;
      }
      
      return data.checkpoint_data as WorkflowCheckpoint;
      
    } catch (error) {
      console.error(`[WorkflowCheckpoint] Error loading checkpoint:`, error);
      return null;
    }
  }
  
  /**
   * Check if execution can be resumed
   */
  async canResume(executionId: string): Promise<ResumeResult> {
    const checkpoint = await this.loadCheckpoint(executionId);
    
    if (!checkpoint) {
      return {
        canResume: false,
        completedNodeIds: new Set(),
        nextNodeIndex: 0,
      };
    }
    
    // Check if checkpoint is resumable
    if (checkpoint.status === 'completed') {
      return {
        canResume: false,
        completedNodeIds: new Set(checkpoint.completedNodes),
        nextNodeIndex: checkpoint.completedNodes.length,
      };
    }
    
    // Can resume
    const completedNodeIds = new Set(checkpoint.completedNodes);
    const nextNodeIndex = checkpoint.completedNodes.length;
    
    // Restore state
    const nodeOutputs = new LRUNodeOutputsCache();
    Object.entries(checkpoint.nodeOutputs).forEach(([nodeId, output]) => {
      nodeOutputs.set(nodeId, output);
    });
    
    return {
      canResume: true,
      checkpoint,
      completedNodeIds,
      nextNodeIndex,
      restoredState: {
        nodeOutputs,
        ifElseResults: checkpoint.executionState.ifElseResults,
        switchResults: checkpoint.executionState.switchResults,
      },
    };
  }
  
  /**
   * Resume execution from checkpoint
   */
  async resumeExecution(
    executionId: string,
    executionOrder: WorkflowNode[]
  ): Promise<ResumeResult> {
    const resumeResult = await this.canResume(executionId);
    
    if (!resumeResult.canResume || !resumeResult.checkpoint) {
      return resumeResult;
    }
    
    console.log(`[WorkflowCheckpoint] Resuming execution ${executionId} from checkpoint`);
    console.log(`[WorkflowCheckpoint] Completed nodes: ${resumeResult.completedNodeIds.size}/${executionOrder.length}`);
    console.log(`[WorkflowCheckpoint] Resuming from node index: ${resumeResult.nextNodeIndex}`);
    
    return resumeResult;
  }
  
  /**
   * Mark node as failed in checkpoint
   */
  async markNodeFailed(
    executionId: string,
    nodeId: string,
    error: string
  ): Promise<CheckpointResult> {
    try {
      const checkpoint = await this.loadCheckpoint(executionId);
      if (!checkpoint) {
        return {
          success: false,
          error: 'Checkpoint not found',
        };
      }
      
      const failedNodes = checkpoint.failedNodes || [];
      if (!failedNodes.includes(nodeId)) {
        failedNodes.push(nodeId);
      }
      
      const supabase = getSupabaseClient();
      
      const { error: updateError } = await supabase
        .from(this.tableName)
        .update({
          checkpoint_data: {
            ...checkpoint,
            failedNodes,
            status: 'failed',
            metadata: {
              ...checkpoint.metadata,
              lastError: error,
              lastFailedNode: nodeId,
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('execution_id', executionId);
      
      if (updateError) {
        console.error(`[WorkflowCheckpoint] Failed to mark node as failed:`, updateError);
        return {
          success: false,
          error: updateError.message,
        };
      }
      
      return {
        success: true,
      };
      
    } catch (error) {
      console.error(`[WorkflowCheckpoint] Error marking node as failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * Mark execution as completed
   */
  async markCompleted(
    executionId: string,
    finalOutput: any
  ): Promise<CheckpointResult> {
    try {
      const checkpoint = await this.loadCheckpoint(executionId);
      if (!checkpoint) {
        return {
          success: false,
          error: 'Checkpoint not found',
        };
      }
      
      const supabase = getSupabaseClient();
      
      const { error } = await supabase
        .from(this.tableName)
        .update({
          checkpoint_data: {
            ...checkpoint,
            status: 'completed',
            currentNode: null,
            metadata: {
              ...checkpoint.metadata,
              finalOutput,
              completedAt: Date.now(),
            },
          },
          updated_at: new Date().toISOString(),
        })
        .eq('execution_id', executionId);
      
      if (error) {
        console.error(`[WorkflowCheckpoint] Failed to mark as completed:`, error);
        return {
          success: false,
          error: error.message,
        };
      }
      
      console.log(`[WorkflowCheckpoint] Execution ${executionId} marked as completed`);
      
      return {
        success: true,
      };
      
    } catch (error) {
      console.error(`[WorkflowCheckpoint] Error marking as completed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  
  /**
   * Delete checkpoint
   */
  async deleteCheckpoint(executionId: string): Promise<boolean> {
    try {
      const supabase = getSupabaseClient();
      
      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('execution_id', executionId);
      
      if (error) {
        console.error(`[WorkflowCheckpoint] Failed to delete checkpoint:`, error);
        return false;
      }
      
      console.log(`[WorkflowCheckpoint] Checkpoint deleted for execution ${executionId}`);
      return true;
      
    } catch (error) {
      console.error(`[WorkflowCheckpoint] Error deleting checkpoint:`, error);
      return false;
    }
  }
  
  /**
   * Get checkpoint status
   */
  async getCheckpointStatus(executionId: string): Promise<{
    exists: boolean;
    status?: string;
    completedNodes?: number;
    totalNodes?: number;
    lastUpdated?: number;
  }> {
    const checkpoint = await this.loadCheckpoint(executionId);
    
    if (!checkpoint) {
      return { exists: false };
    }
    
    return {
      exists: true,
      status: checkpoint.status,
      completedNodes: checkpoint.completedNodes.length,
      totalNodes: checkpoint.metadata?.totalNodes,
      lastUpdated: checkpoint.timestamp,
    };
  }
}

// Export singleton instance
export const workflowCheckpoint = new WorkflowCheckpointManager();

// Types are already exported above, no need to re-export
