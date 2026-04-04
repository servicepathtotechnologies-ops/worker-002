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

  it('plan-driven switch: three cases wire to branch actions and each log_output has one incoming edge', () => {
    const chain = [
      'form',
      'switch',
      'slack_message',
      'log_output',
      'google_gmail',
      'log_output',
      'google_gmail',
      'log_output',
    ];
    const rawPrompt =
      'If priority is high, send via Slack. If priority is medium, send via Gmail. If priority is low, send via Gmail.';
    const result = buildWorkflowFromPlanChain(chain, rawPrompt);
    expect(result.success).toBe(true);
    expect(result.workflow).toBeDefined();

    const v = unifiedGraphOrchestrator.validateWorkflow(result.workflow!);
    expect(v.valid).toBe(true);
    expect(v.errors ?? []).toEqual([]);

    const logs = result.workflow!.nodes.filter((n) => n.type === 'log_output');
    expect(logs.length).toBe(3);
    for (const log of logs) {
      const incoming = result.workflow!.edges.filter((e: any) => e.target === log.id);
      expect(incoming.length).toBe(1);
    }

    const sw = result.workflow!.nodes.find((n) => n.type === 'switch');
    expect(sw).toBeDefined();
    const caseOut = result.workflow!.edges.filter(
      (e: any) => e.source === sw!.id && String(e.type || '').startsWith('case_')
    );
    expect(caseOut.length).toBe(3);

    const slack = result.workflow!.nodes.find((n) => n.type === 'slack_message');
    const gmails = result.workflow!.nodes.filter((n) => n.type === 'google_gmail');
    expect(gmails.length).toBe(2);
    const highEdge = caseOut.find((e: any) => e.type === 'case_1');
    expect(highEdge?.target).toBe(slack?.id);
    const medEdge = caseOut.find((e: any) => e.type === 'case_2');
    const lowEdge = caseOut.find((e: any) => e.type === 'case_3');
    expect(medEdge?.target).toBe(gmails[0].id);
    expect(lowEdge?.target).toBe(gmails[1].id);
  });

  it('plan-driven switch: duplicate google_gmail with explicit #ids yields two distinct node ids', () => {
    const chain = [
      'form',
      'switch',
      'google_gmail#high_path',
      'log_output',
      'google_gmail#low_path',
      'log_output',
    ];
    const rawPrompt = 'Route ticket by priority: high, low.';
    const result = buildWorkflowFromPlanChain(chain, rawPrompt);
    expect(result.success).toBe(true);
    const gmails = result.workflow!.nodes.filter((n) => n.type === 'google_gmail');
    expect(gmails.length).toBe(2);
    expect(new Set(gmails.map((g) => g.id)).size).toBe(2);
    const v = unifiedGraphOrchestrator.validateWorkflow(result.workflow!);
    expect(v.valid).toBe(true);
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
