import {
  addNode,
  addEdge,
  addEdges,
  updateNode,
  removeNode,
  removeEdge,
  addDataSource,
  addTransformation,
  addOutput,
  updateDSLNode,
} from '../immutable-helpers';
import type { Workflow, WorkflowNode, WorkflowEdge } from '../../types/ai-types';
import type { WorkflowDSL, DSLDataSource, DSLTransformation, DSLOutput } from '../../../services/ai/workflow-dsl';

function makeNode(id: string, type = 'manual_trigger'): WorkflowNode {
  return { id, type, data: { label: id, type, category: 'trigger', config: {} } };
}

function makeEdge(id: string, source: string, target: string): WorkflowEdge {
  return { id, source, target };
}

function makeWorkflow(nodes: WorkflowNode[] = [], edges: WorkflowEdge[] = []): Workflow {
  return { nodes, edges };
}

function makeDSL(
  dataSources: DSLDataSource[] = [],
  transformations: DSLTransformation[] = [],
  outputs: DSLOutput[] = [],
): WorkflowDSL {
  return {
    trigger: { type: 'manual_trigger' },
    dataSources,
    transformations,
    outputs,
    executionOrder: [],
  };
}

describe('immutable-helpers — Workflow mutations', () => {
  test('addNode appends node without mutating original', () => {
    const original = makeWorkflow([makeNode('n1')]);
    const newNode = makeNode('n2');
    const result = addNode(original, newNode);

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[1]).toBe(newNode);
    expect(original.nodes).toHaveLength(1); // not mutated
  });

  test('addEdge appends edge without mutating original', () => {
    const original = makeWorkflow([], [makeEdge('e1', 'n1', 'n2')]);
    const newEdge = makeEdge('e2', 'n2', 'n3');
    const result = addEdge(original, newEdge);

    expect(result.edges).toHaveLength(2);
    expect(result.edges[1]).toBe(newEdge);
    expect(original.edges).toHaveLength(1);
  });

  test('addEdges appends multiple edges at once', () => {
    const original = makeWorkflow();
    const edges = [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3')];
    const result = addEdges(original, edges);

    expect(result.edges).toHaveLength(2);
    expect(original.edges).toHaveLength(0);
  });

  test('updateNode applies partial updates to matching node', () => {
    const n1 = makeNode('n1', 'manual_trigger');
    const original = makeWorkflow([n1, makeNode('n2', 'gmail')]);
    const result = updateNode(original, 'n1', { type: 'webhook' });

    expect(result.nodes[0].type).toBe('webhook');
    expect(result.nodes[0].id).toBe('n1'); // id preserved
    expect(result.nodes[1].type).toBe('gmail'); // sibling untouched
  });

  test('updateNode leaves non-matching nodes unchanged', () => {
    const n1 = makeNode('n1');
    const n2 = makeNode('n2');
    const original = makeWorkflow([n1, n2]);
    const result = updateNode(original, 'n99', { type: 'changed' });

    expect(result.nodes[0]).toEqual(n1);
    expect(result.nodes[1]).toEqual(n2);
  });

  test('removeNode filters out node and all its connected edges', () => {
    const nodes = [makeNode('n1'), makeNode('n2'), makeNode('n3')];
    const edges = [
      makeEdge('e1', 'n1', 'n2'),
      makeEdge('e2', 'n2', 'n3'),
      makeEdge('e3', 'n1', 'n3'),
    ];
    const original = makeWorkflow(nodes, edges);
    const result = removeNode(original, 'n2');

    expect(result.nodes.map(n => n.id)).toEqual(['n1', 'n3']);
    // e1 (source=n2) and e2 (target=n2) both removed; e3 (n1→n3) survives
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].id).toBe('e3');
  });

  test('removeNode on non-existent id leaves workflow unchanged', () => {
    const nodes = [makeNode('n1')];
    const edges = [makeEdge('e1', 'n1', 'n1')];
    const original = makeWorkflow(nodes, edges);
    const result = removeNode(original, 'n99');

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(1);
  });

  test('removeEdge filters out edge by id and leaves nodes untouched', () => {
    const nodes = [makeNode('n1'), makeNode('n2')];
    const edges = [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n1')];
    const original = makeWorkflow(nodes, edges);
    const result = removeEdge(original, 'e1');

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].id).toBe('e2');
    expect(result.nodes).toHaveLength(2);
  });
});

describe('immutable-helpers — DSL mutations', () => {
  test('addDataSource appends to dataSources without mutating original', () => {
    const ds: DSLDataSource = { id: 'ds1', type: 'google_sheets', operation: 'read' };
    const original = makeDSL();
    const result = addDataSource(original, ds);

    expect(result.dataSources).toHaveLength(1);
    expect(result.dataSources[0]).toBe(ds);
    expect(original.dataSources).toHaveLength(0);
  });

  test('addTransformation appends to transformations', () => {
    const tf: DSLTransformation = { id: 'tf1', type: 'ai_agent', operation: 'summarize' };
    const original = makeDSL();
    const result = addTransformation(original, tf);

    expect(result.transformations).toHaveLength(1);
    expect(result.transformations[0]).toBe(tf);
  });

  test('addOutput appends to outputs', () => {
    const out: DSLOutput = { id: 'out1', type: 'gmail', operation: 'send' };
    const original = makeDSL();
    const result = addOutput(original, out);

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]).toBe(out);
  });

  test('updateDSLNode updates matching dataSource and ignores other categories', () => {
    const ds1: DSLDataSource = { id: 'ds1', type: 'google_sheets', operation: 'read' };
    const ds2: DSLDataSource = { id: 'ds2', type: 'airtable', operation: 'fetch' };
    const tf1: DSLTransformation = { id: 'ds1', type: 'ai_agent', operation: 'summarize' }; // same id, different category
    const original = makeDSL([ds1, ds2], [tf1]);

    const result = updateDSLNode(original, 'dataSource', 'ds1', { type: 'notion' });

    expect(result.dataSources[0].type).toBe('notion');
    expect(result.dataSources[1].type).toBe('airtable'); // sibling unchanged
    expect(result.transformations[0].type).toBe('ai_agent'); // different category untouched
  });
});
