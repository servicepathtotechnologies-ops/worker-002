import { preprocessPrompt } from './preprocessor';
import { callPlannerAgent } from './planner/plannerAgent';
import { validateWorkflowSpec } from './validator/specValidator';
import { resolveNodesFromSpec } from './resolver/nodeResolver';
import { buildWorkflowGraph, WorkflowGraph } from './builder/graphBuilder';
import { getMissingCredentialQuestions, storeCredential } from './credentials/credentialManager';
import { buildQuestionPlan, FieldQuestion } from './questions/questionEngine';
import { validateAndAutoRepair } from './validation/autoRepair';
import { WorkflowSpec } from './planner/types';

export interface SessionState {
  id: string;
  prompt: string;
  cleanPrompt: string;
  spec?: WorkflowSpec;
  clarifications: string[];
  graph?: WorkflowGraph;
  credentialQuestions: string[];
  fieldQuestions: FieldQuestion[];
  repairs: string[];
  status: 'pending' | 'needs_clarification' | 'awaiting_answers' | 'ready';
}

const sessions = new Map<string, SessionState>();

export function createSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function startWorkflowGeneration(prompt: string): Promise<SessionState> {
  const id = createSessionId();
  const cleanPrompt = preprocessPrompt(prompt);

  const { spec } = await callPlannerAgent(cleanPrompt);
  const validated = validateWorkflowSpec(spec);

  const base: SessionState = {
    id,
    prompt,
    cleanPrompt,
    spec: validated,
    clarifications: validated.clarifications || [],
    graph: undefined,
    credentialQuestions: [],
    fieldQuestions: [],
    repairs: [],
    status: validated.clarifications && validated.clarifications.length > 0 ? 'needs_clarification' : 'pending',
  };

  // If clarifications are needed, stop here and wait for user answers
  if (base.status === 'needs_clarification') {
    sessions.set(id, base);
    return base;
  }

  // Deterministic node resolution and graph building
  const nodes = resolveNodesFromSpec(validated);
  const graph = buildWorkflowGraph(nodes);
  const { repairs } = validateAndAutoRepair(graph);

  // Credential and field questions
  const credentialQuestions = getMissingCredentialQuestions(graph.nodes).map((q) => q.question);
  const { questions } = buildQuestionPlan(graph.nodes);

  const final: SessionState = {
    ...base,
    graph,
    repairs,
    credentialQuestions,
    fieldQuestions: questions,
    status: credentialQuestions.length || questions.length ? 'awaiting_answers' : 'ready',
  };

  sessions.set(id, final);
  return final;
}

export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

export function answerCredential(provider: string, data: Record<string, any>): void {
  storeCredential(provider, data);
}

export default {
  startWorkflowGeneration,
  getSession,
  answerCredential,
};

