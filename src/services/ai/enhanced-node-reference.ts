/**
 * Enhanced Node Reference Generator
 * Provides comprehensive node information including credentials, configs, and requirements
 */

import * as fs from 'fs';
import * as path from 'path';
import { nodeLibrary } from '../nodes/node-library';

interface NodeReference {
  type: string;
  label: string;
  category: string;
  description: string;
  requiredConfigs: string[];
  optionalConfigs: string[];
  credentials: CredentialRequirement[];
  inputs: string[];
  outputs: string[];
  whenToUse: string[];
  whenNotToUse: string[];
  keywords: string[];
  useCases: string[];
  examples: NodeExample[];
}

interface CredentialRequirement {
  type: string;
  required: boolean;
  handledViaNavbar?: boolean;
  description: string;
}

interface NodeExample {
  name: string;
  description: string;
  config: Record<string, any>;
}

/**
 * Enhanced Node Reference Generator
 * Creates comprehensive reference with all requirements
 */
export class EnhancedNodeReference {
  private nodeLibraryPath: string;
  private referenceCache: Map<string, NodeReference> = new Map();

  constructor() {
    this.nodeLibraryPath = path.join(__dirname, '../../../data/node-library.v1.json');
  }

  /**
   * Generate comprehensive node reference for AI agent
   */
  generateComprehensiveReference(): string {
    const allSchemas = nodeLibrary.getAllSchemas();
    const nodesByCategory = new Map<string, NodeReference[]>();

    // Process all nodes
    allSchemas.forEach(schema => {
      const category = schema.category || 'other';
      if (!nodesByCategory.has(category)) {
        nodesByCategory.set(category, []);
      }

      const nodeRef = this.buildNodeReference(schema);
      nodesByCategory.get(category)!.push(nodeRef);
      this.referenceCache.set(schema.type, nodeRef);
    });

    // Build comprehensive reference document
    let reference = '# 📚 COMPREHENSIVE NODE REFERENCE FOR AI AGENT\n\n';
    reference += '**Complete requirements, configs, credentials, and usage guide for all nodes.**\n\n';
    reference += '---\n\n';

    // Add classification by credentials
    reference += this.generateCredentialClassification(nodesByCategory);
    reference += '\n---\n\n';

    // Add nodes by category
    const categoryOrder = [
      'triggers', 'ai', 'http_api', 'communication', 
      'data', 'google', 'database', 'logic', 'output'
    ];

    categoryOrder.forEach(category => {
      const nodes = nodesByCategory.get(category);
      if (!nodes || nodes.length === 0) return;

      reference += this.generateCategorySection(category, nodes);
      reference += '\n';
    });

    // Add requirements matrix
    reference += this.generateRequirementsMatrix(Array.from(this.referenceCache.values()));

    return reference;
  }

  /**
   * Build node reference from schema
   */
  private buildNodeReference(schema: any): NodeReference {
    const requiredConfigs = schema.configSchema?.required || [];
    const optionalConfigs = Object.keys(schema.configSchema?.optional || {});
    const credentials = this.extractCredentials(schema);
    const inputs = this.extractInputs(schema);
    const outputs = this.extractOutputs(schema);

    return {
      type: schema.type,
      label: schema.label,
      category: schema.category,
      description: schema.description || '',
      requiredConfigs,
      optionalConfigs,
      credentials,
      inputs,
      outputs,
      whenToUse: schema.aiSelectionCriteria?.whenToUse || [],
      whenNotToUse: schema.aiSelectionCriteria?.whenNotToUse || [],
      keywords: schema.aiSelectionCriteria?.keywords || [],
      useCases: schema.aiSelectionCriteria?.useCases || [],
      examples: schema.commonPatterns || []
    };
  }

  /**
   * Extract credential requirements from schema
   */
  private extractCredentials(schema: any): CredentialRequirement[] {
    const credentials: CredentialRequirement[] = [];

    // Check node-library.v1.json for credentials
    try {
      const libraryData = fs.readFileSync(this.nodeLibraryPath, 'utf-8');
      const library = JSON.parse(libraryData);
      const nodeDef = library.nodes[this.getNodeKey(schema.type)];
      
      if (nodeDef?.credentials) {
        nodeDef.credentials.forEach((cred: any) => {
          credentials.push({
            type: cred.type || cred,
            required: cred.required !== false,
            handledViaNavbar: this.isGoogleCredential(cred.type),
            description: this.getCredentialDescription(cred.type)
          });
        });
      }
    } catch (error) {
      // Fallback: infer from node type
      const inferred = this.inferCredentials(schema.type);
      if (inferred) {
        credentials.push(inferred);
      }
    }

    return credentials;
  }

  /**
   * Get node key from node library
   */
  private getNodeKey(nodeType: string): string {
    const keyMap: Record<string, string> = {
      'n8n-nodes-base.scheduleTrigger': 'scheduleTrigger',
      'n8n-nodes-base.webhook': 'webhook',
      'n8n-nodes-base.manualTrigger': 'manualTrigger',
      'n8n-nodes-base.slack': 'slack',
      'n8n-nodes-base.googleSheets': 'googleSheets',
      'n8n-nodes-base.httpRequest': 'httpRequest',
      '@n8n/n8n-nodes-langchain.agent': 'aiAgent',
      'n8n-nodes-base.if': 'if',
      'n8n-nodes-base.set': 'set',
      'n8n-nodes-base.emailSend': 'emailSend'
    };

    // Try direct mapping
    if (keyMap[nodeType]) {
      return keyMap[nodeType];
    }

    // Try by removing prefix
    return nodeType.split('.').pop() || nodeType;
  }

  /**
   * Check if credential is handled via navbar
   */
  private isGoogleCredential(credType: string): boolean {
    return credType?.toLowerCase().includes('google') || 
           credType?.toLowerCase().includes('oauth');
  }

  /**
   * Get credential description
   */
  private getCredentialDescription(credType: string): string {
    const descriptions: Record<string, string> = {
      'slackApi': 'Slack Bot Token or Webhook URL',
      'slackBotToken': 'Slack Bot Token',
      'slackWebhookUrl': 'Slack Webhook URL',
      'googleSheetsOAuth2Api': 'Google OAuth2 (handled via navbar)',
      'googleOAuth2': 'Google OAuth2 (handled via navbar)',
      'smtp': 'SMTP server credentials',
      'openAiApi': 'OpenAI API Key (or use Ollama - no key needed)',
      'httpBasicAuth': 'HTTP Basic Authentication',
      'httpHeaderAuth': 'HTTP Header Authentication',
      'oauth2Api': 'OAuth2 API credentials'
    };

    return descriptions[credType] || `${credType} credentials`;
  }

  /**
   * Infer credentials from node type
   */
  private inferCredentials(nodeType: string): CredentialRequirement | null {
    const credMap: Record<string, CredentialRequirement> = {
      'slack_message': {
        type: 'SLACK_BOT_TOKEN',
        required: true,
        description: 'Slack Bot Token or Webhook URL'
      },
      'google_sheets': {
        type: 'GOOGLE_OAUTH2',
        required: true,
        handledViaNavbar: true,
        description: 'Google OAuth2 (handled via navbar)'
      },
      'google_doc': {
        type: 'GOOGLE_OAUTH2',
        required: true,
        handledViaNavbar: true,
        description: 'Google OAuth2 (handled via navbar)'
      },
      'google_gmail': {
        type: 'GOOGLE_OAUTH2',
        required: true,
        handledViaNavbar: true,
        description: 'Google OAuth2 (handled via navbar)'
      },
      'email': {
        type: 'SMTP_CREDENTIALS',
        required: true,
        description: 'SMTP server credentials'
      },
      'ai_agent': {
        type: 'OLLAMA',
        required: false,
        description: 'Uses Ollama (local, no API key needed)'
      }
    };

    return credMap[nodeType] || null;
  }

  /**
   * Extract inputs from schema
   */
  private extractInputs(schema: any): string[] {
    // Check node-library.v1.json
    try {
      const libraryData = fs.readFileSync(this.nodeLibraryPath, 'utf-8');
      const library = JSON.parse(libraryData);
      const nodeDef = library.nodes[this.getNodeKey(schema.type)];
      return nodeDef?.inputs || [];
    } catch {
      // Default based on category
      if (schema.category === 'triggers') {
        return [];
      }
      return ['main'];
    }
  }

  /**
   * Extract outputs from schema
   */
  private extractOutputs(schema: any): string[] {
    // Check node-library.v1.json
    try {
      const libraryData = fs.readFileSync(this.nodeLibraryPath, 'utf-8');
      const library = JSON.parse(libraryData);
      const nodeDef = library.nodes[this.getNodeKey(schema.type)];
      return nodeDef?.outputs || ['main'];
    } catch {
      // Default based on category
      if (schema.type === 'if_else') {
        return ['true', 'false'];
      }
      return ['main'];
    }
  }

  /**
   * Generate credential classification section
   */
  private generateCredentialClassification(nodesByCategory: Map<string, NodeReference[]>): string {
    let section = '## 🔐 CREDENTIAL REQUIREMENTS CLASSIFICATION\n\n';

    const noCreds: NodeReference[] = [];
    const withCreds: NodeReference[] = [];

    nodesByCategory.forEach(nodes => {
      nodes.forEach(node => {
        if (node.credentials.length === 0) {
          noCreds.push(node);
        } else {
          withCreds.push(node);
        }
      });
    });

    section += '### ✅ No Credentials Required\n\n';
    noCreds.forEach(node => {
      section += `- \`${node.type}\` - ${node.label}\n`;
    });

    section += '\n### 🔑 Credentials Required\n\n';
    withCreds.forEach(node => {
      const creds = node.credentials.map(c => 
        c.handledViaNavbar ? `${c.type} (navbar)` : c.type
      ).join(', ');
      section += `- \`${node.type}\` - ${node.label} → **${creds}**\n`;
    });

    return section;
  }

  /**
   * Generate category section
   */
  private generateCategorySection(category: string, nodes: NodeReference[]): string {
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
    let section = `## ${categoryLabel.toUpperCase()} NODES\n\n`;

    nodes.forEach(node => {
      section += this.generateNodeSection(node);
      section += '\n';
    });

    return section;
  }

  /**
   * Generate individual node section
   */
  private generateNodeSection(node: NodeReference): string {
    let section = `### ${node.label} (\`${node.type}\`)\n\n`;
    section += `**Description:** ${node.description}\n\n`;

    // Required configs
    if (node.requiredConfigs.length > 0) {
      section += `**Required Configs:**\n`;
      node.requiredConfigs.forEach(config => {
        section += `- \`${config}\` (required)\n`;
      });
      section += '\n';
    }

    // Credentials
    if (node.credentials.length > 0) {
      section += `**Credentials Required:**\n`;
      node.credentials.forEach(cred => {
        const status = cred.required ? '🔑 REQUIRED' : '⚪ Optional';
        const navbar = cred.handledViaNavbar ? ' (handled via navbar)' : '';
        section += `- ${status}: **${cred.type}**${navbar} - ${cred.description}\n`;
      });
      section += '\n';
    } else {
      section += `**Credentials:** None ✅\n\n`;
    }

    // Inputs/Outputs
    section += `**Inputs:** ${node.inputs.length > 0 ? node.inputs.join(', ') : 'None (trigger)'}\n`;
    section += `**Outputs:** ${node.outputs.join(', ')}\n\n`;

    // When to use
    if (node.whenToUse.length > 0) {
      section += `**When to Use:**\n`;
      node.whenToUse.slice(0, 5).forEach(use => {
        section += `- ✅ ${use}\n`;
      });
      section += '\n';
    }

    // When NOT to use
    if (node.whenNotToUse.length > 0) {
      section += `**When NOT to Use:**\n`;
      node.whenNotToUse.slice(0, 3).forEach(notUse => {
        section += `- ❌ ${notUse}\n`;
      });
      section += '\n';
    }

    // Keywords
    if (node.keywords.length > 0) {
      section += `**Keywords:** ${node.keywords.slice(0, 8).join(', ')}\n\n`;
    }

    // Examples
    if (node.examples.length > 0) {
      section += `**Common Patterns:**\n`;
      node.examples.slice(0, 2).forEach(example => {
        section += `- **${example.name}**: ${example.description}\n`;
        section += `  \`\`\`json\n  ${JSON.stringify(example.config, null, 2)}\n  \`\`\`\n`;
      });
      section += '\n';
    }

    return section;
  }

  /**
   * Generate requirements matrix
   */
  private generateRequirementsMatrix(nodes: NodeReference[]): string {
    let matrix = '## 📋 COMPLETE NODE REQUIREMENTS MATRIX\n\n';
    matrix += '| Node Type | Required Configs | Credentials | Inputs | Outputs | Category |\n';
    matrix += '|-----------|------------------|-------------|--------|---------|----------|\n';

    nodes.forEach(node => {
      const configs = node.requiredConfigs.length > 0 
        ? node.requiredConfigs.slice(0, 3).join(', ') + (node.requiredConfigs.length > 3 ? '...' : '')
        : 'None';
      
      const creds = node.credentials.length > 0
        ? node.credentials.map(c => c.type).join(', ')
        : 'None ✅';
      
      const inputs = node.inputs.length > 0 ? node.inputs.join(', ') : '-';
      const outputs = node.outputs.join(', ');

      matrix += `| \`${node.type}\` | ${configs} | ${creds} | ${inputs} | ${outputs} | ${node.category} |\n`;
    });

    return matrix;
  }

  /**
   * Get reference for specific node
   */
  getNodeReference(nodeType: string): NodeReference | null {
    if (this.referenceCache.has(nodeType)) {
      return this.referenceCache.get(nodeType)!;
    }

    // Build cache if empty
    if (this.referenceCache.size === 0) {
      this.generateComprehensiveReference();
    }

    return this.referenceCache.get(nodeType) || null;
  }

  /**
   * Get all node references
   */
  getAllNodeReferences(): NodeReference[] {
    if (this.referenceCache.size === 0) {
      this.generateComprehensiveReference();
    }
    return Array.from(this.referenceCache.values());
  }
}

// Export singleton
export const enhancedNodeReference = new EnhancedNodeReference();
