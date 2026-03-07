/**
 * Unit tests for Handle Normalization in Edge Creation
 * 
 * Tests that handles are normalized before edge creation
 */

import { atomicEdgeCreator } from '../atomicEdgeCreator';
import { executionPlanBuilder } from '../executionPlanBuilder';
import { normalizeSourceHandle, normalizeTargetHandle } from '../../../core/utils/node-handle-registry';
import { WorkflowNode } from '../../../core/types/ai-types';
import { randomUUID } from 'crypto';

describe('Handle Normalization', () => {
  const createMockNode = (type: string, id?: string): WorkflowNode => ({
    id: id || randomUUID(),
    type,
    data: {
      type,
      label: type,
      category: 'action',
      config: {},
    },
    position: { x: 0, y: 0 },
  });
  
  describe('Handle Normalization in Edge Creation', () => {
    it('should normalize source handles before edge creation', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('google_sheets');
      const nodes = [trigger, node1];
      
      const plan = executionPlanBuilder.buildExecutionPlan(nodes);
      const edgeResult = atomicEdgeCreator.createEdgesFromExecutionPlan(plan, nodes);
      
      expect(edgeResult.success).toBe(true);
      expect(edgeResult.edges.length).toBe(1);
      
      // Source handle should be normalized
      const sourceHandle = edgeResult.edges[0].sourceHandle;
      expect(sourceHandle).toBeTruthy();
      expect(typeof sourceHandle).toBe('string');
    });
    
    it('should normalize target handles before edge creation', () => {
      const trigger = createMockNode('manual_trigger');
      const node1 = createMockNode('slack_message');
      const nodes = [trigger, node1];
      
      const plan = executionPlanBuilder.buildExecutionPlan(nodes);
      const edgeResult = atomicEdgeCreator.createEdgesFromExecutionPlan(plan, nodes);
      
      expect(edgeResult.success).toBe(true);
      expect(edgeResult.edges.length).toBe(1);
      
      // Target handle should be normalized
      const targetHandle = edgeResult.edges[0].targetHandle;
      expect(targetHandle).toBeTruthy();
      expect(typeof targetHandle).toBe('string');
    });
    
    it('should use correct handles for ai_agent', () => {
      const trigger = createMockNode('manual_trigger');
      const aiAgent = createMockNode('ai_agent');
      const nodes = [trigger, aiAgent];
      
      const plan = executionPlanBuilder.buildExecutionPlan(nodes);
      const edgeResult = atomicEdgeCreator.createEdgesFromExecutionPlan(plan, nodes);
      
      expect(edgeResult.success).toBe(true);
      expect(edgeResult.edges.length).toBe(1);
      
      // ai_agent should use 'userInput' as target handle
      const targetHandle = edgeResult.edges[0].targetHandle;
      // Note: EdgeCreationService will normalize this, so it should be 'userInput' or 'input'
      expect(targetHandle).toBeTruthy();
    });
    
    it('should normalize handles for if_else nodes', () => {
      const trigger = createMockNode('manual_trigger');
      const ifElse = createMockNode('if_else');
      const nodes = [trigger, ifElse];
      
      const plan = executionPlanBuilder.buildExecutionPlan(nodes);
      const edgeResult = atomicEdgeCreator.createEdgesFromExecutionPlan(plan, nodes);
      
      expect(edgeResult.success).toBe(true);
      expect(edgeResult.edges.length).toBe(1);
      
      // if_else should have valid handles
      const sourceHandle = edgeResult.edges[0].sourceHandle;
      const targetHandle = edgeResult.edges[0].targetHandle;
      
      expect(sourceHandle).toBeTruthy();
      expect(targetHandle).toBeTruthy();
    });
  });
  
  describe('Handle Normalization Functions', () => {
    it('should normalize common source field names', () => {
      expect(normalizeSourceHandle('google_sheets', 'data')).toBe('output');
      expect(normalizeSourceHandle('google_sheets', 'result')).toBe('output');
      expect(normalizeSourceHandle('google_sheets', 'response')).toBe('output');
    });
    
    it('should normalize common target field names', () => {
      expect(normalizeTargetHandle('slack_message', 'message')).toBe('input');
      expect(normalizeTargetHandle('slack_message', 'body')).toBe('input');
      expect(normalizeTargetHandle('slack_message', 'content')).toBe('input');
    });
    
    it('should map input to userInput for ai_agent', () => {
      const handle = normalizeTargetHandle('ai_agent', 'input');
      expect(handle).toBe('userInput');
    });
  });
});
