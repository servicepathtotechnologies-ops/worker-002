/**
 * Workflow Compiler - 8-Layer Pipeline Orchestrator
 * 
 * Orchestrates the complete workflow compilation pipeline:
 * Prompt → Intent → Plan → Nodes → Properties → Graph → Validation → Auth → Execution
 * 
 * This is the main entry point for the AI workflow compiler.
 */

import { intentEngine, type IntentObject } from './intent-engine';
import { plannerEngine, type PlanStep } from './planner-engine';
import { NodeResolver } from './node-resolver';
import { propertyInferenceEngine } from './property-inference-engine';
import { nodeLibrary } from '../nodes/node-library';
import { workflowValidator } from './workflow-validator';
import type { ValidationResult } from './workflow-validator';
import { ComprehensiveCredentialScanner } from './comprehensive-credential-scanner';
import type { WorkflowNode, WorkflowEdge, Workflow } from '../../core/types/ai-types';

export interface CompilerProgress {
  step: number;
  stepName: string;
  progress: number;
  details?: any;
}

export interface CompilerResult {
  workflow: Workflow;
  intent: IntentObject;
  plan: PlanStep[];
  validation: ValidationResult;
  requiredAuth: string[];
  confidence: number;
  missingFields: Record<string, string[]>; // Node ID → missing field names
}

/**
 * Workflow Compiler
 * 
 * Implements the 8-layer compiler pipeline:
 * 1. Intent Understanding (semantic decoder + ontology)
 * 2. Task Planning (ReAct-style planner)
 * 3. Node Selection (capability-based)
 * 4. Property Inference (multi-step + confidence)
 * 5. Workflow Graph Generation
 * 6. Validation + Optimization
 * 7. Authentication Resolver
 * 8. Execution Runtime (handled separately)
 */
export class WorkflowCompiler {
  private nodeResolver: NodeResolver;

  constructor() {
    this.nodeResolver = new NodeResolver(nodeLibrary);
  }

  /**
   * Compile workflow from prompt
   * 
   * @param prompt - User's natural language prompt
   * @param onProgress - Optional progress callback
   * @returns Compiled workflow with all metadata
   */
  async compile(
    prompt: string,
    onProgress?: (progress: CompilerProgress) => void
  ): Promise<CompilerResult> {
    try {
      console.log('[WorkflowCompiler] Starting compilation...');
      console.log(`[WorkflowCompiler] Prompt: "${prompt.substring(0, 100)}..."`);

      if (!prompt || prompt.trim().length === 0) {
        throw new Error('Prompt is required and cannot be empty');
      }

      // Layer 1: Intent Understanding
      onProgress?.({
        step: 1,
        stepName: 'Intent Understanding',
        progress: 10,
        details: { message: 'Extracting structured intent from prompt...' },
      });
      let intent: IntentObject;
      try {
        intent = await intentEngine.extractIntent(prompt);
        console.log(`[WorkflowCompiler] ✅ Layer 1: Intent extracted - ${intent.goal}`);
      } catch (error) {
        console.error('[WorkflowCompiler] Layer 1 failed:', error);
        throw new Error(`Intent extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Layer 2: Task Planning
      onProgress?.({
        step: 2,
        stepName: 'Task Planning',
        progress: 25,
        details: { message: 'Generating step-by-step plan...' },
      });
      let plan: PlanStep[];
      try {
        plan = await plannerEngine.generatePlan(intent);
        console.log(`[WorkflowCompiler] ✅ Layer 2: Plan generated - ${plan.length} steps`);
        if (plan.length === 0) {
          throw new Error('Plan generation returned empty plan');
        }
      } catch (error) {
        console.error('[WorkflowCompiler] Layer 2 failed:', error);
        throw new Error(`Task planning failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Layer 3: Node Selection
      onProgress?.({
        step: 3,
        stepName: 'Node Selection',
        progress: 40,
        details: { message: 'Selecting nodes from registry...' },
      });
      let nodeSelections: Array<{ step: PlanStep; nodeId: string }>;
      try {
        nodeSelections = await this.selectNodes(plan);
        console.log(`[WorkflowCompiler] ✅ Layer 3: Nodes selected - ${nodeSelections.length} nodes`);
        if (nodeSelections.length === 0) {
          throw new Error('No nodes selected from plan');
        }
      } catch (error) {
        console.error('[WorkflowCompiler] Layer 3 failed:', error);
        throw new Error(`Node selection failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Layer 4: Property Inference
      onProgress?.({
        step: 4,
        stepName: 'Property Inference',
        progress: 55,
        details: { message: 'Inferring node properties...' },
      });
      let nodes: WorkflowNode[];
      let missingFields: Record<string, string[]>;
      try {
        const inferenceResult = await this.inferProperties(
          nodeSelections,
          prompt,
          intent,
          plan
        );
        nodes = inferenceResult.nodes;
        missingFields = inferenceResult.missingFields;
        console.log(`[WorkflowCompiler] ✅ Layer 4: Properties inferred`);
      } catch (error) {
        console.error('[WorkflowCompiler] Layer 4 failed:', error);
        throw new Error(`Property inference failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Layer 5: Workflow Graph Generation
      onProgress?.({
        step: 5,
        stepName: 'Graph Generation',
        progress: 70,
        details: { message: 'Generating workflow graph...' },
      });
      let workflowNodes: WorkflowNode[];
      let edges: WorkflowEdge[];
      try {
        const graphResult = await this.generateGraph(nodes, plan);
        workflowNodes = graphResult.nodes;
        edges = graphResult.edges;
        console.log(`[WorkflowCompiler] ✅ Layer 5: Graph generated - ${workflowNodes.length} nodes, ${edges.length} edges`);
      } catch (error) {
        console.error('[WorkflowCompiler] Layer 5 failed:', error);
        throw new Error(`Graph generation failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Layer 6: Validation + Optimization
      onProgress?.({
        step: 6,
        stepName: 'Validation',
        progress: 85,
        details: { message: 'Validating workflow...' },
      });
      let validation: ValidationResult;
      try {
        validation = await workflowValidator.validateAndFix({
          nodes: workflowNodes,
          edges,
        });
        console.log(`[WorkflowCompiler] ✅ Layer 6: Validation complete - ${validation.valid ? 'valid' : 'invalid'}`);
      } catch (error) {
        console.error('[WorkflowCompiler] Layer 6 failed:', error);
        // Validation failure is not critical, create a basic validation result
        validation = {
          valid: false,
          errors: [{ type: 'validation_error' as any, severity: 'high' as any, message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`, fixable: false }],
          warnings: [],
          fixesApplied: [],
        };
      }

      // Layer 7: Authentication Resolver
      onProgress?.({
        step: 7,
        stepName: 'Auth Resolution',
        progress: 95,
        details: { message: 'Identifying required credentials...' },
      });
      let requiredAuth: string[];
      try {
        requiredAuth = await this.resolveAuth(workflowNodes);
        console.log(`[WorkflowCompiler] ✅ Layer 7: Auth resolved - ${requiredAuth.length} required`);
      } catch (error) {
        console.warn('[WorkflowCompiler] Layer 7 failed, using empty auth list:', error);
        requiredAuth = [];
      }

      // Calculate overall confidence
      const confidence = this.calculateConfidence(validation, missingFields, nodes.length);

      onProgress?.({
        step: 8,
        stepName: 'Complete',
        progress: 100,
        details: { message: 'Compilation complete' },
      });

      const workflow: Workflow = {
        nodes: workflowNodes,
        edges,
      };

      return {
        workflow,
        intent,
        plan,
        validation,
        requiredAuth,
        confidence,
        missingFields,
      };
    } catch (error) {
      console.error('[WorkflowCompiler] Compilation failed:', error);
      throw error;
    }
  }

  /**
   * Layer 3: Node Selection
   * 
   * Maps plan steps to actual node IDs from registry
   */
  private async selectNodes(plan: PlanStep[]): Promise<Array<{ step: PlanStep; nodeId: string }>> {
    const selections: Array<{ step: PlanStep; nodeId: string }> = [];

    for (const step of plan) {
      try {
        // If step already has a tool (node ID), validate and use it
        if (step.tool && step.tool.trim().length > 0) {
          const schema = nodeLibrary.getSchema(step.tool);
          if (schema) {
            selections.push({ step, nodeId: step.tool });
            continue;
          } else {
            console.warn(`[WorkflowCompiler] Tool "${step.tool}" not found in registry, attempting resolution`);
          }
        }

        // Otherwise, resolve using NodeResolver
        const intents = this.nodeResolver.extractIntents(step.action);
        if (intents.length > 0) {
          const resolution = this.nodeResolver.resolveIntent(intents[0]);
          if (resolution.success && resolution.result) {
            selections.push({ step, nodeId: resolution.result.nodeId });
          } else {
            // Fallback: try to find node by action name
            const fallbackNode = this.findNodeByAction(step.action);
            if (fallbackNode) {
              selections.push({ step, nodeId: fallbackNode });
            } else {
              console.warn(`[WorkflowCompiler] Could not resolve node for action: ${step.action}`);
              // Use manual_trigger as last resort for first step, otherwise skip
              if (step.order === 1) {
                selections.push({ step, nodeId: 'manual_trigger' });
              } else {
                selections.push({ step, nodeId: step.action });
              }
            }
          }
        } else {
          // No intent extracted, try to find node by action name
          const fallbackNode = this.findNodeByAction(step.action);
          if (fallbackNode) {
            selections.push({ step, nodeId: fallbackNode });
          } else {
            selections.push({ step, nodeId: step.action });
          }
        }
      } catch (error) {
        console.error(`[WorkflowCompiler] Error selecting node for step "${step.action}":`, error);
        // Use action as fallback
        selections.push({ step, nodeId: step.action });
      }
    }

    return selections;
  }

  /**
   * Find node by action name (fallback method)
   */
  private findNodeByAction(action: string): string | null {
    const actionLower = action.toLowerCase();
    const schemas = nodeLibrary.getAllSchemas();

    for (const schema of schemas) {
      // Check capabilities
      if (schema.capabilities) {
        for (const capability of schema.capabilities) {
          if (capability.toLowerCase().includes(actionLower) || 
              actionLower.includes(capability.toLowerCase())) {
            return schema.type;
          }
        }
      }

      // Check keywords
      if (schema.keywords) {
        for (const keyword of schema.keywords) {
          if (keyword.toLowerCase().includes(actionLower) ||
              actionLower.includes(keyword.toLowerCase())) {
            return schema.type;
          }
        }
      }

      // Check description
      if (schema.description.toLowerCase().includes(actionLower)) {
        return schema.type;
      }
    }

    return null;
  }

  /**
   * Layer 4: Property Inference
   * 
   * Infers properties for each node with confidence scoring
   */
  private async inferProperties(
    nodeSelections: Array<{ step: PlanStep; nodeId: string }>,
    prompt: string,
    intent: IntentObject,
    plan: PlanStep[]
  ): Promise<{
    nodes: WorkflowNode[];
    missingFields: Record<string, string[]>;
  }> {
    const nodes: WorkflowNode[] = [];
    const missingFields: Record<string, string[]> = {};
    const previousStepOutputs: Record<string, any> = {};

    for (let i = 0; i < nodeSelections.length; i++) {
      const { step, nodeId } = nodeSelections[i];
      const nodeSchema = nodeLibrary.getSchema(nodeId);

      if (!nodeSchema) {
        console.warn(`[WorkflowCompiler] Node schema not found: ${nodeId}, skipping`);
        continue;
      }

      // Infer properties
      const inferenceResult = await propertyInferenceEngine.inferProperties(
        nodeId,
        prompt,
        step,
        intent,
        previousStepOutputs
      );

      // Create workflow node
      const node: WorkflowNode = {
        id: step.id,
        type: nodeId,
        position: { x: i * 200, y: 100 },
        data: {
          label: nodeSchema.label || nodeId,
          type: nodeId,
          category: nodeSchema.category || 'general',
          config: inferenceResult.properties,
        },
      };

      nodes.push(node);

      // Track missing fields
      if (inferenceResult.missingFields.length > 0) {
        missingFields[step.id] = inferenceResult.missingFields;
      }

      // Simulate previous step output (for next iteration)
      previousStepOutputs[step.id] = {
        output: `Output from ${step.action}`,
        data: inferenceResult.properties,
      };
    }

    return { nodes, missingFields };
  }

  /**
   * Layer 5: Workflow Graph Generation
   * 
   * Creates workflow DAG from nodes and plan
   */
  private async generateGraph(
    nodes: WorkflowNode[],
    plan: PlanStep[]
  ): Promise<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }> {
    const edges: WorkflowEdge[] = [];
    const nodeMap = new Map<string, WorkflowNode>();
    nodes.forEach(node => nodeMap.set(node.id, node));

    // Create edges based on plan dependencies
    for (const step of plan) {
      const sourceNode = nodeMap.get(step.id);
      if (!sourceNode) continue;

      // Connect to dependent steps
      for (const depId of step.dependencies) {
        const targetNode = nodeMap.get(depId);
        if (targetNode) {
          edges.push({
            id: `${depId}->${step.id}`,
            source: depId,
            target: step.id,
            sourceHandle: 'output',
            targetHandle: 'input',
          });
        }
      }

      // If no dependencies, connect to trigger (if exists)
      if (step.dependencies.length === 0) {
        const triggerNode = nodes.find(n => n.type === 'manual_trigger' || n.type === 'form' || n.type === 'webhook');
        if (triggerNode && triggerNode.id !== step.id) {
          edges.push({
            id: `${triggerNode.id}->${step.id}`,
            source: triggerNode.id,
            target: step.id,
            sourceHandle: 'output',
            targetHandle: 'input',
          });
        }
      }
    }

    // Ensure linear flow if no explicit dependencies
    if (edges.length === 0 && nodes.length > 1) {
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({
          id: `${nodes[i].id}->${nodes[i + 1].id}`,
          source: nodes[i].id,
          target: nodes[i + 1].id,
          sourceHandle: 'output',
          targetHandle: 'input',
        });
      }
    }

    return { nodes, edges };
  }

  /**
   * Layer 7: Authentication Resolver
   * 
   * Identifies required authentication types
   */
  private async resolveAuth(nodes: WorkflowNode[]): Promise<string[]> {
    const scanner = new ComprehensiveCredentialScanner(nodeLibrary);
    const requiredAuth: string[] = [];

    for (const node of nodes) {
      const nodeSchema = nodeLibrary.getSchema(node.type);
      if (nodeSchema) {
        // Check if node requires auth (this would be in schema)
        // For now, use simple heuristics
        if (node.type.includes('gmail') || node.type.includes('google')) {
          if (!requiredAuth.includes('google_oauth')) {
            requiredAuth.push('google_oauth');
          }
        }
        if (node.type.includes('slack')) {
          if (!requiredAuth.includes('slack_oauth')) {
            requiredAuth.push('slack_oauth');
          }
        }
        if (node.type.includes('crm') || node.type.includes('hubspot')) {
          if (!requiredAuth.includes('crm_oauth')) {
            requiredAuth.push('crm_oauth');
          }
        }
      }
    }

    return requiredAuth;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidence(
    validation: ValidationResult,
    missingFields: Record<string, string[]>,
    nodeCount: number
  ): number {
    let confidence = 1.0;

    // Penalize validation errors
    if (!validation.valid && validation.errors) {
      const criticalErrors = validation.errors.filter(e => e.severity === 'critical').length;
      const highErrors = validation.errors.filter(e => e.severity === 'high').length;
      confidence -= criticalErrors * 0.2;
      confidence -= highErrors * 0.1;
      confidence -= (validation.errors.length - criticalErrors - highErrors) * 0.05;
    }

    // Penalize missing fields
    const totalMissingFields = Object.values(missingFields).reduce((sum, fields) => sum + fields.length, 0);
    if (nodeCount > 0) {
      confidence -= (totalMissingFields / (nodeCount * 5)) * 0.3; // Assume ~5 fields per node on average
    }

    return Math.max(0.0, Math.min(1.0, confidence));
  }
}

export const workflowCompiler = new WorkflowCompiler();
