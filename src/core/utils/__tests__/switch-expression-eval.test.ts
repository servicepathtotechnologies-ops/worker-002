import { describe, expect, it } from '@jest/globals';
import { createExecutionContext } from '../../execution/typed-execution-context';
import { evaluateSwitchRoutingExpression } from '../switch-expression-eval';

describe('evaluateSwitchRoutingExpression', () => {
  it('resolves {{$json.response}} when variables.$json is set', () => {
    const ctx = createExecutionContext({});
    ctx.variables.$json = { response: 'support' };
    ctx.variables.json = { response: 'support' };
    const v = evaluateSwitchRoutingExpression('{{$json.response}}', ctx);
    expect(v).toBe('support');
  });

  it('evaluates ternary on response when using JS inner expression', () => {
    const ctx = createExecutionContext({});
    ctx.variables.$json = { response: 'Hi?' };
    ctx.variables.json = ctx.variables.$json;
    const v = evaluateSwitchRoutingExpression(
      "{{$json.response.includes('?') ? 'question' : 'statement'}}",
      ctx
    );
    expect(v).toBe('question');
  });
});
