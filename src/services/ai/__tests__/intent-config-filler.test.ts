/**
 * Tests for schema-driven, sequential config filling (no node-type hardcoding).
 *
 * The filler should:
 * - Run sequentially (topological order).
 * - Understand upstream JSON *shape* (effective output schema).
 * - Use the node's registry input schema ("responsibility") to decide which fields to bind.
 * - Empty-until-runtime: do NOT write {{$json.key}} into input fields; attach _mappingMetadata
 *   and _expectedInputKeys so runtime fills from actual previous node output.
 */

import { IntelligentConfigFiller } from '../intelligent-config-filler';
import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import type { WorkflowNode } from '../../../core/types/ai-types';

const filler = new IntelligentConfigFiller();

function makeNode(id: string, type: string, config: Record<string, any> = {}): WorkflowNode {
  return {
    id,
    type,
    data: {
      type,
      label: type,
      category: unifiedNodeRegistry.getCategory(type) || 'transformation',
      config,
    },
    position: { x: 0, y: 0 },
  };
}

describe('Config filler – effective output schema', () => {
  it('form with fields returns effective output schema with properties', () => {
    const schema = unifiedNodeRegistry.getEffectiveOutputSchema('form', {
      fields: [
        { name: 'number', key: 'number', type: 'number', label: 'Number' },
      ],
    });
    expect(schema).toBeDefined();
    expect(schema?.type).toBe('object');
    expect(schema?.properties?.number?.type).toBe('number');
    expect(schema?.properties?.number).toBeDefined();
  });

  it('javascript returns dynamic object schema', () => {
    const schema = unifiedNodeRegistry.getEffectiveOutputSchema('javascript', {});
    expect(schema).toBeDefined();
    expect(schema?.type).toBe('object');
    expect(schema?.dynamic).toBe(true);
  });
});

describe('Config filler – binds required fields from upstream schema (universal)', () => {
  it('attaches mapping metadata from upstream keys only; no template values (real-time fill at runtime)', async () => {
    const workflow = {
      nodes: [
        makeNode('trigger-1', 'manual_trigger', {}),
        makeNode('form-1', 'form', {
          fields: [
            { name: 'recipient', key: 'recipient', type: 'text', label: 'Recipient' },
            { name: 'body', key: 'body', type: 'textarea', label: 'Body' },
          ],
        }),
        makeNode('out-1', 'google_gmail', {}),
      ],
      edges: [
        { source: 'trigger-1', target: 'form-1' },
        { source: 'form-1', target: 'out-1' },
      ],
    };

    const prompt = 'When user submits the form, send an email to the recipient with the body.';
    const result = await filler.fillConfigurationsFromPrompt(workflow, prompt, prompt);

    const form = result.nodes.find((n) => n.id === 'form-1');
    const out = result.nodes.find((n) => n.id === 'out-1');

    expect(Array.isArray(form?.data?.config?.fields)).toBe(true);
    const upstreamKeysFromForm = (form?.data?.config?.fields as Array<{ key: string }>).map((f) => f.key);

    const cfg = (out?.data?.config || {}) as any;
    const boundValues = Object.values(cfg).filter((v) => typeof v === 'string' && v.includes('{{$json.'));
    expect(boundValues.length).toBe(0);

    expect(cfg._mappingMetadata).toBeDefined();
    expect(typeof cfg._mappingMetadata).toBe('object');
    expect(Array.isArray(cfg._expectedInputKeys)).toBe(true);
    expect(cfg._expectedInputKeys.length).toBeGreaterThan(0);
    const selectedKeys = Object.values(cfg._mappingMetadata || {}).map((m: any) => m?.selectedUpstreamKey).filter(Boolean);
    selectedKeys.forEach((k: string) => {
      expect(upstreamKeysFromForm).toContain(k);
    });
  });
});
