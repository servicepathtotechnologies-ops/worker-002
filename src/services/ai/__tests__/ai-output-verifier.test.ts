import { verifyAndRepairNodeOutput } from '../ai-output-verifier';

describe('ai-output-verifier', () => {
  it('keeps valid object output unchanged', async () => {
    const result = await verifyAndRepairNodeOutput({
      output: { ok: true },
      outputSchema: { default: { schema: { type: 'object' } } },
      maxAttempts: 2,
    });

    expect(result.finalValid).toBe(true);
    expect(result.repairedOutput).toEqual({ ok: true });
    expect(result.attempts.length).toBe(1);
  });

  it('repairs string output into object output', async () => {
    const result = await verifyAndRepairNodeOutput({
      output: 'hello',
      outputSchema: { default: { schema: { type: 'object' } } },
      maxAttempts: 2,
    });

    expect(result.finalValid).toBe(true);
    expect(result.repairedOutput).toEqual({ message: 'hello' });
    expect(result.attempts.some((attempt) => attempt.action === 'repair')).toBe(true);
  });

  it('repairs scalar output into array output', async () => {
    const result = await verifyAndRepairNodeOutput({
      output: 7,
      outputSchema: { default: { schema: { type: 'array' } } },
      maxAttempts: 2,
    });

    expect(result.finalValid).toBe(true);
    expect(result.repairedOutput).toEqual([7]);
  });
});
