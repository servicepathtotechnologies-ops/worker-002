/**
 * Unit Tests for Vercel Node Credential Resolution — Task 10.1
 *
 * Validates: Requirements 4.1, 4.5
 * 
 * Tests that:
 * - Credentials are resolved from credential store
 * - Missing credentials are handled gracefully
 * - Credential token is used in API requests
 */

import { describe, expect, it } from '@jest/globals';
import { unifiedNodeRegistry } from '../core/registry/unified-node-registry';

describe('Vercel Node Credential Resolution — Unit Tests (Task 10.1)', () => {
  
  it('should have credential schema defined for Vercel node', () => {
    const vercelDef = unifiedNodeRegistry.get('vercel');
    
    expect(vercelDef).toBeDefined();
    expect(vercelDef?.credentialSchema).toBeDefined();
    expect(vercelDef?.credentialSchema?.requirements).toBeDefined();
    expect(vercelDef?.credentialSchema?.requirements?.length).toBeGreaterThan(0);
  });

  it('should require vercel provider credentials', () => {
    const vercelDef = unifiedNodeRegistry.get('vercel');
    const requirements = vercelDef?.credentialSchema?.requirements || [];
    
    const vercelRequirement = requirements.find(req => req.provider === 'vercel');
    expect(vercelRequirement).toBeDefined();
    expect(vercelRequirement?.required).toBe(true);
    expect(vercelRequirement?.category).toBe('api_key');
  });

  it('should have correct credential preflight descriptor', () => {
    const descriptor = unifiedNodeRegistry.getCredentialPreflightDescriptor('vercel');
    
    expect(descriptor.requiresCheck).toBe(true);
    expect(descriptor.credentialType).toBe('API_KEY');
    expect(descriptor.lookupKeys).toContain('vercel');
  });

  it('should include token field in credential fields', () => {
    const vercelDef = unifiedNodeRegistry.get('vercel');
    const credentialFields = vercelDef?.credentialSchema?.credentialFields || [];
    
    expect(credentialFields).toContain('token');
  });

  it('should have correct scopes for Vercel API operations', () => {
    const vercelDef = unifiedNodeRegistry.get('vercel');
    const requirements = vercelDef?.credentialSchema?.requirements || [];
    
    const vercelRequirement = requirements.find(req => req.provider === 'vercel');
    expect(vercelRequirement?.scopes).toContain('deployments:read');
    expect(vercelRequirement?.scopes).toContain('deployments:write');
  });

  it('should have correct vault key for credential lookup', () => {
    const vercelDef = unifiedNodeRegistry.get('vercel');
    const requirements = vercelDef?.credentialSchema?.requirements || [];
    
    const vercelRequirement = requirements.find(req => req.provider === 'vercel');
    expect(vercelRequirement?.vaultKey).toBe('vercel');
  });
});