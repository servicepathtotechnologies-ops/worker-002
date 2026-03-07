// Workflow Builder Utility Functions
// Helper functions for workflow generation and validation

import { WorkflowNode, WorkflowEdge } from '../../core/types/ai-types';
import { validateNodeConfig as validateNodeConfigFromRegistry } from '../../core/validation/schema-based-validator';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import { unifiedNormalizeNodeType, unifiedNormalizeNodeTypeString } from '../../core/utils/unified-node-type-normalizer';

/**
 * Check if a value is a placeholder (not allowed in production workflows)
 */
export function isPlaceholder(value: any): boolean {
  if (typeof value !== 'string') return false;
  
  const lowerValue = value.toLowerCase().trim();
  const placeholderPatterns = [
    'todo',
    'example',
    'fill this',
    'placeholder',
    'tbd',
    'to be determined',
    'coming soon',
    'not set',
    'empty',
  ];
  
  // Allow valid environment variable references
  if (lowerValue.includes('{{env.') || lowerValue.includes('{{env ')) {
    return false;
  }
  
  return placeholderPatterns.some(pattern => lowerValue.includes(pattern));
}

/**
 * Check if a value is a valid environment variable reference
 */
export function isEnvReference(value: any): boolean {
  if (typeof value !== 'string') return false;
  
  // Match patterns like {{ENV.KEY}} or {{ENV KEY}}
  const envPattern = /^\{\{ENV\.[A-Z0-9_]+\}\}$/i;
  return envPattern.test(value.trim());
}

/**
 * Generate a secure API key reference for a service
 */
export function generateApiKeyRef(serviceName: string, keyName?: string): string {
  const key = keyName || `${serviceName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
  return `{{ENV.${key}}}`;
}

/**
 * Get service-specific base URL
 */
export function getServiceBaseUrl(serviceName: string, endpoint?: string): string {
  const baseUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    google: 'https://www.googleapis.com',
    gemini: 'https://generativelanguage.googleapis.com/v1',
    slack: 'https://slack.com/api',
    discord: 'https://discord.com/api',
    webhook: 'https://example.com/webhook',
    github: 'https://api.github.com',
    gitlab: 'https://gitlab.com/api/v4',
    jira: 'https://your-domain.atlassian.net/rest/api/3',
    salesforce: 'https://your-instance.salesforce.com/services/data/v57.0',
    hubspot: 'https://api.hubapi.com',
    airtable: 'https://api.airtable.com/v0',
    notion: 'https://api.notion.com/v1',
    zapier: 'https://hooks.zapier.com/hooks/catch',
  };
  
  const service = serviceName.toLowerCase();
  const baseUrl = baseUrls[service] || `https://api.${service}.com/v1`;
  
  return endpoint ? `${baseUrl}${endpoint}` : baseUrl;
}

/**
 * Validate that a node has all required fields filled
 */
export function validateNodeConfig(node: WorkflowNode): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config = node.data?.config || {};
  
  // Check for placeholder values
  Object.entries(config).forEach(([key, value]) => {
    if (isPlaceholder(value)) {
      errors.push(`Field "${key}" contains placeholder value: "${value}"`);
    }
  });

  // Registry-driven validation (single source of truth)
  const registryValidation = validateNodeConfigFromRegistry(node);
  if (!registryValidation.valid) {
    errors.push(...registryValidation.errors);
  }
  if (registryValidation.warnings && registryValidation.warnings.length > 0) {
    warnings.push(...registryValidation.warnings);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a workflow has all required connections
 */
export function validateWorkflowConnections(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const nodeIds = new Set(nodes.map(n => n.id));
  const connectedNodeIds = new Set<string>();
  
  // Validate edges
  edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge ${index}: Source node "${edge.source}" does not exist`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge ${index}: Target node "${edge.target}" does not exist`);
    }
    
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });
  
  // Check for orphaned nodes
  const isTriggerNodeType = (t: string) => {
    const def = unifiedNodeRegistry.get(t);
    return def?.category === 'trigger' || t.includes('trigger');
  };
  
  nodes.forEach(node => {
    // Trigger nodes don't need incoming connections
    const actualType = unifiedNormalizeNodeType(node) || node.type;
    if (isTriggerNodeType(actualType)) {
      return;
    }
    
    // Check if node has incoming connection
    const hasIncoming = edges.some(e => e.target === node.id);
    if (!hasIncoming) {
      warnings.push(`Node "${node.data?.label || node.id}" has no incoming connections`);
    }
  });
  
  // Check for trigger node
  const hasTrigger = nodes.some(n => isTriggerNodeType(unifiedNormalizeNodeType(n) || n.type));
  if (!hasTrigger) {
    errors.push('Workflow must have at least one trigger node');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Sanitize a configuration value to remove placeholders
 */
export function sanitizeConfigValue(
  key: string,
  value: any,
  serviceName?: string
): any {
  if (typeof value !== 'string') return value;
  
  if (isPlaceholder(value)) {
    // Replace based on field type
    if (key.includes('url') || key.includes('Url')) {
      return getServiceBaseUrl(serviceName || 'webhook');
    } else if (key.includes('key') || key.includes('Key') || key.includes('token')) {
      return generateApiKeyRef(serviceName || 'api');
    } else if (key.includes('prompt') || key.includes('message') || key.includes('body')) {
      return 'Process the input data';
    } else if (key.includes('id') || key.includes('Id')) {
      return generateApiKeyRef(serviceName || 'id', `${serviceName?.toUpperCase()}_ID`);
    }
    return '{{ $json }}';
  }
  
  return value;
}

/**
 * Apply safe defaults to a configuration object
 */
export function applySafeDefaults(
  config: Record<string, any>,
  nodeType: string
): Record<string, any> {
  const defaults = unifiedNodeRegistry.getDefaultConfig(nodeType) || {};
  return { ...defaults, ...config };
}

/**
 * Extract service name from node type
 */
export function extractServiceName(nodeType: string): string {
  // Remove common suffixes
  const cleaned = nodeType
    .replace(/_gpt$/, '')
    .replace(/_claude$/, '')
    .replace(/_gemini$/, '')
    .replace(/_message$/, '')
    .replace(/_webhook$/, '');
  
  return cleaned;
}

/**
 * Check if a workflow is production-ready
 */
export function isProductionReady(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): {
  ready: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check each node
  nodes.forEach(node => {
    const validation = validateNodeConfig(node);
    if (!validation.valid) {
      issues.push(...validation.errors.map(e => `${node.data?.label || node.id}: ${e}`));
    }
  });
  
  // Check connections
  const connectionValidation = validateWorkflowConnections(nodes, edges);
  if (!connectionValidation.valid) {
    issues.push(...connectionValidation.errors);
  }
  
  return {
    ready: issues.length === 0,
    issues,
  };
}

