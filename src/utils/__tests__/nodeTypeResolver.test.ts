import { resolveNodeType } from '../nodeTypeResolver';
import { WorkflowNode } from '../../core/types/ai-types';

describe('resolveNodeType (node-level canonical resolver)', () => {
  function makeNode(
    id: string,
    type: string,
    dataType?: string
  ): WorkflowNode {
    return {
      id,
      type,
      position: { x: 0, y: 0 },
      data: {
        label: dataType || type,
        type: dataType || type,
        category: '',
        config: {},
      },
    };
  }

  test('resolves manual_trigger as trigger category', () => {
    const node = makeNode('n1', 'manual_trigger');
    const resolved = resolveNodeType(node);

    expect(resolved.canonical).toBe('manual_trigger');
    expect(resolved.category).toBe('trigger');
  });

  test('resolves custom ollama node as transformer and LLM', () => {
    const node = makeNode('n2', 'custom', 'ollama');
    const resolved = resolveNodeType(node);

    expect(resolved.canonical).toBe('ollama');
    expect(resolved.category).toBe('transformer');
    expect(resolved.metadata.isLLM).toBe(true);
  });

  test('resolves custom google_gmail node as output', () => {
    const node = makeNode('n3', 'custom', 'google_gmail');
    const resolved = resolveNodeType(node);

    expect(resolved.canonical).toBe('google_gmail');
    expect(resolved.category).toBe('output');
  });
});

