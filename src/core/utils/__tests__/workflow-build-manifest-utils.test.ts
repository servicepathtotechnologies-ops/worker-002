import {
  sealWorkflowBuildManifest,
  verifyBuildManifestIntegrity,
  stableStringify,
  workflowAuthorizedMultisetMatches,
} from '../workflow-build-manifest-utils';
import type { WorkflowBuildManifestV1 } from '../../types/workflow-build-manifest';
import { WORKFLOW_BUILD_MANIFEST_VERSION } from '../../types/workflow-build-manifest';

describe('workflow-build-manifest-utils', () => {
  it('stableStringify is deterministic for key order', () => {
    const a = stableStringify({ z: 1, a: 2 });
    const b = stableStringify({ a: 2, z: 1 });
    expect(a).toBe(b);
  });

  it('seal + verify round-trip', () => {
    const draft: Omit<WorkflowBuildManifestV1, 'integrity'> = {
      version: WORKFLOW_BUILD_MANIFEST_VERSION,
      correlationId: 'c1',
      createdAt: new Date().toISOString(),
      userPrompt: 'test',
      intent: {
        intent: 'do thing',
        triggerType: 'manual_trigger',
        actions: ['google_sheets'],
        dataFlows: [],
        constraints: [],
      },
      structuralBlueprint: 'bp',
      authorizedNodes: [
        { registryType: 'manual_trigger', nodeId: 'n1', role: 'trigger' },
        { registryType: 'log_output', nodeId: 'n2', role: 'terminal' },
      ],
      branchingSpec: { mode: 'linear' },
      graphSpec: { kind: 'deterministic_plan_chain', planChain: ['manual_trigger', 'log_output'] },
    };
    const sealed = sealWorkflowBuildManifest(draft);
    expect(verifyBuildManifestIntegrity(sealed)).toBe(true);
    const tampered = { ...sealed, userPrompt: 'tampered' };
    expect(verifyBuildManifestIntegrity(tampered)).toBe(false);
  });

  it('workflowAuthorizedMultisetMatches compares type multisets', () => {
    const manifest: WorkflowBuildManifestV1 = sealWorkflowBuildManifest({
      version: WORKFLOW_BUILD_MANIFEST_VERSION,
      correlationId: 'c',
      createdAt: 't',
      userPrompt: 'p',
      intent: {
        intent: 'i',
        triggerType: 'manual_trigger',
        actions: [],
        dataFlows: [],
        constraints: [],
      },
      structuralBlueprint: '',
      authorizedNodes: [
        { registryType: 'manual_trigger', nodeId: 'a', role: 'trigger' },
        { registryType: 'manual_trigger', nodeId: 'b', role: 'trigger' },
      ],
      branchingSpec: { mode: 'linear' },
      graphSpec: { kind: 'deterministic_plan_chain', planChain: ['manual_trigger', 'manual_trigger'] },
    });

    const ok = workflowAuthorizedMultisetMatches(
      {
        nodes: [
          { id: 'a', type: 'manual_trigger', data: { label: '', type: 'manual_trigger', category: 'trigger', config: {} } },
          { id: 'b', type: 'manual_trigger', data: { label: '', type: 'manual_trigger', category: 'trigger', config: {} } },
        ],
        edges: [],
      } as any,
      manifest,
    );
    expect(ok.ok).toBe(true);

    const bad = workflowAuthorizedMultisetMatches(
      {
        nodes: [
          { id: 'a', type: 'manual_trigger', data: { label: '', type: 'manual_trigger', category: 'trigger', config: {} } },
        ],
        edges: [],
      } as any,
      manifest,
    );
    expect(bad.ok).toBe(false);
  });
});
