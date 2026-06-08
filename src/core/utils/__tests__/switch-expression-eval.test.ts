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

  it('evaluates comparison expressions for routing', () => {
    const ctx = createExecutionContext({});
    ctx.variables.$json = { score: 82 };
    ctx.variables.json = ctx.variables.$json;

    const v = evaluateSwitchRoutingExpression('{{$json.score >= 80}}', ctx);

    expect(v).toBe(true);
  });

  it('evaluates logical expressions for routing', () => {
    const ctx = createExecutionContext({});
    ctx.variables.$json = { paid: true, total: 125 };
    ctx.variables.json = ctx.variables.$json;

    const v = evaluateSwitchRoutingExpression('{{$json.paid && $json.total > 0}}', ctx);

    expect(v).toBe(true);
  });

  it('supports bracket property access in JS expressions', () => {
    const ctx = createExecutionContext({});
    ctx.variables.$json = { 'case-status': 'open' };
    ctx.variables.json = ctx.variables.$json;

    const v = evaluateSwitchRoutingExpression("{{$json['case-status'] === 'open'}}", ctx);

    expect(v).toBe(true);
  });

  it('resolves $input.item.json as a plain routing expression', () => {
    const ctx = createExecutionContext({});
    ctx.variables.$json = { status: 'paid' };
    ctx.variables.json = ctx.variables.$json;

    const v = evaluateSwitchRoutingExpression('{{$input.item.json.status}}', ctx);

    expect(v).toBe('paid');
  });

  it('evaluates $input.first().json in JS expressions', () => {
    const ctx = createExecutionContext({});
    ctx.variables.$json = { total: 250 };
    ctx.variables.json = ctx.variables.$json;

    const v = evaluateSwitchRoutingExpression(
      "{{$input.first().json.total >= 200 ? 'large' : 'small'}}",
      ctx
    );

    expect(v).toBe('large');
  });

  it('evaluates $input.all()[0].json in JS expressions', () => {
    const ctx = createExecutionContext({});
    ctx.variables.$json = { priority: 'high' };
    ctx.variables.json = ctx.variables.$json;

    const v = evaluateSwitchRoutingExpression(
      "{{$input.all()[0].json.priority === 'high'}}",
      ctx
    );

    expect(v).toBe(true);
  });

  it('returns null for invalid JS expressions', () => {
    const ctx = createExecutionContext({});
    ctx.variables.$json = { score: 82 };
    ctx.variables.json = ctx.variables.$json;

    const v = evaluateSwitchRoutingExpression('{{$json.score >}}', ctx);

    expect(v).toBeNull();
  });
});
