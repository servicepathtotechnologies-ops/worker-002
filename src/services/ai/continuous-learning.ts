/**
 * Continuous Learning Service
 * 
 * Automatically collects feedback and trains model on new examples
 * Similar to how ChatGPT/Gemini continuously improve
 * 
 * Strategy:
 * 1. Collect feedback from workflow executions
 * 2. Track user modifications (indicates wrong workflows)
 * 3. Batch process high-quality examples
 * 4. Auto-train model weekly
 * 5. Deploy if better than current
 */

import { Workflow } from '../../core/types/ai-types';
import { createClient } from '@supabase/supabase-js';
import { config } from '../../core/config';
// Dynamic import to avoid TypeScript rootDir restriction
// import { OllamaModelTrainer } from '../../../scripts/train-ollama-model';

interface WorkflowFeedback {
  id?: string;
  workflowId: string;
  userPrompt: string;
  generatedWorkflow: Workflow;
  executionResult: {
    success: boolean;
    errors?: string[];
    executionTime?: number;
    userSatisfaction?: number; // 1-5 rating
  };
  userActions: {
    modified: boolean;
    modifications?: string[];
    deleted: boolean;
    recreated: boolean;
  };
  qualityScore?: number; // Calculated quality score
  timestamp: Date;
  usedForTraining?: boolean;
  trainingBatchId?: string;
}

interface TrainingBatch {
  id: string;
  modelVersion: string;
  exampleCount: number;
  accuracyBefore: number;
  accuracyAfter: number;
  deployed: boolean;
  createdAt: Date;
}

export class ContinuousLearningService {
  private supabase: any;
  private feedbackQueue: WorkflowFeedback[] = [];
  private minExamplesForTraining = 50; // Minimum examples for batch training
  private trainingInterval = 7 * 24 * 60 * 60 * 1000; // 7 days
  private trainingTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
  }

  /**
   * Initialize service and start auto-training scheduler
   */
  async initialize(): Promise<void> {
    console.log('🧠 Initializing Continuous Learning Service...');
    
    // Load pending feedback from database
    await this.loadPendingFeedback();
    
    // Start auto-training scheduler
    this.startAutoTrainingScheduler();
    
    console.log('✅ Continuous Learning Service initialized');
  }

  /**
   * Collect feedback after workflow execution
   */
  async collectFeedback(
    userPrompt: string,
    workflow: Workflow,
    workflowId: string,
    executionResult: {
      success: boolean;
      errors?: string[];
      executionTime?: number;
    }
  ): Promise<void> {
    const feedback: WorkflowFeedback = {
      workflowId,
      userPrompt,
      generatedWorkflow: workflow,
      executionResult: {
        success: executionResult.success,
        errors: executionResult.errors,
        executionTime: executionResult.executionTime,
      },
      userActions: {
        modified: false,
        deleted: false,
        recreated: false,
      },
      timestamp: new Date(),
    };

    // Calculate quality score
    feedback.qualityScore = this.calculateQualityScore(feedback);

    // Store in memory queue
    this.feedbackQueue.push(feedback);

    // Store in database for persistence
    await this.storeFeedback(feedback);

    console.log(`📊 Collected feedback (queue: ${this.feedbackQueue.length}/${this.minExamplesForTraining})`);

    // Check if ready for training
    if (this.feedbackQueue.length >= this.minExamplesForTraining) {
      console.log('🚀 Queue full, triggering training...');
      await this.triggerTraining();
    }
  }

  /**
   * Track user modifications (indicates wrong workflow)
   */
  async trackUserModification(
    workflowId: string,
    originalWorkflow: Workflow,
    modifiedWorkflow: Workflow
  ): Promise<void> {
    // Find original feedback
    const { data: feedbackData } = await this.supabase
      .from('workflow_feedback')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (feedbackData) {
      const modifications = this.detectChanges(originalWorkflow, modifiedWorkflow);
      
      // Update feedback
      await this.supabase
        .from('workflow_feedback')
        .update({
          user_actions: {
            modified: true,
            modifications: modifications,
          },
          execution_result: {
            ...feedbackData.execution_result,
            user_satisfaction: modifications.length > 3 ? 2 : 3, // Low if many changes
          },
          quality_score: this.calculateQualityScore({
            ...feedbackData,
            userActions: {
              modified: true,
              modifications: modifications,
            },
          }),
        })
        .eq('id', feedbackData.id);

      console.log(`📝 Tracked user modification: ${modifications.length} changes`);
    }
  }

  /**
   * Track workflow generation (for learning)
   */
  async trackGeneration(
    userPrompt: string,
    workflow: Workflow,
    workflowId: string,
    validationResult: any
  ): Promise<void> {
    // Store generation metadata (not full feedback yet)
    // Full feedback collected after execution
    await this.supabase
      .from('workflow_feedback')
      .insert({
        workflow_id: workflowId,
        user_prompt: userPrompt,
        generated_workflow: workflow,
        execution_result: {
          validation_passed: validationResult.valid,
          validation_errors: validationResult.errors?.length || 0,
        },
        user_actions: {
          modified: false,
        },
        quality_score: validationResult.valid ? 4 : 2,
        used_for_training: false,
      });
  }

  /**
   * Calculate quality score (1-5)
   */
  private calculateQualityScore(feedback: WorkflowFeedback): number {
    let score = 5;

    // Deduct for failures
    if (!feedback.executionResult.success) {
      score -= 2;
    }

    // Deduct for user modifications
    if (feedback.userActions.modified) {
      const modCount = feedback.userActions.modifications?.length || 0;
      score -= Math.min(modCount * 0.5, 2);
    }

    // Deduct for deletion
    if (feedback.userActions.deleted) {
      score -= 3;
    }

    // Deduct for low satisfaction
    if (feedback.executionResult.userSatisfaction) {
      score -= (5 - feedback.executionResult.userSatisfaction) * 0.5;
    }

    return Math.max(1, Math.min(5, Math.round(score)));
  }

  /**
   * Detect changes between workflows
   */
  private detectChanges(
    original: Workflow,
    modified: Workflow
  ): string[] {
    const changes: string[] = [];

    // Node changes
    if (original.nodes.length !== modified.nodes.length) {
      changes.push(`Node count: ${original.nodes.length} → ${modified.nodes.length}`);
    }

    // Check for added/removed nodes
    const originalNodeTypes = new Set(original.nodes.map(n => n.type));
    const modifiedNodeTypes = new Set(modified.nodes.map(n => n.type));
    
    const added = Array.from(modifiedNodeTypes).filter(t => !originalNodeTypes.has(t));
    const removed = Array.from(originalNodeTypes).filter(t => !modifiedNodeTypes.has(t));
    
    if (added.length > 0) changes.push(`Added nodes: ${added.join(', ')}`);
    if (removed.length > 0) changes.push(`Removed nodes: ${removed.join(', ')}`);

    // Edge changes
    if (original.edges.length !== modified.edges.length) {
      changes.push(`Edge count: ${original.edges.length} → ${modified.edges.length}`);
    }

    return changes;
  }

  /**
   * Filter high-quality examples for training
   */
  private filterQualityExamples(
    examples: WorkflowFeedback[]
  ): WorkflowFeedback[] {
    return examples.filter(feedback => {
      // Only use successful workflows
      if (!feedback.executionResult.success) return false;
      
      // Exclude workflows user heavily modified
      if (feedback.userActions.modified) {
        const modCount = feedback.userActions.modifications?.length || 0;
        if (modCount > 3) return false; // Too many changes = wrong workflow
      }
      
      // Exclude deleted workflows
      if (feedback.userActions.deleted) return false;
      
      // Prefer high quality score
      if (feedback.qualityScore && feedback.qualityScore < 3) {
        return false; // Low quality
      }
      
      return true;
    });
  }

  /**
   * Trigger training when queue is full
   */
  private async triggerTraining(): Promise<void> {
    console.log(`🚀 Auto-triggering training with ${this.feedbackQueue.length} examples`);
    
    // Filter high-quality examples
    const qualityExamples = this.filterQualityExamples(this.feedbackQueue);
    
    console.log(`   Filtered to ${qualityExamples.length} high-quality examples`);
    
    if (qualityExamples.length >= this.minExamplesForTraining) {
      await this.trainModel(qualityExamples);
      this.feedbackQueue = []; // Clear queue
    } else {
      console.log(`   Not enough quality examples (need ${this.minExamplesForTraining}, have ${qualityExamples.length})`);
    }
  }

  /**
   * Train model on collected examples
   */
  private async trainModel(examples: WorkflowFeedback[]): Promise<void> {
    console.log(`🎓 Training model on ${examples.length} examples`);
    
    try {
      // Convert to training format
      const trainingData = this.convertToTrainingFormat(examples);
      
      // Create training batch record
      const batchId = await this.createTrainingBatch(examples.length);
      
      // Fine-tune model (incremental) - use require to avoid TypeScript rootDir restriction
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { OllamaModelTrainer } = require('../../../scripts/train-ollama-model');
      const trainer = new OllamaModelTrainer();
      await trainer.incrementalTrain(trainingData, batchId);
      
      // Mark examples as used
      await this.markExamplesAsUsed(examples, batchId);
      
      // Validate new model
      const validation = await this.validateNewModel();
      
      if (validation.betterThanCurrent) {
        await this.deployNewModel(batchId);
        console.log('✅ New model deployed');
      } else {
        console.log('⚠️  New model not better, keeping current');
        await this.markBatchNotDeployed(batchId);
      }
    } catch (error) {
      console.error('❌ Training failed:', error);
    }
  }

  /**
   * Convert feedback to training format
   */
  private convertToTrainingFormat(
    examples: WorkflowFeedback[]
  ): any[] {
    return examples.map(feedback => ({
      messages: [
        {
          role: 'system',
          content: 'You are an expert workflow builder. Generate workflows in JSON format.'
        },
        {
          role: 'user',
          content: feedback.userPrompt
        },
        {
          role: 'assistant',
          content: JSON.stringify({
            systemPrompt: `Build automated workflow to ${feedback.userPrompt.substring(0, 50)}`,
            nodes: feedback.generatedWorkflow.nodes.map(n => n.type),
            connections: feedback.generatedWorkflow.edges.map(e => `${e.source}→${e.target}`),
          })
        }
      ]
    }));
  }

  /**
   * Start auto-training scheduler (weekly)
   */
  private startAutoTrainingScheduler(): void {
    // Check and train weekly
    this.trainingTimer = setInterval(async () => {
      console.log('⏰ Weekly training check...');
      await this.checkAndTrain();
    }, this.trainingInterval);
    
    console.log('⏰ Auto-training scheduler started (weekly)');
  }

  /**
   * Check and train if conditions met
   */
  async checkAndTrain(): Promise<void> {
    // Load pending feedback
    await this.loadPendingFeedback();
    
    if (this.feedbackQueue.length >= this.minExamplesForTraining) {
      await this.triggerTraining();
    } else {
      console.log(`   Not enough examples (${this.feedbackQueue.length}/${this.minExamplesForTraining})`);
    }
  }

  /**
   * Load pending feedback from database
   */
  private async loadPendingFeedback(): Promise<void> {
    const { data } = await this.supabase
      .from('workflow_feedback')
      .select('*')
      .eq('used_for_training', false)
      .order('created_at', { ascending: true });
    
    if (data) {
      this.feedbackQueue = data.map(this.mapDbToFeedback);
      console.log(`   Loaded ${this.feedbackQueue.length} pending feedback items`);
    }
  }

  /**
   * Store feedback in database
   */
  private async storeFeedback(feedback: WorkflowFeedback): Promise<void> {
    await this.supabase
      .from('workflow_feedback')
      .insert({
        workflow_id: feedback.workflowId,
        user_prompt: feedback.userPrompt,
        generated_workflow: feedback.generatedWorkflow,
        execution_result: feedback.executionResult,
        user_actions: feedback.userActions,
        quality_score: feedback.qualityScore,
        created_at: feedback.timestamp.toISOString(),
        used_for_training: false,
      });
  }

  /**
   * Create training batch record
   */
  private async createTrainingBatch(exampleCount: number): Promise<string> {
    const { data } = await this.supabase
      .from('training_batches')
      .insert({
        model_version: `ctrlchecks-workflow-builder-v${Date.now()}`,
        example_count: exampleCount,
        deployed: false,
      })
      .select()
      .single();
    
    return data.id;
  }

  /**
   * Mark examples as used for training
   */
  private async markExamplesAsUsed(
    examples: WorkflowFeedback[],
    batchId: string
  ): Promise<void> {
    const ids = examples.map(e => e.id).filter(Boolean);
    
    if (ids.length > 0) {
      await this.supabase
        .from('workflow_feedback')
        .update({
          used_for_training: true,
          training_batch_id: batchId,
        })
        .in('id', ids);
    }
  }

  /**
   * Validate new model
   */
  private async validateNewModel(): Promise<{
    betterThanCurrent: boolean;
    accuracy: number;
  }> {
    // TODO: Implement validation tests
    // For now, assume better if training succeeded
    return {
      betterThanCurrent: true,
      accuracy: 0.85, // Placeholder
    };
  }

  /**
   * Deploy new model
   */
  private async deployNewModel(batchId: string): Promise<void> {
    // Update environment variable
    process.env.FINE_TUNED_MODEL = `ctrlchecks-workflow-builder-v${Date.now()}`;
    
    // Mark batch as deployed
    await this.supabase
      .from('training_batches')
      .update({ deployed: true })
      .eq('id', batchId);
    
    console.log('✅ New model deployed');
  }

  /**
   * Mark batch as not deployed
   */
  private async markBatchNotDeployed(batchId: string): Promise<void> {
    await this.supabase
      .from('training_batches')
      .update({ deployed: false })
      .eq('id', batchId);
  }

  /**
   * Map database record to feedback object
   */
  private mapDbToFeedback(dbRecord: any): WorkflowFeedback {
    return {
      id: dbRecord.id,
      workflowId: dbRecord.workflow_id,
      userPrompt: dbRecord.user_prompt,
      generatedWorkflow: dbRecord.generated_workflow,
      executionResult: dbRecord.execution_result,
      userActions: dbRecord.user_actions,
      qualityScore: dbRecord.quality_score,
      timestamp: new Date(dbRecord.created_at),
      usedForTraining: dbRecord.used_for_training,
      trainingBatchId: dbRecord.training_batch_id,
    };
  }
}

export const continuousLearningService = new ContinuousLearningService();
