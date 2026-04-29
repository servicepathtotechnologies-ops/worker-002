import { preprocessPrompt } from './preprocessor';
import { callPlannerAgent } from './planner/plannerAgent';
import { validateWorkflowSpec } from './validator/specValidator';
import { resolveNodesFromSpec } from './resolver/nodeResolver';
import { buildWorkflowGraph, WorkflowGraph } from './builder/graphBuilder';
import { getMissingCredentialQuestions, storeCredential } from './credentials/credentialManager';
import { buildQuestionPlan, FieldQuestion } from './questions/questionEngine';
import { validateAndAutoRepair } from './validation/autoRepair';
import { WorkflowSpec } from './planner/types';
import { getPlannerSession, upsertPlannerSession } from './services/ai/planner-session-repository';

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
  stage: 'analyze' | 'generate' | 'confirm';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function createSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function startWorkflowGeneration(prompt: string): Promise<SessionState> {
  const id = createSessionId();
  const cleanPrompt = preprocessPrompt(prompt);
  const nowIso = new Date().toISOString();

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
    stage: 'analyze',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // If clarifications are needed, stop here and wait for user answers
  if (base.status === 'needs_clarification') {
    await upsertPlannerSession({
      id: base.id,
      stage: base.stage,
      status: base.status,
      version: base.version,
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
      artifacts: base,
    });
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
    stage: 'generate',
    version: base.version + 1,
    updatedAt: new Date().toISOString(),
  };

  await upsertPlannerSession({
    id: final.id,
    stage: final.stage,
    status: final.status,
    version: final.version,
    createdAt: final.createdAt,
    updatedAt: final.updatedAt,
    artifacts: final,
  });
  return final;
}

export async function getSession(sessionId: string): Promise<SessionState | undefined> {
  const record = await getPlannerSession<SessionState>(sessionId);
  return record?.artifacts;
}

export function answerCredential(provider: string, data: Record<string, any>): void {
  storeCredential(provider, data);
}

export default {
  startWorkflowGeneration,
  getSession,
  answerCredential,
};

