/**
 * Type Definitions for Node Contracts and Workflow Validation
 * Centralized type definitions for Phase 1 implementation
 */

export type NodeCategory = 'trigger' | 'action' | 'tool' | 'ai' | 'utility' | 'condition' | 'data' | 'output' | 'social' | 'database' | 'http_api' | 'google' | 'logic' | 'triggers';

export interface NodeContract {
  nodeType: string;
  category: NodeCategory;
  inputs: string[];
  outputs: string[];
  requiredConfig: string[];
  optionalConfig: string[];
  credentialType: string | null;
  capabilities?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface EdgeValidationResult {
  valid: boolean;
  errors: string[];
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  fixes?: string[];
}

export interface WorkflowRepairResult {
  valid: boolean;
  repairedWorkflow: Workflow;
  fixes: string[];
  errors: string[];
}

export interface WorkflowNode {
  id: string;
  type: string;
  data: {
    type: string;
    label?: string;
    category?: string;
    config?: Record<string, unknown>;
    [key: string]: any;
  };
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
}

export interface Workflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: {
    generatedFrom?: string;
    systemPrompt?: string;
    requirements?: any;
    validation?: any;
    productionReady?: boolean;
    timestamp?: string;
    confidenceScore?: any;
    intent?: string;
    buildMode?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface RepairResult {
  repairedWorkflow: Workflow;
  fixes: string[];
  remainingErrors: string[];
}

export interface ValidationError {
  type: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  recoverable: boolean;
}
