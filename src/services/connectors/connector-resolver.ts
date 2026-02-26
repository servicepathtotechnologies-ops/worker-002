/**
 * Connector Resolver - Intent Extraction and Connector Resolution
 * 
 * This replaces heuristic node selection with deterministic connector resolution.
 * 
 * Pipeline:
 * 1. Extract intents from prompt
 * 2. Match intents to connectors by capability
 * 3. Disambiguate when multiple connectors match
 * 4. Return resolved connectors
 */

import { ConnectorRegistry, Connector, connectorRegistry } from './connector-registry';

export interface SemanticIntent {
  action: string; // e.g., "send", "read", "write"
  resource: string; // e.g., "email", "message", "spreadsheet"
  provider?: string; // e.g., "google", "smtp" (optional, for disambiguation)
}

export interface ConnectorResolutionResult {
  connectorId: string;
  connector: Connector;
  confidence: number; // 0.0 to 1.0
  reason: string;
  required: boolean;
}

export interface ConnectorResolutionError {
  message: string;
  intent: SemanticIntent;
  suggestions: string[]; // Suggested connector IDs
}

export interface ConnectorResolutionResponse {
  success: boolean;
  result?: ConnectorResolutionResult;
  error?: ConnectorResolutionError;
  alternatives?: ConnectorResolutionResult[]; // When multiple connectors match
}

/**
 * Connector Resolver
 * 
 * Resolves semantic intents to concrete connectors deterministically.
 */
export class ConnectorResolver {
  private registry: ConnectorRegistry;

  constructor(registry: ConnectorRegistry) {
    this.registry = registry;
  }

  /**
   * Resolve a semantic intent to a connector
   */
  resolveIntent(intent: SemanticIntent): ConnectorResolutionResponse {
    // Step 1: Build capability string
    const capability = `${intent.resource}.${intent.action}`;
    const providerCapability = intent.provider 
      ? `${intent.provider}.${intent.resource}.${intent.action}` 
      : null;

    // Step 2: Try provider-specific capability first
    if (providerCapability) {
      const connectors = this.registry.getConnectorsByCapability(providerCapability);
      if (connectors.length > 0) {
        return {
          success: true,
          result: {
            connectorId: connectors[0].id,
            connector: connectors[0],
            confidence: 0.95,
            reason: `Matched provider-specific capability: ${providerCapability}`,
            required: true,
          },
        };
      }
    }

    // Step 3: Try generic capability
    const connectors = this.registry.getConnectorsByCapability(capability);
    
    if (connectors.length === 0) {
      // No connector found
      return {
        success: false,
        error: {
          message: `No connector found for capability: ${capability}`,
          intent,
          suggestions: this.getSuggestions(intent),
        },
      };
    }

    // Step 4: If provider specified, prefer connectors with that provider
    if (intent.provider && connectors.length > 1) {
      const providerConnectors = connectors.filter(
        c => c.provider === intent.provider
      );
      
      if (providerConnectors.length > 0) {
        return {
          success: true,
          result: {
            connectorId: providerConnectors[0].id,
            connector: providerConnectors[0],
            confidence: 0.85,
            reason: `Matched capability: ${capability} with provider: ${intent.provider}`,
            required: true,
          },
          alternatives: connectors
            .filter(c => c.id !== providerConnectors[0].id)
            .map(c => ({
              connectorId: c.id,
              connector: c,
              confidence: 0.70,
              reason: `Alternative connector for ${capability}`,
              required: false,
            })),
        };
      }
    }

    // Step 5: Multiple connectors match - need disambiguation
    if (connectors.length > 1) {
      return {
        success: false,
        error: {
          message: `Multiple connectors match capability: ${capability}. Please specify provider.`,
          intent,
          suggestions: connectors.map(c => c.id),
        },
        alternatives: connectors.map(c => ({
          connectorId: c.id,
          connector: c,
          confidence: 0.75,
          reason: `Matches capability: ${capability}`,
          required: false,
        })),
      };
    }

    // Step 6: Single match
    return {
      success: true,
      result: {
        connectorId: connectors[0].id,
        connector: connectors[0],
        confidence: 0.80,
        reason: `Matched capability: ${capability}`,
        required: false,
      },
    };
  }

  /**
   * Extract intents from prompt
   * 
   * This is a simplified version - in production, you'd use NLP/LLM
   */
  extractIntents(prompt: string): SemanticIntent[] {
    const promptLower = prompt.toLowerCase();
    const intents: SemanticIntent[] = [];

    // Email intents
    if (promptLower.includes('gmail') || promptLower.includes('google mail') || promptLower.includes('google email')) {
      intents.push({
        action: 'send',
        resource: 'email',
        provider: 'google',
      });
    } else if (promptLower.includes('send email') || promptLower.includes('email notification')) {
      // Generic email - need to disambiguate
      intents.push({
        action: 'send',
        resource: 'email',
        // No provider - will trigger disambiguation
      });
    }

    // Slack intents
    if (promptLower.includes('slack')) {
      intents.push({
        action: 'send',
        resource: 'message',
        provider: 'slack',
      });
    }

    // Sheets intents
    if (promptLower.includes('google sheets') || promptLower.includes('spreadsheet')) {
      intents.push({
        action: 'write',
        resource: 'spreadsheet',
        provider: 'google',
      });
    }

    // Discord intents
    if (promptLower.includes('discord')) {
      intents.push({
        action: 'send',
        resource: 'message',
        provider: 'discord',
      });
    }

    return intents;
  }

  /**
   * Resolve all intents from a prompt
   */
  resolvePrompt(prompt: string): {
    resolved: ConnectorResolutionResult[];
    ambiguous: ConnectorResolutionResponse[];
    errors: ConnectorResolutionError[];
  } {
    const intents = this.extractIntents(prompt);
    const resolved: ConnectorResolutionResult[] = [];
    const ambiguous: ConnectorResolutionResponse[] = [];
    const errors: ConnectorResolutionError[] = [];

    for (const intent of intents) {
      const response = this.resolveIntent(intent);
      
      if (response.success && response.result) {
        resolved.push(response.result);
      } else if (response.alternatives && response.alternatives.length > 0) {
        ambiguous.push(response);
      } else if (response.error) {
        errors.push(response.error);
      }
    }

    return { resolved, ambiguous, errors };
  }

  /**
   * Get suggestions for an intent
   */
  private getSuggestions(intent: SemanticIntent): string[] {
    // Find connectors with similar capabilities
    const allConnectors = this.registry.getAllConnectors();
    const suggestions: string[] = [];

    // Try to find connectors with similar resource
    for (const connector of allConnectors) {
      if (connector.capabilities.some(cap => cap.includes(intent.resource))) {
        suggestions.push(connector.id);
      }
    }

    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  /**
   * Assert that Gmail intents resolve to google_gmail connector
   */
  assertGmailIntegrity(prompt: string, resolvedConnectors: string[]): void {
    const promptLower = prompt.toLowerCase();
    const mentionsGmail = promptLower.includes('gmail') || 
                         promptLower.includes('google mail') || 
                         promptLower.includes('google email');

    if (!mentionsGmail) {
      return; // No Gmail mentioned, skip check
    }

    const hasGmailConnector = resolvedConnectors.includes('google_gmail');
    
    if (!hasGmailConnector) {
      throw new Error(
        `🚨 CRITICAL: Prompt mentions Gmail but google_gmail connector was not resolved. ` +
        `Resolved connectors: ${resolvedConnectors.join(', ')}`
      );
    }

    // Check that SMTP connector is NOT resolved
    if (resolvedConnectors.includes('smtp_email')) {
      throw new Error(
        `🚨 CRITICAL: Prompt mentions Gmail but smtp_email connector was also resolved. ` +
        `Gmail must use google_gmail connector with OAuth, not SMTP.`
      );
    }
  }
}

// Singleton instance
export const connectorResolver = new ConnectorResolver(connectorRegistry);
