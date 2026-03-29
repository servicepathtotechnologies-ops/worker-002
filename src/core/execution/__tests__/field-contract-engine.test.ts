import { applyDeterministicFieldContracts } from '../field-contract-engine';

describe('field-contract-engine', () => {
  it('repairs invalid google_sheets range into deterministic A1 fallback', () => {
    const result = applyDeterministicFieldContracts(
      {
        operation: 'read',
        sheetName: 'Dummy',
        range: 'Planned workflow for: get data from google sheets',
      },
      {
        nodeType: 'google_sheets',
        userIntent: 'get data from google sheets and summarize',
        upstreamPayload: {},
        config: {},
        inputSchema: {},
      }
    );

    expect(result.resolvedInputs.range).toBe('A1:Z1000');
    expect(result.repairs.length).toBeGreaterThan(0);
  });

  it('uses upstream valid A1 range when repairing google_sheets range', () => {
    const result = applyDeterministicFieldContracts(
      {
        operation: 'read',
        range: 'summarize this sheet',
      },
      {
        nodeType: 'google_sheets',
        userIntent: 'summarize rows',
        upstreamPayload: { range: 'A2:D500' },
        config: {},
        inputSchema: {},
      }
    );

    expect(result.resolvedInputs.range).toBe('A2:D500');
  });

  it('backfills ai_chat_model prompt when absent', () => {
    const result = applyDeterministicFieldContracts(
      {},
      {
        nodeType: 'ai_chat_model',
        userIntent: 'summarize the sales rows',
        upstreamPayload: { text: 'Row 1, Row 2, Row 3' },
        config: {},
        inputSchema: {},
      }
    );

    expect(result.resolvedInputs.prompt).toBe('Row 1, Row 2, Row 3');
  });

  it('repairs linkedin text from upstream narrative when value looks like JSON garbage', () => {
    const result = applyDeterministicFieldContracts(
      { text: '{"k":1}' },
      {
        nodeType: 'linkedin',
        userIntent: 'post cricket update',
        upstreamPayload: { response_text: 'AI generated post body for LinkedIn' },
        config: {},
        inputSchema: {
          text: { type: 'string', role: 'content' },
        } as any,
      }
    );

    expect(result.resolvedInputs.text).toBe('AI generated post body for LinkedIn');
    expect(result.repairs.some((r) => r.includes('linkedin.text'))).toBe(true);
  });
});

