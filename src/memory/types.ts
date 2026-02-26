/**
 * Type definitions for n8n-style Memory System
 */

// Note: Workflow type is not directly used in this file
// It's only referenced in comments/documentation
// import type { Workflow } from '../../core/types/ai-types';

/**
 * Workflow Definition Structure
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: any[];
  edges: any[];
  settings?: Record<string, any>;
  tags?: string[];
}

/**
 * Workflow Metadata
 */
export interface WorkflowMetadata {
  version: number;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  tags: string[];
  settings: Record<string, any>;
}

/**
 * Execution Statistics
 */
export interface ExecutionStatistics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  successRate: number;
  averageExecutionTime: number;
  lastExecutionAt?: Date;
  lastSuccessfulExecutionAt?: Date;
  lastFailedExecutionAt?: Date;
}

/**
 * Memory Reference
 */
export interface MemoryReference {
  id: string;
  workflowId?: string;
  referenceType: 'example' | 'template' | 'pattern' | 'documentation';
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
  createdAt: Date;
}

/**
 * Similar Workflow
 */
export interface SimilarWorkflow {
  workflowId: string;
  name: string;
  similarity: number;
  definition: WorkflowDefinition;
  metadata: WorkflowMetadata;
  statistics: ExecutionStatistics;
}

/**
 * Execution Record
 */
export interface ExecutionRecord {
  id: string;
  workflowId: string;
  status: 'running' | 'success' | 'error' | 'waiting';
  inputData?: any;
  resultData?: any;
  startedAt: Date;
  finishedAt?: Date;
  executionTime?: number;
  errorMessage?: string;
  context?: Record<string, any>;
}

/**
 * Node Execution Record
 */
export interface NodeExecutionRecord {
  id: string;
  executionId: string;
  nodeId: string;
  nodeType: string;
  inputData?: any;
  outputData?: any;
  status: string;
  error?: string;
  duration?: number;
  sequence: number;
  metadata?: Record<string, any>;
}

/**
 * AI Context Structure
 */
export interface AIContext {
  currentWorkflow?: WorkflowDefinition;
  similarPatterns: SimilarWorkflow[];
  executionHistory: {
    successful: ExecutionRecord[];
    failed: ExecutionRecord[];
    statistics: ExecutionStatistics;
  };
  templates: Template[];
  constraints: SystemConstraints;
  suggestions: Suggestion[];
  documentation?: Documentation[];
}

/**
 * Template
 */
export interface Template {
  id: string;
  name: string;
  description: string;
  workflowDefinition: WorkflowDefinition;
  category: string;
  tags: string[];
}

/**
 * System Constraints
 */
export interface SystemConstraints {
  maxWorkflowSize: number;
  maxNodes: number;
  maxConcurrentExecutions: number;
  timeout: number;
  allowedNodeTypes: string[];
  resourceLimits: {
    memory: number;
    cpu: number;
  };
}

/**
 * Suggestion
 */
export interface Suggestion {
  type: 'optimization' | 'warning' | 'improvement' | 'best_practice';
  message: string;
  priority: 'low' | 'medium' | 'high';
  nodeId?: string;
  details?: Record<string, any>;
}

/**
 * Documentation
 */
export interface Documentation {
  title: string;
  content: string;
  nodeType?: string;
  category?: string;
  url?: string;
}

/**
 * Workflow Memory
 */
export interface WorkflowMemory {
  id: string;
  definition: WorkflowDefinition;
  metadata: WorkflowMetadata;
  embeddings: number[];
  statistics: ExecutionStatistics;
  references: MemoryReference[];
}

/**
 * Memory Configuration
 */
export interface MemoryConfig {
  maxCacheSize: number;
  retentionPolicy: RetentionPolicy;
  embeddingModel: string;
  similarityThreshold: number;
  vectorDimensions: number;
  enableVectorSearch: boolean;
}

/**
 * Retention Policy
 */
export interface RetentionPolicy {
  executionRetentionDays: number;
  workflowRetentionDays: number;
  logRetentionDays: number;
  enableAutoPrune: boolean;
}

/**
 * Vector Search Result
 */
export interface VectorSearchResult {
  id: string;
  score: number;
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Workflow Analysis Result
 */
export interface WorkflowAnalysis {
  complexity: {
    score: number;
    nodeCount: number;
    edgeCount: number;
    depth: number;
    branchingFactor: number;
  };
  dependencies: {
    nodeTypes: string[];
    externalServices: string[];
    credentials: string[];
  };
  resourceEstimate: {
    memoryMB: number;
    executionTimeMs: number;
    costEstimate?: number;
  };
  potentialIssues: {
    type: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    nodeId?: string;
  }[];
  optimizationSuggestions: Suggestion[];
}
