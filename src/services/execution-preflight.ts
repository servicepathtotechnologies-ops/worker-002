import { resolveCredentialDryRun, formatCredentialError } from './credential-resolver';
import { credentialRequirementForNode } from './credential-scope-registry';

export interface PreflightNode {
  id?: string;
  type?: string;
  data?: {
    type?: string;
    label?: string;
    name?: string;
  };
}

export interface ExecutionPreflightFailure {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  provider: string;
  requiredScopes: string[];
  error: unknown;
}

export interface ExecutionPreflightResult {
  ok: boolean;
  failures: ExecutionPreflightFailure[];
}

export async function executionPreflight(input: {
  workflowId: string;
  ownerId: string;
  nodes: PreflightNode[];
}): Promise<ExecutionPreflightResult> {
  const failures: ExecutionPreflightFailure[] = [];

  for (const node of input.nodes) {
    const nodeType = node.data?.type || node.type || '';
    const requirement = credentialRequirementForNode(nodeType);
    if (!requirement) continue;

    try {
      await resolveCredentialDryRun({
        userId: input.ownerId,
        provider: requirement.provider,
        requiredScopes: requirement.requiredScopes,
        action: node.data?.label || node.data?.name || nodeType,
      });
    } catch (error) {
      failures.push({
        nodeId: node.id || nodeType,
        nodeName: node.data?.label || node.data?.name || nodeType,
        nodeType,
        provider: requirement.provider,
        requiredScopes: requirement.requiredScopes,
        error: formatCredentialError(error, node.data?.label || nodeType),
      });
    }
  }

  return { ok: failures.length === 0, failures };
}

