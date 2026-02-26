// Reasoning Engine for CtrlChecks AI Agents
// Provides step-by-step reasoning capabilities for AI agents

import { LLMAdapter, LLMMessage, LLMOptions } from './llm-adapter';
import { workflowTrainingService } from '../services/ai/workflow-training-service';

export interface ReasoningStep {
  step: number;
  thought: string;
  action?: string;
  result?: any;
  confidence?: number;
}

export interface Action {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, any>;
  nodeId?: string;
}

export interface ReasoningContext {
  goal: string;
  currentState: any;
  availableActions: Action[];
  history: ReasoningStep[];
  constraints?: string[];
  maxSteps?: number;
}

export interface ReasoningResult {
  nextAction: Action | null;
  reasoning: ReasoningStep[];
  confidence: number;
  plan?: Action[];
  shouldContinue: boolean;
}

/**
 * Reasoning Engine for AI Agents
 */
export class ReasoningEngine {
  private llmAdapter: LLMAdapter;

  constructor() {
    this.llmAdapter = new LLMAdapter();
  }

  /**
   * Reason about the next action to take
   */
  async reason(
    context: ReasoningContext,
    options: LLMOptions & { provider?: 'openai' | 'claude' | 'gemini' | 'ollama' } = { 
      model: 'qwen2.5:14b-instruct-q4_K_M', 
      temperature: 0.3,
      provider: 'ollama'
    }
  ): Promise<ReasoningResult> {
    const reasoningSteps: ReasoningStep[] = [];
    const maxSteps = context.maxSteps || 5;

    const prompt = this.buildReasoningPrompt(context);

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a reasoning agent. Think step by step about how to achieve the goal.
Analyze the current state, available actions, and determine the best next action.
Be precise, logical, and explain your reasoning clearly.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    try {
      const provider = options.provider || LLMAdapter.detectProvider(options.model);
      const response = await this.llmAdapter.chat(provider, messages, options);
      const reasoningText = response.content;

      const parsed = this.parseReasoningResponse(reasoningText, context);
      const steps = this.extractReasoningSteps(reasoningText, parsed.stepCount || 1);
      
      reasoningSteps.push(...steps);

      const nextAction = this.selectNextAction(parsed, context.availableActions);
      const confidence = this.calculateConfidence(parsed, context);
      const shouldContinue = !parsed.goalAchieved && reasoningSteps.length < maxSteps;

      return {
        nextAction,
        reasoning: reasoningSteps,
        confidence,
        plan: parsed.plan,
        shouldContinue,
      };
    } catch (error) {
      console.error('Reasoning engine error:', error);
      
      return {
        nextAction: context.availableActions[0] || null,
        reasoning: [{
          step: 1,
          thought: `Error in reasoning: ${error instanceof Error ? error.message : String(error)}. Falling back to first available action.`,
        }],
        confidence: 0.3,
        shouldContinue: false,
      };
    }
  }

  /**
   * Generate an action plan
   */
  async plan(
    goal: string,
    availableActions: Action[],
    currentState?: any,
    options: LLMOptions & { provider?: 'openai' | 'claude' | 'gemini' | 'ollama' } = { 
      model: 'qwen2.5:14b-instruct-q4_K_M', 
      temperature: 0.3,
      provider: 'ollama'
    }
  ): Promise<Action[]> {
    const actionsList = availableActions
      .map((action, idx) => `${idx + 1}. ${action.name}: ${action.description}`)
      .join('\n');

    const prompt = `Goal: ${goal}

Current State: ${JSON.stringify(currentState || {}, null, 2)}

Available Actions:
${actionsList}

Generate a step-by-step plan to achieve the goal. List the actions in order.
Return a JSON array of action IDs in the order they should be executed.

Example format: ["action1", "action2", "action3"]`;

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a planning agent. Generate a logical sequence of actions to achieve goals.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    try {
      const provider = options.provider || LLMAdapter.detectProvider(options.model);
      const response = await this.llmAdapter.chat(provider, messages, options);
      const planText = response.content;

      const jsonMatch = planText.match(/\[["\w\s,]+\]/);
      if (jsonMatch) {
        const actionIds = JSON.parse(jsonMatch[0]);
        const plan = actionIds
          .map((id: string) => availableActions.find(a => a.id === id))
          .filter((action: Action | undefined) => action !== undefined) as Action[];

        return plan;
      }

      return availableActions;
    } catch (error) {
      console.error('Planning error:', error);
      return availableActions;
    }
  }

  private buildReasoningPrompt(context: ReasoningContext): string {
    const actionsList = context.availableActions
      .map((action, idx) => `${idx + 1}. ${action.name} (ID: ${action.id}): ${action.description}`)
      .join('\n');

    const historyText = context.history.length > 0
      ? context.history
          .map(step => `Step ${step.step}: ${step.thought}${step.action ? ` → Action: ${step.action}` : ''}${step.result ? ` → Result: ${JSON.stringify(step.result)}` : ''}`)
          .join('\n')
      : 'No previous steps.';

    const constraintsText = context.constraints && context.constraints.length > 0
      ? `\nConstraints:\n${context.constraints.map(c => `- ${c}`).join('\n')}`
      : '';

    // Get few-shot examples from training service for better reasoning
    let fewShotPrompt = '';
    try {
      fewShotPrompt = workflowTrainingService.buildExecutionReasoningFewShotPrompt(
        context.goal,
        context.currentState,
        context.availableActions
      );
    } catch (error) {
      console.warn('⚠️  Failed to get training examples for execution reasoning:', error);
    }

    const basePrompt = `Goal: ${context.goal}

Current State:
${JSON.stringify(context.currentState, null, 2)}

Previous Reasoning Steps:
${historyText}

Available Actions:
${actionsList}${constraintsText}

Analyze the situation and determine:
1. What is the current situation?
2. What actions are available?
3. Which action should be taken next to progress toward the goal?
4. Why is this the best action?
5. What is the expected outcome?

Think step by step. Return your reasoning in a structured format:
- Thought: [your analysis]
- Next Action: [action ID]
- Confidence: [0.0 to 1.0]
- Goal Achieved: [true/false]`;

    // Prepend few-shot examples if available
    if (fewShotPrompt && fewShotPrompt.trim().length > 0) {
      return `${fewShotPrompt}\n\n${basePrompt}`;
    }

    return basePrompt;
  }

  private parseReasoningResponse(
    response: string,
    context: ReasoningContext
  ): {
    thought: string;
    nextActionId: string | null;
    confidence: number;
    goalAchieved: boolean;
    plan?: Action[];
    stepCount: number;
  } {
    const thoughtMatch = response.match(/Thought:\s*(.+?)(?:\n|$)/i);
    const thought = thoughtMatch ? thoughtMatch[1].trim() : response.substring(0, 200);

    const actionMatch = response.match(/Next Action:\s*([^\n]+)/i);
    const nextActionId = actionMatch ? actionMatch[1].trim() : null;

    const confidenceMatch = response.match(/Confidence:\s*([0-9.]+)/i);
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;

    const goalMatch = response.match(/Goal Achieved:\s*(true|false)/i);
    const goalAchieved = goalMatch ? goalMatch[1].toLowerCase() === 'true' : false;

    return {
      thought,
      nextActionId,
      confidence: Math.max(0, Math.min(1, confidence)),
      goalAchieved,
      stepCount: 1,
    };
  }

  private extractReasoningSteps(response: string, stepCount: number): ReasoningStep[] {
    const steps: ReasoningStep[] = [];
    const stepPattern = /(?:Step\s+)?(\d+)\.\s*(.+?)(?=\n\d+\.|$)/gs;
    let match;
    let stepNum = 1;

    while ((match = stepPattern.exec(response)) !== null && stepNum <= stepCount) {
      steps.push({
        step: stepNum++,
        thought: match[2].trim(),
      });
    }

    if (steps.length === 0) {
      steps.push({
        step: 1,
        thought: response.substring(0, 500),
      });
    }

    return steps;
  }

  private selectNextAction(
    parsed: { nextActionId: string | null; confidence: number },
    availableActions: Action[]
  ): Action | null {
    if (!parsed.nextActionId) {
      return availableActions[0] || null;
    }

    const action = availableActions.find(a => a.id === parsed.nextActionId);
    if (action) {
      return action;
    }

    const nameMatch = parsed.nextActionId ? availableActions.find(a =>
      a.name.toLowerCase().includes(parsed.nextActionId!.toLowerCase()) ||
      parsed.nextActionId!.toLowerCase().includes(a.name.toLowerCase())
    ) : null;

    return nameMatch || availableActions[0] || null;
  }

  private calculateConfidence(
    parsed: { confidence: number; goalAchieved: boolean },
    context: ReasoningContext
  ): number {
    let confidence = parsed.confidence;

    if (context.availableActions.length === 0) {
      confidence = 0;
    } else if (context.availableActions.length === 1) {
      confidence = Math.min(confidence, 0.7);
    }

    if (context.history.length > 10) {
      confidence *= 0.9;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  async evaluateGoal(
    goal: string,
    currentState: any,
    options: LLMOptions & { provider?: 'openai' | 'claude' | 'gemini' | 'ollama' } = { 
      model: 'qwen2.5:14b-instruct-q4_K_M', 
      temperature: 0.1,
      provider: 'ollama'
    }
  ): Promise<boolean> {
    const prompt = `Goal: ${goal}

Current State:
${JSON.stringify(currentState, null, 2)}

Has the goal been achieved? Answer with only "true" or "false".`;

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: 'You are a goal evaluation agent. Determine if goals have been achieved based on the current state.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    try {
      const provider = options.provider || LLMAdapter.detectProvider(options.model);
      const response = await this.llmAdapter.chat(provider, messages, options);
      const answer = response.content.toLowerCase().trim();
      return answer.includes('true') || answer.startsWith('yes');
    } catch (error) {
      console.error('Goal evaluation error:', error);
      return false;
    }
  }
}
