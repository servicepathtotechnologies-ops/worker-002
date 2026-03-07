/**
 * Error Branch Injector
 *
 * Adds a sidecar error handling branch:
 *   error_trigger → log_output
 *
 * Execution engine runs error_trigger nodes out-of-band when a node fails,
 * so this doesn't need edges to be reachable from the primary trigger.
 */

import { randomUUID } from 'crypto';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';
import { resolveCompatibleHandles } from './schema-driven-connection-resolver';

function getType(node: WorkflowNode): string {
  return unifiedNormalizeNodeType(node) || node.data?.type || node.type || '';
}

function createNode(nodeType: string, label: string, config: Record<string, unknown>): WorkflowNode {
  const schema = nodeLibrary.getSchema(nodeType);
  return {
    id: randomUUID(),
    type: nodeType,
    position: { x: 0, y: 0 },
    data: {
      type: nodeType,
      label: schema?.label || label,
      category: schema?.category || 'logic',
      config,
    },
  };
}

export interface ErrorBranchInjectionResult {
  workflow: Workflow;
  injected: boolean;
  warnings: string[];
}

export function injectErrorBranch(workflow: Workflow): ErrorBranchInjectionResult {
  const warnings: string[] = [];
  const nodes = [...(workflow.nodes || [])];
  const edges = [...(workflow.edges || [])];

  const hasErrorTrigger = nodes.some(n => getType(n) === 'error_trigger');
  const hasLog = nodes.some(n => getType(n) === 'log_output' && (n.data?.config as any)?._autoInjected);

  if (hasErrorTrigger && hasLog) {
    return { workflow, injected: false, warnings };
  }

  const errorTriggerNode = hasErrorTrigger
    ? nodes.find(n => getType(n) === 'error_trigger')!
    : createNode('error_trigger', 'Error Trigger', { _autoInjected: true });

  const logNode = hasLog
    ? nodes.find(n => getType(n) === 'log_output' && (n.data?.config as any)?._autoInjected)!
    : createNode('log_output', 'Log Error', {
      level: 'error',
      message: '[AUTO] Workflow error: {{error_message}} (node={{failed_node}})',
      _autoInjected: true,
    });

  if (!hasErrorTrigger) nodes.push(errorTriggerNode);
  if (!hasLog) nodes.push(logNode);

  // Connect error_trigger → log_output for UI visibility, even though engine executes error_trigger out-of-band.
  const alreadyConnected = edges.some(e => e.source === errorTriggerNode.id && e.target === logNode.id);
  if (!alreadyConnected) {
    const res = resolveCompatibleHandles(errorTriggerNode, logNode);
    edges.push({
      id: randomUUID(),
      source: errorTriggerNode.id,
      target: logNode.id,
      ...(res.success && res.sourceHandle ? { sourceHandle: res.sourceHandle } : {}),
      ...(res.success && res.targetHandle ? { targetHandle: res.targetHandle } : {}),
    });
  }

  return {
    workflow: { ...workflow, nodes, edges },
    injected: true,
    warnings,
  };
}

