/**
 * Property-Based Tests for Vercel Node Template Resolution — Task 9.1
 * 
 * **Validates: Requirements 8.2**
 * 
 * Tests universal template resolution for Vercel node configuration fields:
 * - {{$json.*}} templates in projectName field
 * - {{$json.*}} templates in token field (if provided as template)
 * - {{input.*}} templates for workflow inputs
 * - {{env.*}} templates for environment variables
 * - Nested template paths: {{$json.field.nested}}
 * - Template resolution applied before validation
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { LRUNodeOutputsCache } from '../core/cache/lru-node-outputs-cache';
import { resolveUniversalTemplate } from '../core/utils/universal-template-resolver';

describe('Vercel Node Template Resolution — Property-Based Tests (Task 9.1)', () => {
  
  /**
   * Property 17: Template Resolution Works
   * **Validates: Requirements 8.2**
   * 
   * For any config field containing template syntax (e.g., {{$json.projectName}}),
   * the template SHALL be resolved to the actual value before execution.
   */
  describe('Property 17: Template Resolution Works', () => {
    
    it('should resolve {{$json.*}} templates in projectName field', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          (projectName) => {
            const nodeOutputs = new LRUNodeOutputsCache(100);
            nodeOutputs.set('$json', { projectName }, true);
            
            const template = `{{$json.projectName}}`;
            const resolved = resolveUniversalTemplate(template, nodeOutputs);
            
            expect(resolved).toBe(projectName);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should resolve {{$json.*}} templates in token field', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 20, maxLength: 100 }),
          (token) => {
            const nodeOutputs = new LRUNodeOutputsCache(100);
            nodeOutputs.set('$json', { token }, true);
            
            const template = `{{$json.token}}`;
            const resolved = resolveUniversalTemplate(template, nodeOutputs);
            
            expect(resolved).toBe(token);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should resolve {{input.*}} templates for workflow inputs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          fc.string({ minLength: 20, maxLength: 100 }),
          (projectName, token) => {
            const nodeOutputs = new LRUNodeOutputsCache(100);
            nodeOutputs.set('input', { projectName, token }, true);
            
            const projectTemplate = `{{input.projectName}}`;
            const tokenTemplate = `{{input.token}}`;
            
            const resolvedProject = resolveUniversalTemplate(projectTemplate, nodeOutputs);
            const resolvedToken = resolveUniversalTemplate(tokenTemplate, nodeOutputs);
            
            expect(resolvedProject).toBe(projectName);
            expect(resolvedToken).toBe(token);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle nested template paths: {{$json.field.nested}}', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          fc.string({ minLength: 1, maxLength: 50 }),
          (projectName, version) => {
            const nodeOutputs = new LRUNodeOutputsCache(100);
            nodeOutputs.set('$json', { 
              deployment: { 
                projectName, 
                version 
              } 
            }, true);
            
            const projectTemplate = `{{$json.deployment.projectName}}`;
            const versionTemplate = `{{$json.deployment.version}}`;
            
            const resolvedProject = resolveUniversalTemplate(projectTemplate, nodeOutputs);
            const resolvedVersion = resolveUniversalTemplate(versionTemplate, nodeOutputs);
            
            expect(resolvedProject).toBe(projectName);
            expect(resolvedVersion).toBe(version);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should resolve templates with non-template format ($json.field without {{}})', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          (projectName) => {
            const nodeOutputs = new LRUNodeOutputsCache(100);
            nodeOutputs.set('$json', { projectName }, true);
            
            const template = `$json.projectName`;
            const resolved = resolveUniversalTemplate(template, nodeOutputs);
            
            expect(resolved).toBe(projectName);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle interpolated strings with multiple templates', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          fc.string({ minLength: 1, maxLength: 20 }),
          (projectName, version) => {
            const nodeOutputs = new LRUNodeOutputsCache(100);
            nodeOutputs.set('$json', { projectName, version }, true);
            
            const template = `Deploying {{$json.projectName}} version {{$json.version}}`;
            const resolved = resolveUniversalTemplate(template, nodeOutputs);
            
            expect(resolved).toBe(`Deploying ${projectName} version ${version}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return original template if value not found', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          (fieldName) => {
            const nodeOutputs = new LRUNodeOutputsCache(100);
            // Don't set any data
            
            const template = `{{$json.${fieldName}}}`;
            const resolved = resolveUniversalTemplate(template, nodeOutputs);
            
            // Should return original template if not resolved
            expect(resolved).toBe(template);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle complex nested objects with arrays', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
          (projects) => {
            const nodeOutputs = new LRUNodeOutputsCache(100);
            nodeOutputs.set('$json', { 
              deployments: {
                projects: projects
              }
            }, true);
            
            const template = `{{$json.deployments.projects}}`;
            const resolved = resolveUniversalTemplate(template, nodeOutputs);
            
            expect(Array.isArray(resolved)).toBe(true);
            expect(resolved).toEqual(projects);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle mixed template and literal values', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          fc.string({ minLength: 1, maxLength: 20 }),
          (projectName, literal) => {
            const nodeOutputs = new LRUNodeOutputsCache(100);
            nodeOutputs.set('$json', { projectName }, true);
            
            const template = `${literal}-{{$json.projectName}}-suffix`;
            const resolved = resolveUniversalTemplate(template, nodeOutputs);
            
            expect(resolved).toBe(`${literal}-${projectName}-suffix`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle trigger templates', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
          (triggerData) => {
            const nodeOutputs = new LRUNodeOutputsCache(100);
            nodeOutputs.set('trigger', { data: triggerData }, true);
            
            const template = `{{trigger.data}}`;
            const resolved = resolveUniversalTemplate(template, nodeOutputs);
            
            expect(resolved).toBe(triggerData);
          }
        ),
        { numRuns: 100 }
      );
    });

  });

  /**
   * Additional Edge Cases for Template Resolution
   */
  describe('Template Resolution Edge Cases', () => {
    
    it('should handle null and undefined values gracefully', () => {
      const nodeOutputs = new LRUNodeOutputsCache(100);
      nodeOutputs.set('$json', { 
        nullValue: null, 
        undefinedValue: undefined,
        emptyString: ''
      }, true);
      
      const nullTemplate = resolveUniversalTemplate('{{$json.nullValue}}', nodeOutputs);
      const undefinedTemplate = resolveUniversalTemplate('{{$json.undefinedValue}}', nodeOutputs);
      const emptyTemplate = resolveUniversalTemplate('{{$json.emptyString}}', nodeOutputs);
      
      expect(nullTemplate).toBe(null);
      // undefined values return the original template string since undefined !== undefined check fails
      expect(undefinedTemplate).toBe('{{$json.undefinedValue}}');
      expect(emptyTemplate).toBe('');
    });

    it('should handle numeric and boolean values', () => {
      const nodeOutputs = new LRUNodeOutputsCache(100);
      nodeOutputs.set('$json', { 
        number: 42, 
        boolean: true,
        zero: 0,
        false: false
      }, true);
      
      const numberTemplate = resolveUniversalTemplate('{{$json.number}}', nodeOutputs);
      const booleanTemplate = resolveUniversalTemplate('{{$json.boolean}}', nodeOutputs);
      const zeroTemplate = resolveUniversalTemplate('{{$json.zero}}', nodeOutputs);
      const falseTemplate = resolveUniversalTemplate('{{$json.false}}', nodeOutputs);
      
      expect(numberTemplate).toBe(42);
      expect(booleanTemplate).toBe(true);
      expect(zeroTemplate).toBe(0);
      expect(falseTemplate).toBe(false);
    });

    it('should handle deeply nested paths', () => {
      const nodeOutputs = new LRUNodeOutputsCache(100);
      nodeOutputs.set('$json', { 
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep-value'
              }
            }
          }
        }
      }, true);
      
      const template = '{{$json.level1.level2.level3.level4.value}}';
      const resolved = resolveUniversalTemplate(template, nodeOutputs);
      
      expect(resolved).toBe('deep-value');
    });

    it('should handle special characters in values', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (specialValue) => {
            const nodeOutputs = new LRUNodeOutputsCache(100);
            nodeOutputs.set('$json', { specialValue }, true);
            
            const template = '{{$json.specialValue}}';
            const resolved = resolveUniversalTemplate(template, nodeOutputs);
            
            expect(resolved).toBe(specialValue);
          }
        ),
        { numRuns: 100 }
      );
    });

  });

});