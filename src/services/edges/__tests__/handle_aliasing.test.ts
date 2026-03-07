/**
 * Unit tests for Handle Aliasing
 */

import {
  normalizeSourceHandle,
  normalizeTargetHandle,
  getNodeHandleContract,
} from '../../../core/utils/node-handle-registry';

describe('Handle Aliasing', () => {
  describe('normalizeSourceHandle', () => {
    it('should normalize common field names to output handle', () => {
      expect(normalizeSourceHandle('google_sheets', 'data')).toBe('output');
      expect(normalizeSourceHandle('google_sheets', 'result')).toBe('output');
      expect(normalizeSourceHandle('google_sheets', 'response')).toBe('output');
    });
    
    it('should preserve valid handles', () => {
      expect(normalizeSourceHandle('if_else', 'true')).toBe('true');
      expect(normalizeSourceHandle('if_else', 'false')).toBe('false');
    });
    
    it('should use default handle for unknown field names', () => {
      const result = normalizeSourceHandle('google_sheets', 'unknown');
      expect(result).toBe('output'); // Default output handle
    });
  });
  
  describe('normalizeTargetHandle', () => {
    it('should normalize common field names to input handle', () => {
      expect(normalizeTargetHandle('slack_message', 'message')).toBe('input');
      expect(normalizeTargetHandle('slack_message', 'body')).toBe('input');
      expect(normalizeTargetHandle('slack_message', 'content')).toBe('input');
    });
    
    it('should map input to userInput for ai_agent', () => {
      expect(normalizeTargetHandle('ai_agent', 'input')).toBe('userInput');
    });
    
    it('should preserve valid handles', () => {
      expect(normalizeTargetHandle('ai_agent', 'userInput')).toBe('userInput');
      expect(normalizeTargetHandle('ai_agent', 'chat_model')).toBe('chat_model');
    });
    
    it('should use default handle for unknown field names', () => {
      const result = normalizeTargetHandle('slack_message', 'unknown');
      expect(result).toBe('input'); // Default input handle
    });
  });
  
  describe('getNodeHandleContract', () => {
    it('should return correct contract for standard nodes', () => {
      const contract = getNodeHandleContract('google_sheets');
      expect(contract.inputs).toContain('input');
      expect(contract.outputs).toContain('output');
    });
    
    it('should return correct contract for if_else', () => {
      const contract = getNodeHandleContract('if_else');
      expect(contract.inputs).toContain('input');
      expect(contract.outputs).toContain('true');
      expect(contract.outputs).toContain('false');
    });
    
    it('should return correct contract for ai_agent', () => {
      const contract = getNodeHandleContract('ai_agent');
      expect(contract.inputs).toContain('userInput');
      expect(contract.inputs).toContain('chat_model');
      expect(contract.outputs).toContain('output');
    });
    
    it('should return default contract for unknown node types', () => {
      const contract = getNodeHandleContract('unknown_node');
      expect(contract.inputs).toContain('input');
      expect(contract.outputs).toContain('output');
    });
  });
});
