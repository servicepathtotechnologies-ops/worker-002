// Training Data Collector
// Collects user interactions for model training

import { Workflow, WorkflowNode } from '../../core/types/ai-types';
import { AnalysisResult } from '../ai/workflow-analyzer';
import { ExtractedRequirements } from '../ai/requirements-extractor';

export interface TrainingExample {
  id: string;
  timestamp: string;
  userPrompt: string;
  analysis?: AnalysisResult;
  requirements?: ExtractedRequirements;
  generatedWorkflow?: Workflow;
  userRating?: number; // 1-5
  userFeedback?: string;
  wasWorkflowUsed?: boolean;
  wasWorkflowModified?: boolean;
  executionCount?: number;
}

/**
 * TrainingDataCollector
 * 
 * Collects training data from user interactions:
 * - User prompts and generated workflows
 * - Question-answer pairs
 * - User feedback and ratings
 * - Workflow usage statistics
 */
export class TrainingDataCollector {
  private examples: TrainingExample[] = [];
  private maxInMemory = 1000; // Keep last 1000 examples in memory

  /**
   * Collect example from workflow generation session
   */
  async collectExample(
    userPrompt: string,
    analysis?: AnalysisResult,
    requirements?: ExtractedRequirements,
    generatedWorkflow?: Workflow
  ): Promise<string> {
    const example: TrainingExample = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      userPrompt,
      analysis,
      requirements,
      generatedWorkflow,
    };

    this.examples.push(example);
    
    // Trim if too many in memory
    if (this.examples.length > this.maxInMemory) {
      this.examples = this.examples.slice(-this.maxInMemory);
    }

    return example.id;
  }

  /**
   * Update example with user feedback
   */
  async updateFeedback(
    exampleId: string,
    rating?: number,
    feedback?: string
  ): Promise<void> {
    const example = this.examples.find(e => e.id === exampleId);
    if (example) {
      if (rating !== undefined) {
        example.userRating = rating;
      }
      if (feedback !== undefined) {
        example.userFeedback = feedback;
      }
    }
  }

  /**
   * Update example with usage statistics
   */
  async updateUsage(
    exampleId: string,
    wasUsed: boolean,
    wasModified: boolean,
    executionCount: number
  ): Promise<void> {
    const example = this.examples.find(e => e.id === exampleId);
    if (example) {
      example.wasWorkflowUsed = wasUsed;
      example.wasWorkflowModified = wasModified;
      example.executionCount = executionCount;
    }
  }

  /**
   * Format example for Llama training (Step 2: Question Generation)
   */
  formatForLlamaTraining(example: TrainingExample): string | null {
    if (!example.analysis || !example.analysis.questions.length) {
      return null;
    }

    // Format questions
    const questionsText = example.analysis.questions
      .map(q => {
        const optionsText = q.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n');
        return `Q: ${q.text}\n${optionsText}`;
      })
      .join('\n\n');

    const output = `Summary: ${example.analysis.summary}\n\nQuestions:\n${questionsText}`;

    return JSON.stringify({
      instruction: 'Generate clarifying questions for workflow request',
      input: example.userPrompt,
      output: output,
    });
  }

  /**
   * Format example for Qwen training (Step 5: Workflow Building)
   */
  formatForQwenTraining(example: TrainingExample): string | null {
    if (!example.generatedWorkflow || !example.requirements) {
      return null;
    }

    // Build system prompt from requirements
    const systemPrompt = this.buildSystemPrompt(example.requirements);

    // Format workflow as JSON
    const workflowJson = JSON.stringify(example.generatedWorkflow, null, 2);

    return JSON.stringify({
      instruction: 'Build workflow from requirements',
      input: systemPrompt,
      output: workflowJson,
    });
  }

  /**
   * Build system prompt from requirements
   */
  private buildSystemPrompt(requirements: ExtractedRequirements): string {
    const parts: string[] = [];

    if (requirements.primaryGoal) {
      parts.push(requirements.primaryGoal);
    }

    if (requirements.keySteps.length > 0) {
      parts.push(`Steps: ${requirements.keySteps.join(', ')}`);
    }

    if (requirements.schedules.length > 0) {
      parts.push(`Schedule: ${requirements.schedules.join(', ')}`);
    }

    if (requirements.platforms.length > 0) {
      parts.push(`Platforms: ${requirements.platforms.join(', ')}`);
    }

    return parts.join('. ') + '.';
  }

  /**
   * Export training data in JSONL format
   */
  exportForTraining(
    format: 'llama' | 'qwen',
    minRating?: number
  ): string[] {
    let examples = this.examples;

    // Filter by rating if specified
    if (minRating !== undefined) {
      examples = examples.filter(e => 
        e.userRating !== undefined && e.userRating >= minRating
      );
    }

    // Format examples
    const formatted: string[] = [];
    
    for (const example of examples) {
      let formattedExample: string | null = null;
      
      if (format === 'llama') {
        formattedExample = this.formatForLlamaTraining(example);
      } else if (format === 'qwen') {
        formattedExample = this.formatForQwenTraining(example);
      }

      if (formattedExample) {
        formatted.push(formattedExample);
      }
    }

    return formatted;
  }

  /**
   * Get statistics about collected data
   */
  getStatistics(): {
    totalExamples: number;
    withAnalysis: number;
    withWorkflow: number;
    withRating: number;
    averageRating: number;
    usedWorkflows: number;
    modifiedWorkflows: number;
  } {
    const withAnalysis = this.examples.filter(e => e.analysis).length;
    const withWorkflow = this.examples.filter(e => e.generatedWorkflow).length;
    const withRating = this.examples.filter(e => e.userRating !== undefined);
    const averageRating = withRating.length > 0
      ? withRating.reduce((sum, e) => sum + (e.userRating || 0), 0) / withRating.length
      : 0;
    const usedWorkflows = this.examples.filter(e => e.wasWorkflowUsed).length;
    const modifiedWorkflows = this.examples.filter(e => e.wasWorkflowModified).length;

    return {
      totalExamples: this.examples.length,
      withAnalysis,
      withWorkflow,
      withRating: withRating.length,
      averageRating,
      usedWorkflows,
      modifiedWorkflows,
    };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `ex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const trainingDataCollector = new TrainingDataCollector();
