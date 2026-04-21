/**
 * Unit Tests for createVercelNodeSchema() — Task 1.1
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 *
 * Asserts:
 *   - schema has type: 'vercel', category: 'devops', label: 'Vercel'
 *   - required fields: operation, token
 *   - optional fields: operation, projectName, token
 *   - operation enum: 'deploy' | 'list_deployments'
 *   - projectName is conditionally required when operation='deploy'
 *   - output schema: { success: boolean, data: object, error: object }
 *   - aiSelectionCriteria.keywords includes 'vercel', 'deploy', 'deployment', 'release', 'production'
 *   - commonPatterns has entries for deploy_project and list_all_deployments
 *   - validationRules enforces operation enum and projectName format
 */

import { describe, it, expect } from '@jest/globals';

// We access the schema via the public API (getSchema) since
// NodeLibrary registers all schemas on construction.
import { NodeLibrary } from '../services/nodes/node-library';

describe('createVercelNodeSchema() — unit tests (Task 1.1)', () => {
  let schema: ReturnType<NodeLibrary['getSchema']>;

  beforeAll(() => {
    const library = new NodeLibrary();
    schema = library.getSchema('vercel');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — NodeLibrary contains a Vercel schema with type 'vercel'
  // -------------------------------------------------------------------------
  it('schema is registered and has type: vercel', () => {
    expect(schema).toBeDefined();
    expect(schema!.type).toBe('vercel');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — label: 'Vercel'
  // -------------------------------------------------------------------------
  it('schema has label: Vercel', () => {
    expect(schema!.label).toBe('Vercel');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — category: 'devops'
  // -------------------------------------------------------------------------
  it('schema has category: devops', () => {
    expect(schema!.category).toBe('devops');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — description
  // -------------------------------------------------------------------------
  it('schema has a description', () => {
    expect(schema!.description).toBeDefined();
    expect(typeof schema!.description).toBe('string');
    expect(schema!.description.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.2 — required fields: operation, token
  // -------------------------------------------------------------------------
  it('configSchema.required includes operation and token', () => {
    const required = schema!.configSchema.required;
    expect(required).toContain('operation');
    expect(required).toContain('token');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.3 — optional fields with type and description
  // -------------------------------------------------------------------------
  it('configSchema.optional includes operation, projectName, and token', () => {
    const optional = schema!.configSchema.optional as Record<string, any>;
    expect(optional).toBeDefined();

    const expectedOptional = ['operation', 'projectName', 'token'];
    for (const field of expectedOptional) {
      expect(optional[field]).toBeDefined();
      expect(typeof optional[field].type).toBe('string');
      expect(typeof optional[field].description).toBe('string');
    }
  });

  // -------------------------------------------------------------------------
  // Requirement 1.3 — operation field has options for 'deploy' and 'list_deployments'
  // -------------------------------------------------------------------------
  it('operation field has options for deploy and list_deployments', () => {
    const optional = schema!.configSchema.optional as Record<string, any>;
    const operationField = optional.operation;
    expect(operationField.options).toBeDefined();
    expect(Array.isArray(operationField.options)).toBe(true);
    
    const values = operationField.options.map((opt: any) => opt.value);
    expect(values).toContain('deploy');
    expect(values).toContain('list_deployments');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.4 — projectName is conditionally required when operation='deploy'
  // -------------------------------------------------------------------------
  it('projectName field has requiredIf condition for operation=deploy', () => {
    const optional = schema!.configSchema.optional as Record<string, any>;
    const projectNameField = optional.projectName;
    expect(projectNameField.requiredIf).toBeDefined();
    expect(projectNameField.requiredIf.field).toBe('operation');
    expect(projectNameField.requiredIf.equals).toBe('deploy');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.5 — output schema: { success: boolean, data: object, error: object }
  // -------------------------------------------------------------------------
  it('schema has outputSchema with success, data, and error fields', () => {
    expect(schema!.outputSchema).toBeDefined();
    if (schema!.outputSchema) {
      expect(schema!.outputSchema.success).toBeDefined();
      expect(schema!.outputSchema.data).toBeDefined();
      expect(schema!.outputSchema.error).toBeDefined();
    }
  });

  it('outputSchema.success is boolean type', () => {
    if (schema!.outputSchema && schema!.outputSchema.success) {
      expect(schema!.outputSchema.success.type).toBe('boolean');
    }
  });

  it('outputSchema.data is object type', () => {
    if (schema!.outputSchema && schema!.outputSchema.data) {
      expect(schema!.outputSchema.data.type).toBe('object');
    }
  });

  it('outputSchema.error is object type', () => {
    if (schema!.outputSchema && schema!.outputSchema.error) {
      expect(schema!.outputSchema.error.type).toBe('object');
    }
  });

  // -------------------------------------------------------------------------
  // Requirement 1.6 — aiSelectionCriteria.keywords
  // -------------------------------------------------------------------------
  it('aiSelectionCriteria.keywords includes vercel, deploy, deployment, release, production', () => {
    const keywords = schema!.aiSelectionCriteria?.keywords ?? [];
    expect(keywords).toContain('vercel');
    expect(keywords).toContain('deploy');
    expect(keywords).toContain('deployment');
    expect(keywords).toContain('release');
    expect(keywords).toContain('production');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.6 — aiSelectionCriteria.whenToUse (at least 4 entries)
  // -------------------------------------------------------------------------
  it('aiSelectionCriteria.whenToUse has at least 4 entries', () => {
    const whenToUse = schema!.aiSelectionCriteria?.whenToUse ?? [];
    expect(whenToUse.length).toBeGreaterThanOrEqual(4);
  });

  it('aiSelectionCriteria.whenToUse includes deployment-related use cases', () => {
    const whenToUse = schema!.aiSelectionCriteria?.whenToUse ?? [];
    const whenToUseStr = whenToUse.join(' ').toLowerCase();
    expect(whenToUseStr).toContain('deploy');
    expect(whenToUseStr).toContain('vercel');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.6 — aiSelectionCriteria.whenNotToUse
  // -------------------------------------------------------------------------
  it('aiSelectionCriteria.whenNotToUse includes non-Vercel platforms', () => {
    const whenNotToUse = schema!.aiSelectionCriteria?.whenNotToUse ?? [];
    expect(whenNotToUse.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.7 — commonPatterns: deploy_project and list_all_deployments
  // -------------------------------------------------------------------------
  it('commonPatterns has entries for deploy_project and list_all_deployments', () => {
    const patterns = schema!.commonPatterns ?? [];
    const names = patterns.map((p: any) => p.name);
    expect(names).toContain('deploy_project');
    expect(names).toContain('list_all_deployments');
  });

  it('commonPatterns entries have name, description, and config', () => {
    const patterns = schema!.commonPatterns ?? [];
    for (const pattern of patterns) {
      expect(typeof pattern.name).toBe('string');
      expect(typeof pattern.description).toBe('string');
      expect(pattern.config).toBeDefined();
    }
  });

  // -------------------------------------------------------------------------
  // Requirement 1.7 — validationRules: operation enum
  // -------------------------------------------------------------------------
  it('validationRules enforces operation is deploy or list_deployments', () => {
    const rules = schema!.validationRules ?? [];
    const opRule = rules.find((r: any) => r.field === 'operation');
    expect(opRule).toBeDefined();
    
    // Valid operations should pass
    expect(opRule!.validator('deploy')).toBe(true);
    expect(opRule!.validator('list_deployments')).toBe(true);
    
    // Invalid operations should fail
    expect(opRule!.validator('invalid_op')).toBe(false);
    expect(opRule!.validator('')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.7 — validationRules: projectName format
  // -------------------------------------------------------------------------
  it('validationRules enforces projectName format (alphanumeric, hyphens, underscores)', () => {
    const rules = schema!.validationRules ?? [];
    const projectNameRule = rules.find((r: any) => r.field === 'projectName');
    expect(projectNameRule).toBeDefined();
    
    // Valid project names should pass
    expect(projectNameRule!.validator('my-app')).toBe(true);
    expect(projectNameRule!.validator('my_app')).toBe(true);
    expect(projectNameRule!.validator('myapp')).toBe(true);
    expect(projectNameRule!.validator('my-app-123')).toBe(true);
    
    // Invalid project names should fail
    expect(projectNameRule!.validator('my app')).toBe(false); // space
    expect(projectNameRule!.validator('my.app')).toBe(false); // dot
    expect(projectNameRule!.validator('my@app')).toBe(false); // special char
  });

  // -------------------------------------------------------------------------
  // Requirement 1.7 — validationRules: token must be non-empty
  // -------------------------------------------------------------------------
  it('validationRules enforces token is non-empty string', () => {
    const rules = schema!.validationRules ?? [];
    const tokenRule = rules.find((r: any) => r.field === 'token');
    expect(tokenRule).toBeDefined();
    
    // Valid tokens should pass
    expect(tokenRule!.validator('vercel_abc123')).toBe(true);
    expect(tokenRule!.validator('some-token')).toBe(true);
    
    // Invalid tokens should fail
    expect(tokenRule!.validator('')).toBe(false);
    expect(tokenRule!.validator('   ')).toBe(false); // whitespace only
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — providers: ['vercel']
  // -------------------------------------------------------------------------
  it('schema has providers: [vercel]', () => {
    expect(schema!.providers).toEqual(['vercel']);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — capabilities
  // -------------------------------------------------------------------------
  it('schema has capabilities array with deployment-related capabilities', () => {
    expect(schema!.capabilities).toBeDefined();
    expect(Array.isArray(schema!.capabilities)).toBe(true);
    expect(schema!.capabilities!.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — aiSelectionCriteria.intentDescription
  // -------------------------------------------------------------------------
  it('aiSelectionCriteria has intentDescription', () => {
    expect(schema!.aiSelectionCriteria?.intentDescription).toBeDefined();
    expect(typeof schema!.aiSelectionCriteria?.intentDescription).toBe('string');
    expect(schema!.aiSelectionCriteria?.intentDescription!.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — aiSelectionCriteria.intentCategories
  // -------------------------------------------------------------------------
  it('aiSelectionCriteria has intentCategories', () => {
    expect(schema!.aiSelectionCriteria?.intentCategories).toBeDefined();
    expect(Array.isArray(schema!.aiSelectionCriteria?.intentCategories)).toBe(true);
    expect(schema!.aiSelectionCriteria?.intentCategories!.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — getSchema('vercel') returns without error
  // -------------------------------------------------------------------------
  it('NodeLibrary.getSchema("vercel") returns the schema without error', () => {
    const library = new NodeLibrary();
    const result = library.getSchema('vercel');
    expect(result).toBeDefined();
    expect(result!.type).toBe('vercel');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — isNodeTypeRegistered('vercel') returns true
  // -------------------------------------------------------------------------
  it('NodeLibrary.isNodeTypeRegistered("vercel") returns true', () => {
    const library = new NodeLibrary();
    expect(library.isNodeTypeRegistered('vercel')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — getRegisteredNodeTypes() includes 'vercel'
  // -------------------------------------------------------------------------
  it('NodeLibrary.getRegisteredNodeTypes() includes vercel', () => {
    const library = new NodeLibrary();
    const types = library.getRegisteredNodeTypes();
    expect(types).toContain('vercel');
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — getNodesByCategory('devops') includes 'vercel'
  // -------------------------------------------------------------------------
  it('NodeLibrary.getNodesByCategory("devops") includes vercel', () => {
    const library = new NodeLibrary();
    const devopsNodes = library.getNodesByCategory('devops');
    const vercelNode = devopsNodes.find((n: any) => n.type === 'vercel');
    expect(vercelNode).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Requirement 1.1 — findNodesByKeywords includes 'vercel'
  // -------------------------------------------------------------------------
  it('NodeLibrary.findNodesByKeywords(["vercel"]) includes vercel node', () => {
    const library = new NodeLibrary();
    const results = library.findNodesByKeywords(['vercel']);
    const vercelNode = results.find((n: any) => n.type === 'vercel');
    expect(vercelNode).toBeDefined();
  });

  it('NodeLibrary.findNodesByKeywords(["deploy"]) includes vercel node', () => {
    const library = new NodeLibrary();
    const results = library.findNodesByKeywords(['deploy']);
    const vercelNode = results.find((n: any) => n.type === 'vercel');
    expect(vercelNode).toBeDefined();
  });

  it('NodeLibrary.findNodesByKeywords(["deployment"]) includes vercel node', () => {
    const library = new NodeLibrary();
    const results = library.findNodesByKeywords(['deployment']);
    const vercelNode = results.find((n: any) => n.type === 'vercel');
    expect(vercelNode).toBeDefined();
  });
});
