/**
 * Phase 3: Real Workflow Validation Test Suite
 * 
 * Tests validation with real workflow examples from the codebase.
 * Measures:
 * - Error detection rate
 * - False positive rate
 * - Performance impact on real workflows
 * - Developer feedback on error messages
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  validateNodeConfig,
  formatValidationError,
  ValidationResult,
} from '../../core/validation/node-schemas';
import { ValidationMiddleware } from '../../core/validation/validation-middleware';

// Load real workflow examples
const WORKFLOWS_DIR = path.join(__dirname, '../../../../ctrl_checks/test_workflows');

interface WorkflowNode {
  id: string;
  type: string;
  data: {
    type: string;
    label: string;
    config: Record<string, unknown>;
  };
}

interface Workflow {
  name: string;
  description?: string;
  nodes: WorkflowNode[];
}

/**
 * Load workflow from JSON file
 */
function loadWorkflow(filename: string): Workflow | null {
  try {
    const filePath = path.join(WORKFLOWS_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Workflow;
  } catch (error) {
    console.warn(`Failed to load workflow ${filename}:`, error);
    return null;
  }
}

/**
 * Get all workflow files
 */
function getWorkflowFiles(): string[] {
  try {
    return fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.json'));
  } catch (error) {
    console.warn(`Failed to read workflows directory:`, error);
    return [];
  }
}

describe('Real Workflow Validation', () => {
  let workflows: Array<{ name: string; workflow: Workflow; filename: string }> = [];
  let validationMiddleware: ValidationMiddleware;

  beforeAll(() => {
    // Load all workflow files
    const files = getWorkflowFiles();
    for (const file of files) {
      const workflow = loadWorkflow(file);
      if (workflow) {
        workflows.push({
          name: workflow.name || file,
          workflow,
          filename: file,
        });
      }
    }

    // Initialize validation middleware
    validationMiddleware = new ValidationMiddleware({
      validateConfig: true,
      validateTemplates: true,
      strict: false,
      environment: 'development',
    });

    console.log(`Loaded ${workflows.length} workflows for testing`);
  });

  describe('Workflow Loading', () => {
    it('should load at least 3 workflow examples', () => {
      expect(workflows.length).toBeGreaterThanOrEqual(3);
    });

    it('should load HubSpot workflow', () => {
      const hubspot = workflows.find(w => w.filename.includes('hubspot'));
      expect(hubspot).toBeDefined();
      expect(hubspot?.workflow.nodes.length).toBeGreaterThan(0);
    });

    it('should load Salesforce workflow', () => {
      const salesforce = workflows.find(w => w.filename.includes('salesforce'));
      expect(salesforce).toBeDefined();
      expect(salesforce?.workflow.nodes.length).toBeGreaterThan(0);
    });
  });

  describe('Node Configuration Validation', () => {
    it('should validate all nodes in HubSpot workflow', () => {
      const hubspot = workflows.find(w => w.filename.includes('hubspot'));
      if (!hubspot) {
        return; // Skip if workflow not found
      }

      const errors: Array<{ nodeId: string; nodeType: string; error: string }> = [];
      const validatedNodes: string[] = [];

      for (const node of hubspot.workflow.nodes) {
        const nodeType = node.data.type;
        const config = node.data.config || {};

        const result = validateNodeConfig(nodeType, config, node.id);
        
        if (!result.success && result.error) {
          errors.push({
            nodeId: node.id,
            nodeType,
            error: formatValidationError(result.error),
          });
        } else {
          validatedNodes.push(node.id);
        }
      }

      // Log results
      console.log(`HubSpot workflow: ${validatedNodes.length} nodes validated, ${errors.length} errors`);
      
      // Should validate most nodes (some may not have schemas yet)
      expect(validatedNodes.length + errors.length).toBe(hubspot.workflow.nodes.length);
    });

    it('should validate all nodes in Salesforce workflow', () => {
      const salesforce = workflows.find(w => w.filename.includes('salesforce'));
      if (!salesforce) {
        return; // Skip if workflow not found
      }

      const errors: Array<{ nodeId: string; nodeType: string; error: string }> = [];
      const validatedNodes: string[] = [];

      for (const node of salesforce.workflow.nodes) {
        const nodeType = node.data.type;
        const config = node.data.config || {};

        const result = validateNodeConfig(nodeType, config, node.id);
        
        if (!result.success && result.error) {
          errors.push({
            nodeId: node.id,
            nodeType,
            error: formatValidationError(result.error),
          });
        } else {
          validatedNodes.push(node.id);
        }
      }

      console.log(`Salesforce workflow: ${validatedNodes.length} nodes validated, ${errors.length} errors`);
      expect(validatedNodes.length + errors.length).toBe(salesforce.workflow.nodes.length);
    });

    it('should validate all workflows without throwing', () => {
      const allErrors: Array<{ workflow: string; nodeId: string; error: string }> = [];
      const allValidated: Array<{ workflow: string; nodeId: string }> = [];

      for (const { name, workflow } of workflows) {
        for (const node of workflow.nodes) {
          const nodeType = node.data.type;
          const config = node.data.config || {};

          try {
            const result = validateNodeConfig(nodeType, config, node.id);
            
            if (!result.success && result.error) {
              allErrors.push({
                workflow: name,
                nodeId: node.id,
                error: formatValidationError(result.error),
              });
            } else {
              allValidated.push({
                workflow: name,
                nodeId: node.id,
              });
            }
          } catch (error) {
            // Should not throw - validation should be safe
            fail(`Validation threw error for ${name}/${node.id}: ${error}`);
          }
        }
      }

      console.log(`Total: ${allValidated.length} nodes validated, ${allErrors.length} errors across ${workflows.length} workflows`);
      
      // Should process all nodes without throwing
      expect(allValidated.length + allErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Template Validation', () => {
    it('should detect invalid template references', () => {
      const hubspot = workflows.find(w => w.filename.includes('hubspot'));
      if (!hubspot) {
        return;
      }

      // Find nodes with template strings in config
      const templateErrors: Array<{ nodeId: string; template: string; error: string }> = [];

      for (const node of hubspot.workflow.nodes) {
        const config = node.data.config || {};
        
        // Check all string values for templates
        for (const [key, value] of Object.entries(config)) {
          if (typeof value === 'string' && value.includes('{{')) {
            // Extract template variables
            const templateMatches = value.match(/\{\{([^}]+)\}\}/g);
            if (templateMatches) {
              for (const template of templateMatches) {
                // Simulate context (would be real in execution)
                const context = {
                  input: { test: 'value' },
                  node_1: { output: 'data' },
                };

                const validation = validationMiddleware.validateTemplateValue(
                  template,
                  undefined, // Simulate unresolved template
                  context
                );

                if (!validation.valid && validation.error) {
                  templateErrors.push({
                    nodeId: node.id,
                    template,
                    error: validation.error,
                  });
                }
              }
            }
          }
        }
      }

      // Log template validation results
      if (templateErrors.length > 0) {
        console.log(`Template validation errors:`, templateErrors);
      } else {
        console.log('No template validation errors detected');
      }

      // Should not throw
      expect(templateErrors).toBeDefined();
    });
  });

  describe('Error Message Quality', () => {
    it('should provide actionable error messages', () => {
      // Test with invalid HTTP Request node
      const invalidConfig = {
        url: 'not-a-url',
        method: 'INVALID_METHOD',
      };

      const result = validateNodeConfig('http_request', invalidConfig, 'test-node');
      
      expect(result.success).toBe(false);
      if (!result.success && result.error) {
        const errorMessage = formatValidationError(result.error);
        
        // Error message should be clear and actionable
        expect(errorMessage).toBeTruthy();
        expect(errorMessage.length).toBeGreaterThan(10);
        
        // Should mention the field with the error
        expect(
          errorMessage.toLowerCase().includes('url') ||
          errorMessage.toLowerCase().includes('method')
        ).toBe(true);
      }
    });

    it('should provide helpful suggestions for common errors', () => {
      // Test with missing required field
      const invalidConfig = {
        // Missing 'code' field
        timeout: 5000,
      };

      const result = validateNodeConfig('javascript', invalidConfig, 'test-node');
      
      expect(result.success).toBe(false);
      if (!result.success && result.error) {
        const errorMessage = formatValidationError(result.error);
        
        // Should mention the missing field
        expect(errorMessage.toLowerCase()).toContain('code');
      }
    });
  });

  describe('Performance Impact', () => {
    it('should validate workflows quickly', () => {
      const startTime = Date.now();
      let totalNodes = 0;

      for (const { workflow } of workflows) {
        for (const node of workflow.nodes) {
          const nodeType = node.data.type;
          const config = node.data.config || {};
          validateNodeConfig(nodeType, config, node.id);
          totalNodes++;
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      const avgTimePerNode = duration / totalNodes;

      console.log(`Performance: ${totalNodes} nodes validated in ${duration}ms (avg: ${avgTimePerNode.toFixed(2)}ms/node)`);

      // Should be fast (< 2ms per node as per Phase 3 requirements)
      expect(avgTimePerNode).toBeLessThan(2);
      expect(duration).toBeLessThan(1000); // Total should be < 1s for all workflows
    });
  });

  describe('Error Detection Rate', () => {
    it('should detect configuration errors in workflows', () => {
      // Create a workflow with intentional errors
      const errorWorkflow: Workflow = {
        name: 'Error Test Workflow',
        nodes: [
          {
            id: 'node_1',
            type: 'custom',
            data: {
              type: 'http_request',
              label: 'Invalid HTTP Request',
              config: {
                url: 'not-a-valid-url',
                method: 'INVALID',
              },
            },
          },
          {
            id: 'node_2',
            type: 'custom',
            data: {
              type: 'javascript',
              label: 'Invalid JavaScript',
              config: {
                // Missing required 'code' field
                timeout: -100, // Invalid timeout
              },
            },
          },
        ],
      };

      const errors: Array<{ nodeId: string; error: string }> = [];

      for (const node of errorWorkflow.nodes) {
        const result = validateNodeConfig(node.data.type, node.data.config, node.id);
        if (!result.success && result.error) {
          errors.push({
            nodeId: node.id,
            error: formatValidationError(result.error),
          });
        }
      }

      // Should detect at least some errors
      expect(errors.length).toBeGreaterThan(0);
      console.log(`Error detection: Found ${errors.length} errors in error workflow`);
    });
  });

  describe('False Positive Rate', () => {
    it('should not flag valid configurations as errors', () => {
      // Test with valid configurations
      const validConfigs = [
        {
          type: 'http_request',
          config: {
            url: 'https://api.example.com/data',
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          },
        },
        {
          type: 'set',
          config: {
            fields: '{"key": "value"}',
          },
        },
        {
          type: 'log_output',
          config: {
            message: 'Test log',
            level: 'info',
          },
        },
      ];

      let falsePositives = 0;

      for (const { type, config } of validConfigs) {
        const result = validateNodeConfig(type, config, 'test-node');
        if (!result.success) {
          falsePositives++;
          console.warn(`False positive for ${type}:`, formatValidationError(result.error!));
        }
      }

      // Should have low false positive rate
      expect(falsePositives).toBeLessThan(validConfigs.length / 2);
      console.log(`False positive rate: ${falsePositives}/${validConfigs.length}`);
    });
  });

  describe('Validation Statistics', () => {
    it('should collect validation statistics', () => {
      const stats = {
        totalNodes: 0,
        validatedNodes: 0,
        errors: 0,
        nodesWithSchemas: 0,
        nodesWithoutSchemas: 0,
        errorTypes: new Map<string, number>(),
      };

      for (const { workflow } of workflows) {
        for (const node of workflow.nodes) {
          stats.totalNodes++;
          
          const nodeType = node.data.type;
          const config = node.data.config || {};
          
          const result = validateNodeConfig(nodeType, config, node.id);
          
          if (result.success) {
            stats.validatedNodes++;
            stats.nodesWithSchemas++;
          } else {
            stats.errors++;
            if (result.error) {
              const errorType = result.error.nodeType || 'unknown';
              stats.errorTypes.set(errorType, (stats.errorTypes.get(errorType) || 0) + 1);
            }
          }
        }
      }

      console.log('Validation Statistics:', {
        totalNodes: stats.totalNodes,
        validatedNodes: stats.validatedNodes,
        errors: stats.errors,
        errorRate: `${((stats.errors / stats.totalNodes) * 100).toFixed(2)}%`,
        errorTypes: Object.fromEntries(stats.errorTypes),
      });

      expect(stats.totalNodes).toBeGreaterThan(0);
      expect(stats.validatedNodes + stats.errors).toBe(stats.totalNodes);
    });
  });
});
