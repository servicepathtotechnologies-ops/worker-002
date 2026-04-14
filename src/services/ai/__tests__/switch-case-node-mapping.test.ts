import { describe, expect, it } from '@jest/globals';
import {
  buildCaseNodeMappingFromPlanChain,
  computeSwitchContextForPlanChain,
} from '../switch-case-node-mapping';

function node(id: string, type: string) {
  return {
    id,
    type: 'custom',
    data: { type, label: type, config: {} },
    position: { x: 0, y: 0 },
  } as any;
}

describe('switch-case-node-mapping', () => {
  it('builds mapping for first switch by default', () => {
    const chain = ['manual_trigger', 'switch', 'google_gmail', 'slack_message'];
    const mapping = buildCaseNodeMappingFromPlanChain(chain, 'route by status: shipped, cancelled');
    expect(mapping).toBeDefined();
    expect(Object.keys(mapping || {}).length).toBeGreaterThanOrEqual(2);
  });

  it('builds mapping for selected switch index', () => {
    const chain = ['manual_trigger', 'switch', 'switch', 'google_gmail', 'slack_message'];
    const mapping = buildCaseNodeMappingFromPlanChain(
      chain,
      'route by status: shipped, cancelled. if shipped, route by priority: express, standard',
      ['n0', 'n1', 'n2', 'n3', 'n4'],
      2
    );
    expect(mapping).toBeDefined();
    expect(Object.keys(mapping || {}).length).toBeGreaterThanOrEqual(2);
  });

  it('uses nearest downstream nodes without wrapping to far tail nodes', () => {
    const chain = ['manual_trigger', 'switch', 'google_gmail', 'switch', 'slack_message', 'log_output'];
    const mapping = buildCaseNodeMappingFromPlanChain(
      chain,
      'route by status: shipped, cancelled',
      ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'],
      1
    ) as any;
    expect(mapping).toBeDefined();
    const targets = Object.values(mapping).map((m: any) => m.targetNodeId);
    // Outer switch must map only to the nearest downstream candidates.
    expect(targets).toEqual(expect.arrayContaining(['n2', 'n3']));
    expect(targets).not.toContain('n5');
  });

  it('returns multi-switch contexts when more than one switch exists', () => {
    const nodes = [
      node('n0', 'manual_trigger'),
      node('n1', 'switch'),
      node('n2', 'switch'),
      node('n3', 'google_gmail'),
      node('n4', 'slack_message'),
    ];
    const chain = ['manual_trigger', 'switch', 'switch', 'google_gmail', 'slack_message'];
    const context = computeSwitchContextForPlanChain(
      nodes,
      chain,
      'route by status: shipped, cancelled. if shipped, route by priority: express, standard'
    ) as any;

    expect(context).toBeDefined();
    expect(Array.isArray(context.switchContexts)).toBe(true);
    expect(context.switchContexts.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps backward-compatible first switch fields in returned context', () => {
    const nodes = [node('n0', 'manual_trigger'), node('n1', 'switch'), node('n2', 'google_gmail')];
    const chain = ['manual_trigger', 'switch', 'google_gmail'];
    const context = computeSwitchContextForPlanChain(nodes, chain, 'route by status: shipped, cancelled') as any;
    expect(context.switchNodeId).toBe('n1');
    expect(context.caseNodeMapping).toBeDefined();
  });

  it('returns undefined when no switch exists', () => {
    const nodes = [node('n0', 'manual_trigger'), node('n1', 'google_gmail')];
    const chain = ['manual_trigger', 'google_gmail'];
    const context = computeSwitchContextForPlanChain(nodes, chain, 'send email');
    expect(context).toBeUndefined();
  });
});

