// PHASE-2: Node Compatibility Matrix
// Prevents incompatible node connections
// Rule: ❌ Never connect incompatible nodes

import { WorkflowNode } from '../../core/types/ai-types';

export interface CompatibilityRule {
  sourceNode: string | string[];
  targetNode: string | string[];
  compatible: boolean;
  reason?: string;
  alternative?: string[];
}

export interface CompatibilityCheck {
  compatible: boolean;
  reason?: string;
  alternatives?: string[];
  severity: 'error' | 'warning';
}

/**
 * Node Compatibility Matrix - PHASE-2 Feature #3
 * 
 * Maintains a matrix of compatible/incompatible node connections
 * Prevents runtime incompatibility errors
 */
export class NodeCompatibilityMatrix {
  private compatibilityRules: CompatibilityRule[] = [];

  constructor() {
    this.initializeCompatibilityRules();
  }

  /**
   * Check if two nodes are compatible
   */
  checkCompatibility(sourceNode: WorkflowNode, targetNode: WorkflowNode): CompatibilityCheck {
    const sourceType = sourceNode.type;
    const targetType = targetNode.type;

    // Find matching rule
    const rule = this.compatibilityRules.find(r => {
      const sourceMatch = Array.isArray(r.sourceNode)
        ? r.sourceNode.includes(sourceType)
        : r.sourceNode === sourceType;
      const targetMatch = Array.isArray(r.targetNode)
        ? r.targetNode.includes(targetType)
        : r.targetNode === targetType;

      return sourceMatch && targetMatch;
    });

    if (rule) {
      if (!rule.compatible) {
        return {
          compatible: false,
          reason: rule.reason || `Node ${sourceType} is not compatible with ${targetType}`,
          alternatives: rule.alternative,
          severity: 'error',
        };
      }
    }

    // Default: compatible (unless explicitly marked incompatible)
    return {
      compatible: true,
      severity: 'warning',
    };
  }

  /**
   * Initialize compatibility rules
   */
  private initializeCompatibilityRules(): void {
    // Define incompatible connections
    this.compatibilityRules = [
      // AI Agent must have Chat Model connected
      {
        sourceNode: 'ai_agent',
        targetNode: ['slack_message', 'email', 'http_request'],
        compatible: false,
        reason: 'AI Agent requires Chat Model node to be connected first',
        alternative: ['chat_model'],
      },

      // Trigger nodes cannot be targets
      {
        sourceNode: ['manual_trigger', 'webhook', 'schedule', 'email'],
        targetNode: ['manual_trigger', 'webhook', 'schedule', 'email'],
        compatible: false,
        reason: 'Trigger nodes cannot be connected to other trigger nodes',
      },

      // Database operations need proper data format
      {
        sourceNode: ['http_request', 'webhook'],
        targetNode: ['database_write', 'database_read'],
        compatible: true, // Compatible but may need transformation
        reason: 'May need data transformation between HTTP and database',
      },

      // Slack/Discord need text/message format
      {
        sourceNode: ['database_read', 'database_write'],
        targetNode: ['slack_message', 'discord_message'],
        compatible: true, // Compatible but may need formatting
        reason: 'May need text formatting for message nodes',
      },

      // AI nodes need structured input
      {
        sourceNode: ['http_request', 'webhook'],
        targetNode: ['ai_agent', 'openai_gpt', 'anthropic_claude'],
        compatible: true, // Compatible but may need parsing
        reason: 'May need JSON parsing for AI nodes',
      },

      // Form nodes should connect to processing nodes
      {
        sourceNode: 'form',
        targetNode: ['database_write', 'http_request', 'email'],
        compatible: true,
      },

      // Schedule should not connect directly to time-sensitive nodes without delay
      {
        sourceNode: 'schedule',
        targetNode: ['http_request', 'http_post'],
        compatible: true, // Compatible but may need rate limiting
        reason: 'Consider adding rate limiting for scheduled API calls',
      },
    ];
  }

  /**
   * Get compatible alternatives for incompatible connection
   */
  getAlternatives(sourceType: string, targetType: string): string[] {
    const rule = this.compatibilityRules.find(r => {
      const sourceMatch = Array.isArray(r.sourceNode)
        ? r.sourceNode.includes(sourceType)
        : r.sourceNode === sourceType;
      const targetMatch = Array.isArray(r.targetNode)
        ? r.targetNode.includes(targetType)
        : r.targetNode === targetType;

      return sourceMatch && targetMatch && !r.compatible;
    });

    return rule?.alternative || [];
  }

  /**
   * Validate entire workflow for compatibility
   */
  validateWorkflowCompatibility(nodes: WorkflowNode[], edges: Array<{ source: string; target: string }>): {
    valid: boolean;
    errors: Array<{ source: string; target: string; reason: string; alternatives?: string[] }>;
    warnings: Array<{ source: string; target: string; reason: string }>;
  } {
    const errors: Array<{ source: string; target: string; reason: string; alternatives?: string[] }> = [];
    const warnings: Array<{ source: string; target: string; reason: string }> = [];

    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);

      if (!sourceNode || !targetNode) {
        return;
      }

      const check = this.checkCompatibility(sourceNode, targetNode);

      if (!check.compatible) {
        errors.push({
          source: sourceNode.type,
          target: targetNode.type,
          reason: check.reason || 'Incompatible connection',
          alternatives: check.alternatives,
        });
      } else if (check.severity === 'warning' && check.reason) {
        warnings.push({
          source: sourceNode.type,
          target: targetNode.type,
          reason: check.reason,
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

// Export singleton instance
export const nodeCompatibilityMatrix = new NodeCompatibilityMatrix();
