/**
 * Plan-driven builder: graph node types must match proposedNodeChain (resolved), DAG valid.
 */

import { describe, expect, it } from '@jest/globals';
import {
  buildWorkflowFromPlanChain,
  resolvePlanNodeType,
} from '../plan-driven-workflow-builder';
import { unifiedGraphOrchestrator } from '../../../core/orchestration';

describe('plan-driven-workflow-builder', () => {
  it('accepts canonical registry types and rejects aliases', () => {
    expect(resolvePlanNodeType('form').normalized).toBe('form');
    expect(resolvePlanNodeType('if_else').normalized).toBe('if_else');
    expect(resolvePlanNodeType('gmail').error).toContain('Non-canonical node type');
    expect(resolvePlanNodeType('form_trigger').error).toContain('Non-canonical node type');
  });

  it('builds a linear DAG whose node types match the resolved chain (Sheets → Summarizer → Gmail → log)', () => {
    const chain = [
      'manual_trigger',
      'google_sheets',
      'text_summarizer',
      'google_gmail',
      'log_output',
    ];
    const result = buildWorkflowFromPlanChain(chain);
    expect(result.success).toBe(true);
    expect(result.workflow).toBeDefined();
    expect(result.resolvedChain).toEqual(chain);

    const types = result.workflow!.nodes.map((n) => n.type);
    expect(types).toEqual(chain);

    const v = unifiedGraphOrchestrator.validateWorkflow(result.workflow!);
    expect(v.valid).toBe(true);
  });

  it('fails with a clear error for unknown node types', () => {
    const result = buildWorkflowFromPlanChain(['manual_trigger', 'not_a_real_node_type_xyz']);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('not_a_real_node_type') || e.includes('Unknown'))).toBe(true);
    expect(result.diagnostics.unknownTypes.length).toBeGreaterThan(0);
  });

  it('rejects alias names in strict canonical mode', () => {
    const result = buildWorkflowFromPlanChain(['form', 'if_else', 'gmail', 'log_output']);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('Non-canonical node type'))).toBe(true);
  });

  it('builds canonicalized branch flow for real scenario form->if_else->email/slack->log', () => {
    const chain = ['form', 'if_else', 'google_gmail', 'slack_message', 'log_output'];
    const result = buildWorkflowFromPlanChain(chain);
    expect(result.resolvedChain).toEqual(['form', 'if_else', 'google_gmail', 'slack_message', 'log_output']);
    expect(result.diagnostics.canonicalization.every((c) => c.status === 'accepted')).toBe(true);
    expect(result.diagnostics.branchCoverage.branchingNodes).toBeGreaterThanOrEqual(1);
  });

  it('marks missing required inputs as runtime_ai in plan stage', () => {
    const chain = ['form', 'set_variable', 'if_else', 'google_gmail', 'slack_message', 'log_output'];
    const result = buildWorkflowFromPlanChain(chain);
    expect(result.success).toBe(true);
    const byType = new Map(result.workflow!.nodes.map((n) => [n.data.type, n]));
    const formNode: any = byType.get('form');
    const setVarNode: any = byType.get('set_variable');
    const ifNode: any = byType.get('if_else');
    expect(formNode?.data?.config?._fillMode?.fields).toBe('buildtime_ai_once');
    expect(setVarNode?.data?.config?._fillMode?.name).toBe('runtime_ai');
    expect(ifNode?.data?.config?._fillMode?.conditions).toBe('buildtime_ai_once');
  });
});
