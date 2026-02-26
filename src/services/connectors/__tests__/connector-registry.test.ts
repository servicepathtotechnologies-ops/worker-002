/**
 * Tests for Connector Registry
 */

import { connectorRegistry, Connector } from '../connector-registry';

// Jest-style test framework (adjust imports based on your test framework)
declare const describe: any;
declare const it: any;
declare const expect: any;

describe('ConnectorRegistry', () => {
  describe('getConnector', () => {
    it('should return google_gmail connector', () => {
      const connector = connectorRegistry.getConnector('google_gmail');
      expect(connector).toBeDefined();
      expect(connector?.id).toBe('google_gmail');
      expect(connector?.provider).toBe('google');
      expect(connector?.service).toBe('gmail');
    });

    it('should return smtp_email connector', () => {
      const connector = connectorRegistry.getConnector('smtp_email');
      expect(connector).toBeDefined();
      expect(connector?.id).toBe('smtp_email');
      expect(connector?.provider).toBe('smtp');
      expect(connector?.service).toBe('email');
    });

    it('should return undefined for unknown connector', () => {
      const connector = connectorRegistry.getConnector('unknown_connector');
      expect(connector).toBeUndefined();
    });
  });

  describe('getConnectorByNodeType', () => {
    it('should return google_gmail connector for google_gmail node', () => {
      const connector = connectorRegistry.getConnectorByNodeType('google_gmail');
      expect(connector).toBeDefined();
      expect(connector?.id).toBe('google_gmail');
    });

    it('should return smtp_email connector for email node', () => {
      const connector = connectorRegistry.getConnectorByNodeType('email');
      expect(connector).toBeDefined();
      expect(connector?.id).toBe('smtp_email');
    });

    it('should return undefined for node without connector', () => {
      const connector = connectorRegistry.getConnectorByNodeType('manual_trigger');
      expect(connector).toBeUndefined();
    });
  });

  describe('getConnectorsByCapability', () => {
    it('should return google_gmail for email.send capability', () => {
      const connectors = connectorRegistry.getConnectorsByCapability('email.send');
      expect(connectors.length).toBeGreaterThan(0);
      expect(connectors.some(c => c.id === 'google_gmail')).toBe(true);
      expect(connectors.some(c => c.id === 'smtp_email')).toBe(true);
    });

    it('should return google_gmail for gmail.send capability', () => {
      const connectors = connectorRegistry.getConnectorsByCapability('gmail.send');
      expect(connectors.length).toBe(1);
      expect(connectors[0].id).toBe('google_gmail');
    });

    it('should return empty array for unknown capability', () => {
      const connectors = connectorRegistry.getConnectorsByCapability('unknown.capability');
      expect(connectors).toEqual([]);
    });
  });

  describe('getConnectorsByProvider', () => {
    it('should return all Google connectors', () => {
      const connectors = connectorRegistry.getConnectorsByProvider('google');
      expect(connectors.length).toBeGreaterThan(0);
      expect(connectors.every(c => c.provider === 'google')).toBe(true);
    });

    it('should return smtp_email for smtp provider', () => {
      const connectors = connectorRegistry.getConnectorsByProvider('smtp');
      expect(connectors.length).toBe(1);
      expect(connectors[0].id).toBe('smtp_email');
    });
  });

  describe('findConnectorsByKeywords', () => {
    it('should find google_gmail for gmail keyword', () => {
      const connectors = connectorRegistry.findConnectorsByKeywords(['gmail']);
      expect(connectors.some(c => c.id === 'google_gmail')).toBe(true);
    });

    it('should find smtp_email for smtp keyword', () => {
      const connectors = connectorRegistry.findConnectorsByKeywords(['smtp']);
      expect(connectors.some(c => c.id === 'smtp_email')).toBe(true);
    });

    it('should find both connectors for email keyword', () => {
      const connectors = connectorRegistry.findConnectorsByKeywords(['email']);
      expect(connectors.length).toBeGreaterThan(0);
    });
  });

  describe('credential contracts', () => {
    it('should have OAuth contract for google_gmail', () => {
      const connector = connectorRegistry.getConnector('google_gmail');
      expect(connector?.credentialContract.type).toBe('oauth');
      expect(connector?.credentialContract.provider).toBe('google');
      expect(connector?.credentialContract.scopes).toBeDefined();
      expect(connector?.credentialContract.scopes?.length).toBeGreaterThan(0);
    });

    it('should have api_key contract for smtp_email', () => {
      const connector = connectorRegistry.getConnector('smtp_email');
      expect(connector?.credentialContract.type).toBe('api_key');
      expect(connector?.credentialContract.provider).toBe('smtp');
    });

    it('should have different credential contracts for gmail and smtp', () => {
      const gmailConnector = connectorRegistry.getConnector('google_gmail');
      const smtpConnector = connectorRegistry.getConnector('smtp_email');
      
      expect(gmailConnector?.credentialContract.provider).not.toBe(smtpConnector?.credentialContract.provider);
      expect(gmailConnector?.credentialContract.type).not.toBe(smtpConnector?.credentialContract.type);
    });
  });

  describe('isolation', () => {
    it('should not share credentials between gmail and smtp', () => {
      const gmailConnector = connectorRegistry.getConnector('google_gmail');
      const smtpConnector = connectorRegistry.getConnector('smtp_email');
      
      expect(gmailConnector?.credentialContract.vaultKey).not.toBe(smtpConnector?.credentialContract.vaultKey);
    });

    it('should have different node types for gmail and smtp', () => {
      const gmailConnector = connectorRegistry.getConnector('google_gmail');
      const smtpConnector = connectorRegistry.getConnector('smtp_email');
      
      expect(gmailConnector?.nodeTypes).not.toEqual(smtpConnector?.nodeTypes);
      expect(gmailConnector?.nodeTypes).toContain('google_gmail');
      expect(smtpConnector?.nodeTypes).toContain('email');
    });
  });
});
