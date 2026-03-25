// Comprehensive Type Definitions for AI Workflow System
// Central type definitions to ensure type safety across the codebase

export type AIRequestType = 
  | 'workflow-generation'
  | 'workflow-analysis'
  | 'workflow-improvement'
  | 'text-completion'
  | 'chat'
  | 'analysis'
  // ✅ New: explicit Gemini planning mode (steps only, no edges)
  | 'workflow-planning';

export interface AIRequest {
  type: AIRequestType;
  input: any;
  options?: AIOptions;
}

export interface AIOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  context?: string;
  expectedOutputs?: string[];
}

export interface AIResponse<T = any> {
  success: boolean;
  data: T;
  metadata: {
    modelUsed: string;
    processingTime: number;
    tokensUsed: number;
    confidence?: number;
  };
  error?: AIError;
}

export interface AIError {
  code: string;
  message: string;
  details?: any;
}

// Workflow Structure Types
export interface WorkflowStructure {
  id?: string;
  name: string;
  description: string;
  inputs: InputDefinition[];
  outputs: OutputDefinition[];
  steps: WorkflowStep[];
  constraints: Constraint[];
  metadata: WorkflowMetadata;
}

export interface InputDefinition {
  name: string;
  type: InputOutputType;
  description: string;
  required: boolean;
  defaultValue?: any;
  validation?: ValidationRule;
}

export interface OutputDefinition {
  name: string;
  type: InputOutputType;
  description: string;
  format?: string;
  required: boolean;
}

export type InputOutputType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'object' 
  | 'array' 
  | 'file';

export interface ValidationRule {
  min?: number;
  max?: number;
  pattern?: string;
  custom?: (value: any) => boolean | string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  nodeType: string;
  configuration: Record<string, any>;
  dependsOn?: string[];
}

export interface Constraint {
  type: 'performance' | 'security' | 'cost' | 'compliance' | 'custom';
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface WorkflowMetadata {
  /** Raw user textarea / API originalPrompt — used for form field extraction (not merged planner text). */
  originalUserPrompt?: string;
  generatedFrom?: string;
  requirements?: string;
  validation?: WorkflowValidation;
  timestamp: string;
  modelUsed?: string;
  version?: string;
}

export interface WorkflowValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  overallConfidence?: number;
}

// Workflow Node Types
export interface WorkflowNode {
  id: string;
  type: string;
  position?: { x: number; y: number };
  data: {
    label: string;
    type: string;
    category: string;
    config: Record<string, unknown>;
    // Additional properties for execution order tracking
    executionOrder?: number;
    stepRef?: string;
    stepType?: string;
    [key: string]: unknown; // Allow additional properties
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  sourceHandle?: string; // Output field name from source node
  targetHandle?: string; // Input field name for target node
}

export interface Workflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: any;
}

// =========================
// Gemini Planning Contracts
// =========================

/**
 * Planned step produced by Gemini in workflow-planning mode.
 * This is a high-level planning artifact: no edges, only ordered steps.
 */
export interface PlannedStep {
  id: string;
  /**
   * Node type that MUST exist in the Unified Node Registry.
   */
  type: string;
  /**
   * Optional semantic role hint for the planner/executor (trigger | action | logic | output | utility).
   * Actual behavior is still driven by the registry.
   */
  role?: string;
  /**
   * Optional configuration fragment proposed by Gemini.
   * Will be normalized/validated against the node's inputSchema and defaultConfig.
   */
  config?: Record<string, any>;
}

/**
 * Planned workflow structure emitted by Gemini.
 * The system will hydrate this into a full Workflow using the Unified Node Registry
 * and the Unified Graph Orchestrator (which will derive all edges and execution order).
 */
export interface PlannedWorkflow {
  summary: string;
  steps: PlannedStep[];
}

// Requirements Analysis Types
export interface DataTransformation {
  type: 'format_conversion' | 'filtering' | 'aggregation' | 'mapping' | 'custom';
  sourceFormat?: string;
  targetFormat?: string;
  mappingRequired?: boolean;
  criteria?: any[];
  operations?: any[];
  operator?: string;
}

export interface InputOutputMapping {
  sourceNodeId: string;
  targetNodeId: string;
  fieldMappings: Record<string, string>;
}

export interface Requirements {
  primaryGoal: string;
  keySteps: string[];
  inputs: string[];
  outputs: string[];
  constraints: string[];
  stakeholders?: string[];
  complexity: 'simple' | 'medium' | 'complex';
  // Extended requirements for Step 4
  urls?: string[];
  apis?: string[];
  credentials?: string[];
  schedules?: string[];
  platforms?: string[];
  // Data transformation requirements
  dataTransformations?: DataTransformation[];
  inputOutputMappings?: InputOutputMapping[];
}

// Structure for workflow generation
export interface WorkflowGenerationStructure {
  trigger: string | null;
  steps: WorkflowStepDefinition[];
  outputs: OutputDefinition[];
  connections?: WorkflowConnection[];
}

export interface WorkflowConnection {
  source: string; // Step ID or 'trigger'
  target: string; // Step ID
  outputField?: string; // Output field name from source
  inputField?: string; // Input field name for target
}

export interface WorkflowStepDefinition {
  id: string;
  description: string;
  type: string;
}

// Generation Progress
export interface GenerationProgress {
  step: string;
  progress: number;
  details?: any;
}

// Node Suggestion Types
export interface NodeSuggestion {
  type: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

// Improvement Types
export interface ImprovementAnalysis {
  issues: string[];
  suggestedChanges: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface WorkflowImprovement {
  improvedWorkflow: Workflow;
  changes: Change[];
  rationale: string;
  confidence: number;
}

export interface Change {
  type: 'addition' | 'modification' | 'removal';
  description: string;
  impact: 'high' | 'medium' | 'low';
  nodeId?: string;
}
