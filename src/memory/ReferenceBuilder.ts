/**
 * Reference Builder - Builds structured context for AI
 * Creates comprehensive context objects for workflow generation
 */

import { MemoryManager } from './MemoryManager';
import {
  AIContext,
  WorkflowDefinition,
  SimilarWorkflow,
  ExecutionRecord,
  Template,
  SystemConstraints,
  Suggestion,
  Documentation,
} from './types';

export interface ReferenceBuilderConfig {
  maxSimilarPatterns: number;
  maxSuccessfulExecutions: number;
  maxFailedExecutions: number;
}

/**
 * Reference Builder - Creates AI context from memory
 */
export class ReferenceBuilder {
  private memoryManager: MemoryManager;
  private config: ReferenceBuilderConfig;

  constructor(memoryManager: MemoryManager, config?: Partial<ReferenceBuilderConfig>) {
    this.memoryManager = memoryManager;
    this.config = {
      maxSimilarPatterns: config?.maxSimilarPatterns || 5,
      maxSuccessfulExecutions: config?.maxSuccessfulExecutions || 3,
      maxFailedExecutions: config?.maxFailedExecutions || 2,
    };
  }

  /**
   * Build context for AI workflow generation
   */
  async buildContext(
    workflowId: string | null,
    intent: 'creation' | 'modification' | 'analysis' | 'optimization',
    userQuery?: string
  ): Promise<AIContext> {
    const context: AIContext = {
      currentWorkflow: undefined,
      similarPatterns: [],
      executionHistory: {
        successful: [],
        failed: [],
        statistics: {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          successRate: 0,
          averageExecutionTime: 0,
        },
      },
      templates: [],
      constraints: this.getSystemConstraints(),
      suggestions: [],
      documentation: [],
    };

    // Get current workflow if workflowId provided
    if (workflowId) {
      const workflowMemory = await this.memoryManager.getWorkflowReference(workflowId);
      if (workflowMemory) {
        context.currentWorkflow = workflowMemory.definition;
        context.executionHistory.statistics = workflowMemory.statistics;

        // Get execution history
        const executions = await this.getExecutionHistory(workflowId);
        context.executionHistory.successful = executions.successful;
        context.executionHistory.failed = executions.failed;
      }
    }

    // Find similar patterns
    if (userQuery) {
      context.similarPatterns = await this.memoryManager.findSimilarWorkflows(
        userQuery,
        this.config.maxSimilarPatterns
      );
    } else if (workflowId && context.currentWorkflow) {
      // Find similar to current workflow
      const similar = await this.memoryManager.findSimilarWorkflows(
        context.currentWorkflow.name || '',
        this.config.maxSimilarPatterns
      );
      context.similarPatterns = similar;
    }

    // Get templates (from memory references)
    context.templates = await this.getTemplates(intent);

    // Generate suggestions based on context
    context.suggestions = await this.generateSuggestions(context, intent);

    // Get relevant documentation
    context.documentation = await this.getDocumentation(context);

    return context;
  }

  /**
   * Get execution history for a workflow
   */
  private async getExecutionHistory(workflowId: string): Promise<{
    successful: ExecutionRecord[];
    failed: ExecutionRecord[];
  }> {
    // This would query the database through MemoryManager
    // For now, return empty arrays - implementation would use Prisma
    return {
      successful: [],
      failed: [],
    };
  }

  /**
   * Get system constraints
   */
  private getSystemConstraints(): SystemConstraints {
    return {
      maxWorkflowSize: 10 * 1024 * 1024, // 10MB
      maxNodes: 1000,
      maxConcurrentExecutions: 10,
      timeout: 5 * 60 * 1000, // 5 minutes
      allowedNodeTypes: [], // Empty means all allowed
      resourceLimits: {
        memory: 512 * 1024 * 1024, // 512MB
        cpu: 1,
      },
    };
  }

  /**
   * Get templates based on intent
   */
  private async getTemplates(intent: string): Promise<Template[]> {
    // This would query memory references with type 'template'
    // For now, return empty array
    return [];
  }

  /**
   * Generate suggestions based on context
   */
  private async generateSuggestions(
    context: AIContext,
    intent: string
  ): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    // Analyze current workflow if available
    if (context.currentWorkflow) {
      const nodeCount = context.currentWorkflow.nodes?.length || 0;
      if (nodeCount > 50) {
        suggestions.push({
          type: 'warning',
          message: 'Workflow has many nodes. Consider breaking it into smaller workflows.',
          priority: 'medium',
        });
      }

      // Check execution statistics
      if (context.executionHistory.statistics.successRate < 0.5) {
        suggestions.push({
          type: 'improvement',
          message: 'Workflow has low success rate. Review error patterns.',
          priority: 'high',
        });
      }
    }

    // Add similar pattern suggestions
    if (context.similarPatterns.length > 0) {
      suggestions.push({
        type: 'best_practice',
        message: `Found ${context.similarPatterns.length} similar workflows. Consider reusing proven patterns.`,
        priority: 'low',
      });
    }

    return suggestions;
  }

  /**
   * Get relevant documentation
   */
  private async getDocumentation(context: AIContext): Promise<Documentation[]> {
    const docs: Documentation[] = [];

    // Extract node types from current workflow or similar patterns
    const nodeTypes = new Set<string>();
    if (context.currentWorkflow?.nodes) {
      context.currentWorkflow.nodes.forEach((node: any) => {
        const type = node.type || node.data?.type;
        if (type) nodeTypes.add(type);
      });
    }

    context.similarPatterns.forEach(pattern => {
      pattern.definition.nodes?.forEach((node: any) => {
        const type = node.type || node.data?.type;
        if (type) nodeTypes.add(type);
      });
    });

    // Generate documentation entries for each node type
    // In a real implementation, this would fetch from a documentation store
    nodeTypes.forEach(nodeType => {
      docs.push({
        title: `${nodeType} Node`,
        content: `Documentation for ${nodeType} node type`,
        nodeType,
      });
    });

    return docs;
  }
}
