import { describe, expect, it } from '@jest/globals';
import { unifiedNodeRegistry } from '../unified-node-registry';

describe('Vercel Node Registration', () => {
  it('should register the Vercel node in the unified registry', () => {
    const vercelDef = unifiedNodeRegistry.get('vercel');
    expect(vercelDef).toBeDefined();
    expect(vercelDef?.type).toBe('vercel');
    expect(vercelDef?.label).toBe('Vercel');
    // Note: devops category is normalized to 'data' by the registry
    // because Vercel node can both read (list_deployments) and write (deploy) data
    expect(vercelDef?.category).toBe('data');
  });

  it('should have correct input schema for Vercel node', () => {
    const inputSchema = unifiedNodeRegistry.getInputSchema('vercel');
    expect(inputSchema).toBeDefined();
    expect(inputSchema?.operation).toBeDefined();
    expect(inputSchema?.token).toBeDefined();
    expect(inputSchema?.projectName).toBeDefined();
  });

  it('should have correct output schema for Vercel node', () => {
    const outputSchema = unifiedNodeRegistry.getOutputSchema('vercel');
    expect(outputSchema).toBeDefined();
    expect(outputSchema?.default).toBeDefined();
    expect(outputSchema?.default?.schema?.properties).toBeDefined();
  });

  it('should have correct default config for Vercel node', () => {
    const defaultConfig = unifiedNodeRegistry.getDefaultConfig('vercel');
    expect(defaultConfig).toBeDefined();
    expect(defaultConfig.operation).toBeDefined();
    // Token field may not have a default value (it's required but can be provided via credentials)
    // Just verify the config object exists
    expect(typeof defaultConfig).toBe('object');
  });

  it('should have correct required inputs for Vercel node', () => {
    const vercelDef = unifiedNodeRegistry.get('vercel');
    expect(vercelDef?.requiredInputs).toBeDefined();
    expect(vercelDef?.requiredInputs).toContain('operation');
    expect(vercelDef?.requiredInputs).toContain('token');
  });

  it('should have execute function for Vercel node', () => {
    const vercelDef = unifiedNodeRegistry.get('vercel');
    expect(vercelDef?.execute).toBeDefined();
    expect(typeof vercelDef?.execute).toBe('function');
  });

  it('should have correct tags for Vercel node', () => {
    const vercelDef = unifiedNodeRegistry.get('vercel');
    expect(vercelDef?.tags).toBeDefined();
    expect(vercelDef?.tags).toContain('vercel');
    expect(vercelDef?.tags).toContain('devops');
    expect(vercelDef?.tags).toContain('deployment');
  });

  it('should have correct AI selection criteria for Vercel node', () => {
    const vercelDef = unifiedNodeRegistry.get('vercel');
    expect(vercelDef?.aiSelectionCriteria).toBeDefined();
    expect(vercelDef?.aiSelectionCriteria?.keywords).toContain('vercel');
    expect(vercelDef?.aiSelectionCriteria?.keywords).toContain('deploy');
    expect(vercelDef?.aiSelectionCriteria?.keywords).toContain('deployment');
  });

  it('should have correct incoming and outgoing ports for Vercel node', () => {
    const vercelDef = unifiedNodeRegistry.get('vercel');
    expect(vercelDef?.incomingPorts).toBeDefined();
    expect(vercelDef?.incomingPorts).toContain('input');
    expect(vercelDef?.outgoingPorts).toBeDefined();
    expect(vercelDef?.outgoingPorts).toContain('output');
  });

  it('should not be a branching node', () => {
    const vercelDef = unifiedNodeRegistry.get('vercel');
    expect(vercelDef?.isBranching).toBe(false);
  });

  it('should have credential schema for Vercel node', () => {
    const credentialSchema = unifiedNodeRegistry.get('vercel')?.credentialSchema;
    expect(credentialSchema).toBeDefined();
  });
});
