import { describe, expect, it } from '@jest/globals';
import { fillMissingTitleLikeRuntimeAiFields } from '../runtime-ai-title-backfill';
import type { NodeInputField } from '../../types/unified-node-contract';

describe('runtime-ai-title-backfill', () => {
  const baseSchema: Record<string, NodeInputField> = {
    subject: {
      type: 'string',
      required: false,
      description: 'Subject',
      role: 'title_like',
      fillMode: { default: 'runtime_ai' },
    } as NodeInputField,
    body: {
      type: 'string',
      required: false,
      description: 'Body',
      role: 'long_body',
      fillMode: { default: 'runtime_ai' },
    } as NodeInputField,
  };

  it('fills subject from workflow intent when upstream has no title', () => {
    const resolved: Record<string, any> = { body: 'Long email\nSecond line' };
    const filled = fillMissingTitleLikeRuntimeAiFields({
      resolvedInputs: resolved,
      upstreamPayload: { model: 'x', response: 'ignored for subject when intent set' },
      inputSchema: baseSchema,
      effectiveFillModes: { subject: 'runtime_ai', body: 'runtime_ai' },
      workflowIntent: 'Weekly sales digest from Sheets',
    });
    expect(filled).toContain('subject');
    expect(resolved.subject).toBe('Weekly sales digest from Sheets');
  });

  it('fills subject from upstream response first line when intent empty', () => {
    const resolved: Record<string, any> = { body: 'Body text' };
    fillMissingTitleLikeRuntimeAiFields({
      resolvedInputs: resolved,
      upstreamPayload: { response: 'First line of AI output\nMore text' },
      inputSchema: baseSchema,
      effectiveFillModes: { subject: 'runtime_ai', body: 'runtime_ai' },
      workflowIntent: '',
    });
    expect(resolved.subject).toBe('First line of AI output');
  });

  it('fills subject from body first line when no intent and no response', () => {
    const resolved: Record<string, any> = { body: 'Hello world\nRest' };
    fillMissingTitleLikeRuntimeAiFields({
      resolvedInputs: resolved,
      upstreamPayload: {},
      inputSchema: baseSchema,
      effectiveFillModes: { subject: 'runtime_ai', body: 'runtime_ai' },
      workflowIntent: '   ',
    });
    expect(resolved.subject).toBe('Hello world');
  });
});
