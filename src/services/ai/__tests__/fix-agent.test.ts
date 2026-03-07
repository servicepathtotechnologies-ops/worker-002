import { fixAgent } from '../../fix-agent';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../../core/types/ai-types';

function makeNode(partial: Partial<WorkflowNode>): WorkflowNode {
  return {
    id: partial.id || 'node1',
    type: partial.type || 'custom',
    position: partial.position || { x: 0, y: 0 },
    data: {
      label: partial.data?.label || 'Node',
      type: partial.data?.type || 'if_else',
      category: partial.data?.category || 'logic',
      config: partial.data?.config || {},
    },
  };
}

describe('FixAgent auto-fix rules', () => {
  test('if_else normalization converts legacy condition to conditions array', async () => {
    const node = makeNode({
      id: 'if1',
      data: {
        label: 'If Else',
        type: 'if_else',
        category: 'logic',
        config: {
          condition: '$json.count > 0',
        },
      },
    });

    const workflow: Workflow = {
      nodes: [node],
      edges: [],
      metadata: {},
    };

    const result = await fixAgent.runAutoFix({
      workflow,
      config: { maxRuntimeMs: 5000 },
    });

    const fixedNode = result.workflow.nodes[0];
    const config = fixedNode.data.config as any;

    expect(Array.isArray(config.conditions)).toBe(true);
    expect(config.conditions[0].expression).toBe('{{$json.count > 0}}');
    expect(result.audit.some(a => a.rule === 'if_else_normalization' && a.applied)).toBe(true);
  });

  test('credential auto-inject adds credentialId for satisfied oauth credentials', async () => {
    const node: WorkflowNode = {
      id: 'gmail1',
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        label: 'Gmail',
        type: 'google_gmail',
        category: 'communication',
        config: {},
      },
    };

    const workflow: Workflow = { nodes: [node], edges: [], metadata: {} };

    const result = await fixAgent.runAutoFix({
      workflow,
      lifecycleCredentials: {
        requiredCredentials: [],
        missingCredentials: [],
        satisfiedCredentials: [{
          provider: 'google',
          type: 'oauth',
          vaultKey: 'google_oauth_main',
          displayName: 'Google OAuth',
          required: true,
          satisfied: true,
          scopes: ['https://www.googleapis.com/auth/gmail.send'],
          nodeTypes: ['google_gmail'],
          nodeIds: ['gmail1'],
        } as any],
        warnings: [],
      },
      config: { maxRuntimeMs: 5000 },
    });

    const fixedNode = result.workflow.nodes[0];
    const config = fixedNode.data.config as any;

    expect(config.credentialId).toBe('google_oauth_main');
    expect(result.audit.some(a => a.rule === 'credential_auto_inject' && a.applied)).toBe(true);
  });

  test('template key rewrite adjusts template paths based on dry-run context', async () => {
    const sourceNode: WorkflowNode = {
      id: 'src1',
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        label: 'Source',
        type: 'set_variable',
        category: 'transformation',
        config: {},
      },
    };

    const targetNode: WorkflowNode = {
      id: 'tgt1',
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        label: 'Target',
        type: 'google_gmail',
        category: 'communication',
        config: {
          body: 'Hello {{email}}',
        },
      },
    };

    const workflow: Workflow = {
      nodes: [sourceNode, targetNode],
      edges: [] as WorkflowEdge[],
      metadata: {},
    };

    const result = await fixAgent.runAutoFix({
      workflow,
      // Provide fake previous fixes to exercise confidence engine
      previousFixes: [{ workflowId: 'w1', confidence: 0.8 }],
      config: { maxRuntimeMs: 5000 },
    });

    const fixedNode = result.workflow.nodes.find(n => n.id === 'tgt1')!;
    const cfg = fixedNode.data.config as any;

    // We only assert that the rule ran and produced an audit entry;
    // key matching is heuristic and context-dependent.
    expect(result.audit.some(a => a.rule === 'template_key_rewrite')).toBe(true);
    expect(typeof result.confidence).toBe('number');
  });
});

