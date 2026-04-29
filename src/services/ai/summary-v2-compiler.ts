import type {
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowSummaryV2,
  WorkflowSummaryBranchCase,
} from '../../core/types/ai-types';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

function nodeTypeOf(node: WorkflowNode): string {
  return String((node.data as any)?.type || node.type || '');
}

function nodeLabelOf(node: WorkflowNode): string {
  const registryLabel = unifiedNodeRegistry.get(nodeTypeOf(node))?.label;
  return registryLabel || String((node.data as any)?.label || nodeTypeOf(node) || node.id);
}

function edgeCaseKey(edge: WorkflowEdge): string {
  return String(edge.branchName || edge.sourceHandle || (edge.isDefault ? 'default' : `case_${edge.sourceIndex ?? 0}`));
}

export function compileSummaryV2FromWorkflow(workflow: Workflow, userPrompt: string): WorkflowSummaryV2 {
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  const incomingCount = new Map<string, number>();

  for (const node of nodes) incomingCount.set(node.id, 0);
  for (const edge of edges) {
    const out = outgoing.get(edge.source) || [];
    out.push(edge);
    outgoing.set(edge.source, out);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
  }

  const triggerNodeIds = nodes.filter((n) => (incomingCount.get(n.id) || 0) === 0).map((n) => n.id);
  const terminalNodeIds = nodes.filter((n) => (outgoing.get(n.id) || []).length === 0).map((n) => n.id);

  const executionBackbone = nodes.map((node, index) => ({
    order: index + 1,
    nodeId: node.id,
    nodeType: nodeTypeOf(node),
    label: nodeLabelOf(node),
    responsibility: unifiedNodeRegistry.get(nodeTypeOf(node))?.description || 'Processes workflow data',
  }));

  const branches = nodes
    .filter((n) => unifiedNodeRegistry.get(nodeTypeOf(n))?.isBranching === true || (outgoing.get(n.id) || []).length > 1)
    .map((branchNode) => {
      const branchEdges = outgoing.get(branchNode.id) || [];
      const cases: WorkflowSummaryBranchCase[] = branchEdges.map((edge) => {
        const target = nodeById.get(edge.target);
        return {
          caseKey: edgeCaseKey(edge),
          targetNodeId: edge.target,
          targetNodeType: target ? nodeTypeOf(target) : 'unknown',
          pathNodeIds: [branchNode.id, edge.target],
          terminalBehavior: target ? `Continues through ${nodeLabelOf(target)}` : 'Continues through unknown node',
        };
      });
      return {
        branchNodeId: branchNode.id,
        branchNodeType: nodeTypeOf(branchNode),
        cases,
      };
    });

  const pathOutcomes: WorkflowSummaryV2['pathOutcomes'] = [];
  const visited = new Set<string>();
  const stack: Array<{ path: string[]; current: string; condition: string }> = triggerNodeIds.map((id) => ({
    path: [id],
    current: id,
    condition: 'default',
  }));

  while (stack.length > 0) {
    const item = stack.pop()!;
    const nextEdges = outgoing.get(item.current) || [];
    if (nextEdges.length === 0) {
      pathOutcomes.push({
        pathId: `path_${pathOutcomes.length + 1}`,
        condition: item.condition,
        nodePath: item.path,
        terminalNodeId: item.current,
        outcome: `Terminates at ${nodeLabelOf(nodeById.get(item.current) || ({ id: item.current, type: 'unknown', data: { label: item.current, type: 'unknown', category: 'utility', config: {} } } as WorkflowNode))}`,
      });
      continue;
    }

    for (const edge of nextEdges) {
      const signature = `${item.current}->${edge.target}:${edgeCaseKey(edge)}:${item.path.join('>')}`;
      if (visited.has(signature)) continue;
      visited.add(signature);
      stack.push({
        path: [...item.path, edge.target],
        current: edge.target,
        condition: edgeCaseKey(edge),
      });
    }
  }

  return {
    graphOverview: {
      triggerNodeIds,
      terminalNodeIds,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      hasBranching: branches.length > 0,
    },
    executionBackbone,
    branches,
    nodes: nodes.map((node) => ({
      nodeId: node.id,
      nodeType: nodeTypeOf(node),
      label: nodeLabelOf(node),
      purpose: unifiedNodeRegistry.get(nodeTypeOf(node))?.description || 'Workflow step',
      inputEffect: 'Consumes upstream payload and local configuration',
      outputEffect: 'Produces output for downstream routing or terminal delivery',
    })),
    pathOutcomes,
    validationFindings: [
      {
        code: 'SUMMARY_V2_COMPILED',
        severity: 'warning',
        message: `Compiled summary from validated graph for prompt: ${userPrompt.slice(0, 80)}`,
      },
    ],
  };
}

