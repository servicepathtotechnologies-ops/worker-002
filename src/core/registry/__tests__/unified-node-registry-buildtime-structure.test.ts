import { describe, expect, it } from '@jest/globals';
import { unifiedNodeRegistry } from '../unified-node-registry';

describe('unified node registry buildtime structure policy', () => {
  it('defaults form structure fields to buildtime_ai_once', () => {
    const inputSchema = unifiedNodeRegistry.getInputSchema('form');
    expect(inputSchema).toBeDefined();
    expect(inputSchema?.fields?.fillMode?.default).toBe('buildtime_ai_once');
    expect(inputSchema?.fields?.fillMode?.supportsRuntimeAI).toBe(false);
    expect(inputSchema?.fields?.fillMode?.supportsBuildtimeAI).toBe(true);
  });
});
