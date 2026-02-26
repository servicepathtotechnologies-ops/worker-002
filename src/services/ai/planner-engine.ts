/**
 * Layer 2: Task Planning Engine
 * 
 * ReAct-style planner that converts intent into step-by-step plan.
 * Implements: Thought → Action → Tool selection → Reason loop
 * 
 * Architecture:
 * Intent → ReAct Planning → Tool Selection → Dependency Resolution → Plan Steps
 */

import { ollamaOrchestrator } from './ollama-orchestrator';
import { nodeLibrary } from '../nodes/node-library';
import type { IntentObject } from './intent-engine';

export interface PlanStep {
  id: string;              // Unique step ID (e.g., "step_1")
  action: string;         // High-level action: "fetch leads"
  tool: string;           // Node ID from registry: "crm.get_leads"
  reason: string;         // Why this step is needed: "Need leads before sending emails"
  dependencies: string[]; // Step IDs this depends on: ["step_0"]
  order: number;          // Execution order: 1, 2, 3...
  estimatedDuration?: number; // Estimated duration in seconds
}

export interface PlanningContext {
  intent: IntentObject;
  availableNodes: string[];  // Node IDs from registry
  workflowTemplates?: string[]; // Template names for common patterns
}

/**
 * Task Planning Engine
 * 
 * Implements ReAct-style planning:
 * 1. Thought: Understand what needs to be done
 * 2. Action: Decide on next step
 * 3. Tool: Select node from registry
 * 4. Reason: Explain why this step is needed
 * 5. Repeat until plan is complete
 */
export class PlannerEngine {
  private templateLibrary: Map<string, PlanStep[]> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  /**
   * Generate step-by-step plan from intent
   * 
   * @param intent - Structured intent from Layer 1
   * @returns Array of PlanStep objects with dependencies
   */
  async generatePlan(intent: IntentObject): Promise<PlanStep[]> {
    if (!intent || !intent.goal || !Array.isArray(intent.actions)) {
      throw new Error('Invalid intent: goal and actions are required');
    }

    console.log('[PlannerEngine] Generating plan from intent...');
    console.log(`[PlannerEngine] Goal: ${intent.goal}`);
    console.log(`[PlannerEngine] Actions: ${intent.actions.length}`);

    try {
      // Check if we have a matching template
      const template = this.findMatchingTemplate(intent);
      if (template) {
        console.log(`[PlannerEngine] Using template: ${template}`);
        const templatePlan = this.adaptTemplate(template, intent);
        if (templatePlan.length > 0) {
          return templatePlan;
        }
        // If template adaptation failed, fall through to ReAct planning
      }

      // Use ReAct-style planning
      const plan = await this.reactPlanning(intent);

      // Resolve dependencies
      const planWithDependencies = this.resolveDependencies(plan);

      if (planWithDependencies.length === 0) {
        throw new Error('Plan generation returned empty plan');
      }

      console.log(`[PlannerEngine] ✅ Plan generated: ${planWithDependencies.length} steps`);

      return planWithDependencies;
    } catch (error) {
      console.error('[PlannerEngine] Plan generation failed:', error);
      // Fallback to simple sequential plan
      console.log('[PlannerEngine] Using fallback planning');
      return this.fallbackPlanning(intent);
    }
  }

  /**
   * ReAct-style planning loop
   * 
   * Thought → Action → Tool → Reason → Next Thought
   */
  private async reactPlanning(intent: IntentObject): Promise<PlanStep[]> {
    const availableNodes = this.getAvailableNodes();
    const steps: PlanStep[] = [];
    const maxIterations = 10; // Prevent infinite loops
    let iteration = 0;

    // Build planning prompt
    const planningPrompt = this.buildPlanningPrompt(intent, availableNodes);

    try {
      const result = await ollamaOrchestrator.processRequest('workflow-generation', {
        prompt: planningPrompt,
        temperature: 0.2,  // Low temperature for deterministic planning
        maxTokens: 2000,
      });

      const content = typeof result === 'string' ? result : JSON.stringify(result);
      const cleaned = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const planData = JSON.parse(cleaned);

      // Parse plan steps
      if (Array.isArray(planData.steps)) {
        for (let i = 0; i < planData.steps.length; i++) {
          const stepData = planData.steps[i];
          steps.push({
            id: `step_${i}`,
            action: stepData.action || stepData.step || '',
            tool: stepData.tool || stepData.node || '',
            reason: stepData.reason || stepData.explanation || '',
            dependencies: stepData.dependencies || [],
            order: i + 1,
          });
        }
      } else if (Array.isArray(planData)) {
        // Direct array of steps
        for (let i = 0; i < planData.length; i++) {
          const stepData = planData[i];
          steps.push({
            id: `step_${i}`,
            action: stepData.action || stepData.step || '',
            tool: stepData.tool || stepData.node || '',
            reason: stepData.reason || stepData.explanation || '',
            dependencies: stepData.dependencies || [],
            order: i + 1,
          });
        }
      }

      // Validate and map tools to actual node IDs
      return this.validateAndMapTools(steps, availableNodes);
    } catch (error) {
      console.error('[PlannerEngine] ReAct planning failed:', error);
      // Fallback to simple sequential plan
      return this.fallbackPlanning(intent);
    }
  }

  /**
   * Build planning prompt for ReAct-style planning
   */
  private buildPlanningPrompt(intent: IntentObject, availableNodes: string[]): string {
    const nodeDescriptions = availableNodes.slice(0, 50).map(nodeId => {
      const schema = nodeLibrary.getSchema(nodeId);
      if (schema) {
        return `- ${nodeId}: ${schema.description}`;
      }
      return `- ${nodeId}`;
    }).join('\n');

    return `You are a workflow planning agent. Your task is to create a step-by-step plan to accomplish the user's goal.

USER GOAL: ${intent.goal}

REQUIRED ACTIONS: ${intent.actions.join(', ')}

ENTITIES INVOLVED: ${intent.entities.join(', ')}

CONSTRAINTS: ${intent.constraints.join(', ')}

AVAILABLE NODES (tools):
${nodeDescriptions}

PLANNING PROCESS (ReAct-style):
1. **Thought**: Understand what needs to be done
2. **Action**: Decide on the next step
3. **Tool**: Select a node from the available nodes list that can perform this action
4. **Reason**: Explain why this step is needed and what it accomplishes
5. **Dependencies**: List which previous steps this step depends on (if any)

CRITICAL RULES:
- Each step must use a tool (node) from the available nodes list
- Steps must be in logical execution order
- Dependencies must reference previous step IDs (e.g., ["step_0", "step_1"])
- The first step typically has no dependencies
- Consider data flow: step N's output feeds into step N+1
- Handle constraints (e.g., "if no reply" → add conditional step)

Return ONLY valid JSON in this format:
{
  "steps": [
    {
      "action": "fetch leads",
      "tool": "crm.get_leads",
      "reason": "Need to get leads before sending emails",
      "dependencies": []
    },
    {
      "action": "send email",
      "tool": "google_gmail",
      "reason": "Send email to each lead",
      "dependencies": ["step_0"]
    },
    {
      "action": "wait for reply",
      "tool": "delay",
      "reason": "Wait 3 days for reply",
      "dependencies": ["step_1"]
    },
    {
      "action": "check reply",
      "tool": "gmail.watch",
      "reason": "Check if lead replied",
      "dependencies": ["step_2"]
    },
    {
      "action": "follow up",
      "tool": "google_gmail",
      "reason": "Send follow-up if no reply",
      "dependencies": ["step_3"]
    }
  ]
}

Return ONLY JSON, no markdown, no code blocks, no explanations.`;
  }

  /**
   * Validate and map tools to actual node IDs
   */
  private validateAndMapTools(steps: PlanStep[], availableNodes: string[]): PlanStep[] {
    return steps.map(step => {
      // If tool is already a valid node ID, use it
      if (availableNodes.includes(step.tool)) {
        return step;
      }

      // Try to find matching node by capability or keyword
      const matchedNode = this.findMatchingNode(step.action, step.tool, availableNodes);
      if (matchedNode) {
        return {
          ...step,
          tool: matchedNode,
        };
      }

      // If no match found, keep original but log warning
      console.warn(`[PlannerEngine] No matching node found for tool: ${step.tool}, action: ${step.action}`);
      return step;
    });
  }

  /**
   * Find matching node for action/tool
   */
  private findMatchingNode(action: string, tool: string, availableNodes: string[]): string | null {
    const actionLower = action.toLowerCase();
    const toolLower = tool.toLowerCase();

    // Try exact match first
    for (const nodeId of availableNodes) {
      if (nodeId.toLowerCase() === toolLower) {
        return nodeId;
      }
    }

    // Try capability matching
    for (const nodeId of availableNodes) {
      const schema = nodeLibrary.getSchema(nodeId);
      if (schema) {
        // Check capabilities
        if (schema.capabilities) {
          for (const capability of schema.capabilities) {
            if (capability.toLowerCase().includes(actionLower) || 
                actionLower.includes(capability.toLowerCase())) {
              return nodeId;
            }
          }
        }

        // Check keywords
        if (schema.keywords) {
          for (const keyword of schema.keywords) {
            if (keyword.toLowerCase().includes(actionLower) ||
                actionLower.includes(keyword.toLowerCase())) {
              return nodeId;
            }
          }
        }

        // Check description
        if (schema.description.toLowerCase().includes(actionLower)) {
          return nodeId;
        }
      }
    }

    return null;
  }

  /**
   * Resolve dependencies between steps
   */
  private resolveDependencies(steps: PlanStep[]): PlanStep[] {
    // Ensure step IDs are correct
    const stepMap = new Map<string, PlanStep>();
    steps.forEach(step => stepMap.set(step.id, step));

    // Resolve dependencies
    return steps.map(step => {
      const resolvedDependencies = step.dependencies
        .filter(depId => stepMap.has(depId)) // Only include valid dependencies
        .sort((a, b) => {
          // Sort by order
          const stepA = stepMap.get(a);
          const stepB = stepMap.get(b);
          if (!stepA || !stepB) return 0;
          return stepA.order - stepB.order;
        });

      return {
        ...step,
        dependencies: resolvedDependencies,
      };
    });
  }

  /**
   * Get available nodes from registry
   */
  private getAvailableNodes(): string[] {
    const schemas = nodeLibrary.getAllSchemas();
    return schemas.map(s => s.type);
  }

  /**
   * Find matching template for intent
   */
  private findMatchingTemplate(intent: IntentObject): string | null {
    const goalLower = intent.goal.toLowerCase();

    // Check template library
    for (const [templateName, templateSteps] of this.templateLibrary.entries()) {
      if (goalLower.includes(templateName.toLowerCase())) {
        return templateName;
      }
    }

    // Check for common patterns
    if (goalLower.includes('sales') || goalLower.includes('lead')) {
      return 'sales_automation';
    }
    if (goalLower.includes('notification') || goalLower.includes('alert')) {
      return 'notification';
    }
    if (goalLower.includes('sync') || goalLower.includes('transfer')) {
      return 'data_sync';
    }

    return null;
  }

  /**
   * Adapt template to intent
   */
  private adaptTemplate(templateName: string, intent: IntentObject): PlanStep[] {
    const template = this.templateLibrary.get(templateName);
    if (!template) {
      return this.fallbackPlanning(intent);
    }

    // Adapt template steps to match intent actions
    return template.map((step, index) => ({
      ...step,
      id: `step_${index}`,
      order: index + 1,
      // Update action if it matches intent
      action: intent.actions[index] || step.action,
    }));
  }

  /**
   * Initialize workflow templates
   */
  private initializeTemplates(): void {
    // Sales automation template
    this.templateLibrary.set('sales_automation', [
      {
        id: 'step_0',
        action: 'fetch leads',
        tool: 'crm.get_leads',
        reason: 'Get leads from CRM',
        dependencies: [],
        order: 1,
      },
      {
        id: 'step_1',
        action: 'send email',
        tool: 'google_gmail',
        reason: 'Send initial outreach email',
        dependencies: ['step_0'],
        order: 2,
      },
      {
        id: 'step_2',
        action: 'wait',
        tool: 'delay',
        reason: 'Wait for reply',
        dependencies: ['step_1'],
        order: 3,
      },
      {
        id: 'step_3',
        action: 'follow up',
        tool: 'google_gmail',
        reason: 'Send follow-up if no reply',
        dependencies: ['step_2'],
        order: 4,
      },
    ]);

    // Notification template
    this.templateLibrary.set('notification', [
      {
        id: 'step_0',
        action: 'trigger',
        tool: 'manual_trigger',
        reason: 'Manual trigger',
        dependencies: [],
        order: 1,
      },
      {
        id: 'step_1',
        action: 'send notification',
        tool: 'slack_message',
        reason: 'Send notification message',
        dependencies: ['step_0'],
        order: 2,
      },
    ]);
  }

  /**
   * Fallback planning (simple sequential)
   */
  private fallbackPlanning(intent: IntentObject): PlanStep[] {
    return intent.actions.map((action, index) => ({
      id: `step_${index}`,
      action,
      tool: '', // Will be resolved in Layer 3
      reason: `Execute: ${action}`,
      dependencies: index > 0 ? [`step_${index - 1}`] : [],
      order: index + 1,
    }));
  }
}

export const plannerEngine = new PlannerEngine();
