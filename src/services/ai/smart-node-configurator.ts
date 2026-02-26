// Smart Node Configurator
// Intelligently configures nodes with credentials based on analysis

import { WorkflowNode } from '../../core/types/ai-types';
import { CredentialAnalysis, CredentialNeed } from './node-credential-analyzer';
import { AuthProvider } from '../auth/auth-provider';

/**
 * SmartNodeConfigurator - Configures nodes with credentials intelligently
 */
export class SmartNodeConfigurator {
  constructor(private authProvider: AuthProvider) {}

  /**
   * Configure node with credentials based on analysis
   */
  async configureNodeWithCredentials(
    node: WorkflowNode,
    credentialAnalysis: CredentialAnalysis,
    userAnswers: Record<string, string>
  ): Promise<WorkflowNode> {
    const nodeType = node.data?.type || node.type;
    if (!nodeType) return node;

    const updatedConfig = { ...(node.data?.config || {}) };

    // Find credential fields for this node
    const nodeCredentials = credentialAnalysis.requiredCredentials
      .concat(credentialAnalysis.optionalCredentials)
      .filter(cred => cred.nodeType === nodeType && cred.nodeId === node.id);

    for (const credential of nodeCredentials) {
      const field = credential.field;

      // CASE 1: Already covered by existing auth
      const existingAuth = credentialAnalysis.existingAuthCoverage.find(
        c => c.nodeType === nodeType && c.field === field && c.nodeId === node.id
      );

      if (existingAuth) {
        updatedConfig[field] = this.generateAuthTemplate(existingAuth);
        continue;
      }

      // CASE 2: Can be auto-resolved
      const autoResolvable = credentialAnalysis.autoResolvable.find(
        c => c.nodeType === nodeType && c.field === field && c.nodeId === node.id
      );

      if (autoResolvable) {
        updatedConfig[field] = await this.autoResolveCredential(autoResolvable);
        continue;
      }

      // CASE 3: Provided by user
      const userAnswer = userAnswers[`${nodeType}.${field}`] ||
                         userAnswers[`${node.id}.${field}`] ||
                         userAnswers[field] ||
                         userAnswers[credential.fieldName];

      if (userAnswer) {
        updatedConfig[field] = userAnswer;
      } else if (credential.isRequired) {
        // Should not happen if credential analysis was correct
        console.warn(`Missing required credential: ${nodeType}.${field} for node ${node.id}`);
        // Use placeholder
        updatedConfig[field] = `{{CREDENTIAL.${field.toUpperCase()}}}`;
      }
    }

    // Special handling for email nodes
    if (nodeType === 'email' || nodeType === 'google_gmail') {
      const emailConfig = await this.configureEmailNode(
        nodeType,
        updatedConfig,
        credentialAnalysis,
        userAnswers
      );
      Object.assign(updatedConfig, emailConfig);
    }

    return {
      ...node,
      data: {
        ...node.data,
        config: updatedConfig,
      },
    };
  }

  /**
   * Configure email node with smart auth method selection
   */
  private async configureEmailNode(
    nodeType: string,
    config: Record<string, any>,
    credentialAnalysis: CredentialAnalysis,
    userAnswers: Record<string, string>
  ): Promise<Record<string, any>> {
    const updatedConfig = { ...config };

    // Check if Google OAuth is available and preferred
    const hasGoogleOAuth = credentialAnalysis.existingAuthCoverage.some(
      c => c.credentialType === 'google_oauth' || c.credentialType === 'email_smtp'
    );

    const prefersSMTP = userAnswers.email_auth_method === 'smtp' ||
                       userAnswers.auth_method === 'smtp';

    if (nodeType === 'google_gmail') {
      // STRICT CONNECTOR ISOLATION: Gmail node ONLY uses OAuth
      // Never fall back to SMTP - this violates connector isolation
      updatedConfig.auth_method = 'oauth2';
      updatedConfig.service = 'gmail';
      updatedConfig.use_oauth = true;

      // Remove SMTP fields - Gmail never uses SMTP
      delete updatedConfig.smtp_host;
      delete updatedConfig.smtp_port;
      delete updatedConfig.smtp_username;
      delete updatedConfig.smtp_password;
    } else if (nodeType === 'email') {
      // STRICT CONNECTOR ISOLATION: Generic email node uses SMTP only
      // Never patch Google OAuth into generic email nodes
      // If user wants Gmail, they should use google_gmail node
      // This node is for SMTP only
      updatedConfig.auth_method = 'smtp';
      updatedConfig.use_oauth = false;
    }

    return updatedConfig;
  }

  /**
   * Generate auth template for existing auth
   */
  private generateAuthTemplate(credential: CredentialNeed): string {
    switch (credential.credentialType) {
      case 'google_oauth':
        return '{{GOOGLE_OAUTH_TOKEN}}';
      case 'email_smtp':
        return '{{SMTP_CREDENTIALS}}';
      case 'ai_api_key':
        return '{{AI_API_KEY}}';
      case 'slack_token':
        return '{{SLACK_BOT_TOKEN}}';
      default:
        return `{{CREDENTIAL.${credential.field.toUpperCase()}}}`;
    }
  }

  /**
   * Auto-resolve credential from alternatives
   */
  private async autoResolveCredential(credential: CredentialNeed): Promise<string> {
    // Check alternatives for auto-configure option
    const autoAlternative = credential.alternatives.find(alt => alt.autoConfigure);

    if (autoAlternative) {
      switch (autoAlternative.type) {
        case 'google_oauth':
          return '{{GOOGLE_OAUTH_TOKEN}}';
        case 'environment_variable':
          return `{{ENV.${autoAlternative.envVar}}}`;
        case 'oauth2':
          return '{{OAUTH2_TOKEN}}';
        default:
          return `{{AUTO.${credential.field.toUpperCase()}}}`;
      }
    }

    // Fallback
    return `{{AUTO.${credential.field.toUpperCase()}}}`;
  }
}
