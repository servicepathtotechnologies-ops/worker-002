import {
  canStartExecutionLlmCall,
  getAndClearExecutionUsage,
  recordExecutionLlmUsage,
  startExecutionTracking,
} from '../execution-usage-context';

describe('execution runtime AI usage budget', () => {
  const oldMaxCalls = process.env.WORKFLOW_RUNTIME_AI_MAX_CALLS;
  const oldTokenBudget = process.env.WORKFLOW_RUNTIME_AI_TOKEN_BUDGET;

  afterEach(() => {
    if (oldMaxCalls === undefined) delete process.env.WORKFLOW_RUNTIME_AI_MAX_CALLS;
    else process.env.WORKFLOW_RUNTIME_AI_MAX_CALLS = oldMaxCalls;
    if (oldTokenBudget === undefined) delete process.env.WORKFLOW_RUNTIME_AI_TOKEN_BUDGET;
    else process.env.WORKFLOW_RUNTIME_AI_TOKEN_BUDGET = oldTokenBudget;
  });

  it('blocks budgeted runtime input resolution after the configured call count', () => {
    process.env.WORKFLOW_RUNTIME_AI_MAX_CALLS = '1';
    process.env.WORKFLOW_RUNTIME_AI_TOKEN_BUDGET = '25000';

    startExecutionTracking('exec-budget-calls');
    expect(canStartExecutionLlmCall('runtime_input_resolution')).toBe(true);

    recordExecutionLlmUsage(100, 'runtime_input_resolution');

    expect(canStartExecutionLlmCall('runtime_input_resolution')).toBe(false);
    expect(canStartExecutionLlmCall('runtime_llm')).toBe(true);
    expect(getAndClearExecutionUsage('exec-budget-calls')).toMatchObject({
      calls: 1,
      tokens: 100,
      stages: {
        runtime_input_resolution: { calls: 1, tokens: 100 },
      },
    });
  });

  it('blocks budgeted runtime AI after the configured token budget', () => {
    process.env.WORKFLOW_RUNTIME_AI_MAX_CALLS = '5';
    process.env.WORKFLOW_RUNTIME_AI_TOKEN_BUDGET = '50';

    startExecutionTracking('exec-budget-tokens');
    recordExecutionLlmUsage(51, 'runtime_autofill');

    expect(canStartExecutionLlmCall('runtime_autofill')).toBe(false);
    getAndClearExecutionUsage('exec-budget-tokens');
  });
});
