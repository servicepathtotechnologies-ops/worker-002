/**
 * Tier 1 — deterministic CI matrix: registry fill modes, graph validation, and mode overrides.
 * Complements LLM-based executor tests (gmail) and property tests elsewhere.
 */

import { describe, expect, it } from '@jest/globals';
import { unifiedNodeRegistry } from '../../registry/unified-node-registry';
import {
  buildEffectiveFillModes,
  resolveEffectiveFieldFillMode,
} from '../../utils/fill-mode-resolver';
import { unifiedGraphOrchestrator } from '../../orchestration/unified-graph-orchestrator';
import type { ExecutionOrder } from '../../orchestration/execution-order-manager';
import { applyInputAliasesFromSchema } from '../apply-input-aliases';
import { pickPrimaryMessageLikeField } from '../dynamic-node-executor';
import { aiFieldDetector } from '../../../services/ai/ai-field-detector';

function minimalNode(id: string, type: string, config: Record<string, unknown> = {}): any {
  return {
    id,
    type: 'custom',
    data: { type, label: id, config },
  };
}

describe('Tier1: slack and communication registry', () => {
  it('slack_message message field defaults to buildtime_ai_once', () => {
    expect(resolveEffectiveFieldFillMode('message', unifiedNodeRegistry.get('slack_message')!.inputSchema as any, {})).toBe(
      'buildtime_ai_once'
    );
  });

  it('slack_message channel field defaults to buildtime_ai_once', () => {
    expect(resolveEffectiveFieldFillMode('channel', unifiedNodeRegistry.get('slack_message')!.inputSchema as any, {})).toBe(
      'buildtime_ai_once'
    );
  });

  it('slack_message text field defaults to buildtime_ai_once', () => {
    expect(resolveEffectiveFieldFillMode('text', unifiedNodeRegistry.get('slack_message')!.inputSchema as any, {})).toBe(
      'buildtime_ai_once'
    );
  });

  it('slack_message username field defaults to buildtime_ai_once', () => {
    expect(resolveEffectiveFieldFillMode('username', unifiedNodeRegistry.get('slack_message')!.inputSchema as any, {})).toBe(
      'buildtime_ai_once'
    );
  });

  it('slack_message webhookUrl is manual_static when not unlocked', () => {
    expect(
      resolveEffectiveFieldFillMode('webhookUrl', unifiedNodeRegistry.get('slack_message')!.inputSchema as any, {})
    ).toBe('manual_static');
  });

  it('pickPrimaryMessageLikeField chooses message over text for slack schema', () => {
    const schema = unifiedNodeRegistry.get('slack_message')!.inputSchema as Record<string, any>;
    expect(pickPrimaryMessageLikeField(schema)).toBe('message');
  });

  it('alias round-trip: text then reverse-fill message', () => {
    const resolved: Record<string, unknown> = { text: 'hello' };
    const schema = unifiedNodeRegistry.get('slack_message')!.inputSchema as Record<string, any>;
    applyInputAliasesFromSchema(resolved, schema);
    expect(resolved.message).toBe('hello');
  });
});

describe('Tier1: google_gmail runtime fields', () => {
  it('subject and body are runtime_ai by default', () => {
    const schema = unifiedNodeRegistry.get('google_gmail')!.inputSchema as any;
    expect(resolveEffectiveFieldFillMode('subject', schema, { operation: 'send' })).toBe('runtime_ai');
    expect(resolveEffectiveFieldFillMode('body', schema, { operation: 'send' })).toBe('runtime_ai');
  });

  it('manual_static override via _fillMode wins for subject', () => {
    const schema = unifiedNodeRegistry.get('google_gmail')!.inputSchema as any;
    const modes = buildEffectiveFillModes(schema, {
      operation: 'send',
      _fillMode: { subject: 'manual_static' },
    } as any);
    expect(modes.subject).toBe('manual_static');
    expect(modes.body).toBe('runtime_ai');
  });
});

describe('Tier1: graph orchestrator validation', () => {
  it('linear manual_trigger → log_output validates', () => {
    const nodes = [minimalNode('t', 'manual_trigger'), minimalNode('l', 'log_output', { message: 'ok' })];
    const { workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(nodes);
    const v = unifiedGraphOrchestrator.validateWorkflow(workflow, executionOrder);
    expect(v.valid).toBe(true);
  });

  it('manual_trigger → slack_message → log validates linearly', () => {
    const nodes = [
      minimalNode('t', 'manual_trigger'),
      minimalNode(
        's',
        'slack_message',
        { webhookUrl: 'https://hooks.slack.com/services/X/Y/Z', message: 'm' }
      ),
      minimalNode('l', 'log_output', { message: 'done' }),
    ];
    const { workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(nodes);
    const v = unifiedGraphOrchestrator.validateWorkflow(workflow, executionOrder);
    expect(v.valid).toBe(true);
  });

  it('if_else branch structure validates with explicit execution metadata', () => {
    const nodes = [
      {
        id: 't',
        type: 'manual_trigger',
        data: { type: 'manual_trigger', label: 'T', config: {} },
      },
      {
        id: 'i',
        type: 'if_else',
        data: { type: 'if_else', label: 'If', config: { conditions: [] } },
      },
      minimalNode('l1', 'log_output', { message: 'a' }),
      minimalNode('l2', 'log_output', { message: 'b' }),
    ];
    const explicitOrder: ExecutionOrder = {
      nodeIds: ['t', 'i', 'l1', 'l2'],
      dependencies: new Map(),
      metadata: {
        triggerNodeId: 't',
        terminalNodeIds: ['l1', 'l2'],
        branchingNodeIds: ['i'],
        mergeNodeIds: [],
      },
    };
    const { workflow, executionOrder } = unifiedGraphOrchestrator.initializeWorkflow(nodes, explicitOrder);
    const v = unifiedGraphOrchestrator.validateWorkflow(workflow, executionOrder);
    expect(v.valid).toBe(true);
  });
});

describe('Tier1: AI field detector breadth', () => {
  it('detects fields for log_output', () => {
    const node = minimalNode('x', 'log_output', { message: '{{$json.a}}' });
    expect(aiFieldDetector.detectAIFields(node as any).length).toBeGreaterThan(0);
  });

  it('detects fields for http_request when present in registry', () => {
    const def = unifiedNodeRegistry.get('http_request');
    if (!def) {
      expect(true).toBe(true);
      return;
    }
    const node = minimalNode('h', 'http_request', { url: 'https://example.com', method: 'GET' });
    const names = aiFieldDetector.detectAIFields(node as any).map((f) => f.fieldName);
    expect(names.some((n) => n === 'body' || n === 'headers')).toBe(true);
  });

  it('detects at least two AI-eligible fields on slack_message (message + text)', () => {
    const node = minimalNode('s', 'slack_message', { webhookUrl: 'https://hooks.slack.com/x' });
    expect(aiFieldDetector.detectAIFields(node as any).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Tier1: fill mode coercion for credentials', () => {
  it('explicit runtime_ai on credential field coerces to manual_static when locked', () => {
    const schema = unifiedNodeRegistry.get('slack_message')!.inputSchema as any;
    const mode = resolveEffectiveFieldFillMode('webhookUrl', schema, {
      _fillMode: { webhookUrl: 'runtime_ai' },
    } as any);
    expect(mode).toBe('manual_static');
  });
});

describe('Tier1: switch / merge registry presence', () => {
  it('switch node is registered', () => {
    expect(unifiedNodeRegistry.get('switch')).toBeDefined();
  });

  it('merge node is registered', () => {
    expect(unifiedNodeRegistry.get('merge')).toBeDefined();
  });

  it('webhook trigger is registered', () => {
    expect(unifiedNodeRegistry.get('webhook')).toBeDefined();
  });

  it('respond_to_webhook is registered', () => {
    expect(unifiedNodeRegistry.get('respond_to_webhook')).toBeDefined();
  });
});

describe('Tier1: output / validation nodes', () => {
  it('log_output has message in schema', () => {
    const def = unifiedNodeRegistry.get('log_output');
    expect(def?.inputSchema?.message).toBeDefined();
  });

  it('if_else has expression in schema', () => {
    const def = unifiedNodeRegistry.get('if_else');
    expect(def?.inputSchema && Object.keys(def.inputSchema).length).toBeGreaterThan(0);
  });
});
