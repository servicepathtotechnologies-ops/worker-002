import { describe, expect, it } from '@jest/globals';
import type { Workflow } from '../../core/types/ai-types';
import { WorkflowLifecycleManager } from '../workflow-lifecycle-manager';

describe('WorkflowLifecycleManager deduplicateNodesByCanonicalType', () => {
  it('keeps duplicate canonical gmail nodes when they belong to different branch ports', () => {
    const manager = new WorkflowLifecycleManager() as any;
    const workflow: Workflow = {
      nodes: [
        { id: 'trigger_1', type: 'manual_trigger', data: { type: 'manual_trigger', config: {} } } as any,
        { id: 'if_1', type: 'if_else', data: { type: 'if_else', config: { conditions: [] } } } as any,
        { id: 'gmail_true', type: 'google_gmail', data: { type: 'google_gmail', config: {} } } as any,
        { id: 'gmail_false', type: 'gmail', data: { type: 'gmail', config: {} } } as any,
      ],
      edges: [
        { id: 'e1', source: 'trigger_1', target: 'if_1', type: 'main' } as any,
        { id: 'e2', source: 'if_1', target: 'gmail_true', type: 'true' } as any,
        { id: 'e3', source: 'if_1', target: 'gmail_false', type: 'false' } as any,
      ],
    };

    const deduped = manager.deduplicateNodesByCanonicalType(workflow);
    const gmailNodes = deduped.nodes.filter((n: any) => ['google_gmail', 'gmail'].includes(String(n.data?.type || n.type)));
    expect(gmailNodes.length).toBe(2);
  });
});
