/**
 * Unit tests for Node ID Resolution
 */

import { nodeIdResolver, NodeIdResolver } from '../../../core/utils/nodeIdResolver';
import { WorkflowNode } from '../../../core/types/ai-types';

describe('NodeIdResolver', () => {
  let resolver: NodeIdResolver;
  
  beforeEach(() => {
    resolver = new NodeIdResolver();
  });
  
  afterEach(() => {
    resolver.clear();
  });
  
  describe('register', () => {
    it('should register logical to physical ID mapping', () => {
      resolver.register('step_1', 'node-123', 'google_sheets');
      
      expect(resolver.resolve('step_1')).toBe('node-123');
      expect(resolver.reverse('node-123')).toBe('step_1');
      expect(resolver.getNodeType('node-123')).toBe('google_sheets');
    });
    
    it('should update existing mapping', () => {
      resolver.register('step_1', 'node-123', 'google_sheets');
      resolver.register('step_1', 'node-456', 'slack_message');
      
      expect(resolver.resolve('step_1')).toBe('node-456');
      expect(resolver.getNodeType('node-456')).toBe('slack_message');
    });
  });
  
  describe('resolve', () => {
    it('should resolve logical ID to physical ID', () => {
      resolver.register('trigger', 'trigger-123', 'manual_trigger');
      
      expect(resolver.resolve('trigger')).toBe('trigger-123');
    });
    
    it('should return undefined for unknown logical ID', () => {
      expect(resolver.resolve('unknown')).toBeUndefined();
    });
  });
  
  describe('registerNodes', () => {
    it('should register all nodes', () => {
      const nodes: WorkflowNode[] = [
        { id: 'node-1', type: 'google_sheets', data: { type: 'google_sheets', label: '', category: '', config: {} } },
        { id: 'node-2', type: 'slack_message', data: { type: 'slack_message', label: '', category: '', config: {} } },
      ];
      
      resolver.registerNodes(nodes);
      
      expect(resolver.resolve('node-1')).toBe('node-1');
      expect(resolver.resolve('node-2')).toBe('node-2');
      expect(resolver.getNodeType('node-1')).toBe('google_sheets');
    });
  });
  
  describe('registerFromStructure', () => {
    it('should register step ID to node ID mappings', () => {
      const stepIdToNodeId = new Map([
        ['step_1', 'node-123'],
        ['step_2', 'node-456'],
      ]);
      
      const nodes: WorkflowNode[] = [
        { id: 'node-123', type: 'google_sheets', data: { type: 'google_sheets', label: '', category: '', config: {} } },
        { id: 'node-456', type: 'slack_message', data: { type: 'slack_message', label: '', category: '', config: {} } },
      ];
      
      resolver.registerFromStructure(stepIdToNodeId, nodes);
      
      expect(resolver.resolve('step_1')).toBe('node-123');
      expect(resolver.resolve('step_2')).toBe('node-456');
    });
  });
  
  describe('resolveBatch', () => {
    it('should resolve multiple logical IDs', () => {
      resolver.register('step_1', 'node-1', 'google_sheets');
      resolver.register('step_2', 'node-2', 'slack_message');
      
      const result = resolver.resolveBatch(['step_1', 'step_2', 'unknown']);
      
      expect(result.get('step_1')).toBe('node-1');
      expect(result.get('step_2')).toBe('node-2');
      expect(result.has('unknown')).toBe(false);
    });
  });
  
  describe('getStats', () => {
    it('should return correct statistics', () => {
      resolver.register('step_1', 'node-1', 'google_sheets');
      resolver.register('step_2', 'node-2', 'slack_message');
      
      const stats = resolver.getStats();
      
      expect(stats.totalMappings).toBe(2);
      expect(stats.logicalIds).toBe(2);
      expect(stats.physicalIds).toBe(2);
    });
  });
});
