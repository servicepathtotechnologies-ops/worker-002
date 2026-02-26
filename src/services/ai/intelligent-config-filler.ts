/**
 * Intelligent Configuration Filler
 * 
 * Uses AI to analyze the prompt and intelligently fill in node configurations
 * based on the user's requirements. This prevents asking users for information
 * that can be inferred from the prompt.
 */

import { WorkflowNode } from '../../core/types/ai-types';
import { nodeLibrary } from '../nodes/node-library';
import { ollamaOrchestrator } from './ollama-orchestrator';

interface Workflow {
  nodes: WorkflowNode[];
  edges: any[];
}

export class IntelligentConfigFiller {
  /**
   * Fill node configurations intelligently based on prompt analysis
   */
  async fillConfigurationsFromPrompt(
    workflow: Workflow,
    enhancedPrompt: string,
    originalPrompt: string
  ): Promise<Workflow> {
    const updatedNodes = await Promise.all(
      workflow.nodes.map(async (node) => {
        const nodeType = node.data?.type || node.type;
        if (!nodeType || nodeType === 'custom') {
          return node;
        }

        // Get node schema to understand what fields need configuration
        const schema = nodeLibrary.getSchema(nodeType);
        if (!schema) {
          return node;
        }

        // Analyze prompt to fill in intelligent defaults for this node
        const intelligentConfig = await this.analyzeAndFillConfig(
          node,
          nodeType,
          schema,
          enhancedPrompt,
          originalPrompt,
          workflow
        );

        // Merge intelligent config with existing config
        const existingConfig = node.data?.config || {};
        const mergedConfig = {
          ...existingConfig,
          ...intelligentConfig,
        };

        return {
          ...node,
          data: {
            ...node.data,
            config: mergedConfig,
          },
        };
      })
    );

    return {
      ...workflow,
      nodes: updatedNodes,
    };
  }

  /**
   * Analyze prompt and fill configuration for a specific node
   */
  private async analyzeAndFillConfig(
    node: WorkflowNode,
    nodeType: string,
    schema: any,
    enhancedPrompt: string,
    originalPrompt: string,
    workflow: Workflow
  ): Promise<Record<string, any>> {
    const config: Record<string, any> = {};
    const existingConfig = node.data?.config || {};

    // Node-specific intelligent filling
    switch (nodeType) {
      case 'google_gmail':
        return this.fillGmailConfig(node, enhancedPrompt, originalPrompt, existingConfig);
      
      case 'slack_message':
        return this.fillSlackConfig(node, enhancedPrompt, originalPrompt, existingConfig);
      
      case 'ollama_chat':
      case 'ai_agent':
        return this.fillAIConfig(node, enhancedPrompt, originalPrompt, existingConfig);
      
      case 'form':
        return this.fillFormConfig(node, enhancedPrompt, originalPrompt, existingConfig);
      
      default:
        // For other nodes, try to infer from prompt
        return this.fillGenericConfig(node, nodeType, enhancedPrompt, originalPrompt, existingConfig);
    }
  }

  /**
   * Fill Gmail node configuration intelligently
   */
  private fillGmailConfig(
    node: WorkflowNode,
    enhancedPrompt: string,
    originalPrompt: string,
    existingConfig: Record<string, any>
  ): Record<string, any> {
    const config: Record<string, any> = {};
    const promptLower = (enhancedPrompt + ' ' + originalPrompt).toLowerCase();

    // Infer operation from prompt
    if (!existingConfig.operation) {
      if (promptLower.includes('send') || promptLower.includes('email') || promptLower.includes('gmail')) {
        config.operation = 'send';
      } else {
        config.operation = 'send'; // Default for Gmail
      }
    }

    // Infer subject from prompt
    if (!existingConfig.subject) {
      if (promptLower.includes('thank you') || promptLower.includes('thank')) {
        config.subject = "Thank you for contacting us";
      } else if (promptLower.includes('confirmation')) {
        config.subject = "Confirmation";
      } else if (promptLower.includes('notification')) {
        config.subject = "Notification";
      } else {
        config.subject = "Message from workflow";
      }
    }

    // Infer body from prompt
    if (!existingConfig.body) {
      if (promptLower.includes('thank you')) {
        config.body = "Dear {{form.submission_data.name || 'Valued Customer'}},\n\nThank you for contacting us! We have received your message and will get back to you soon.\n\nBest regards,\nThe Team";
      } else if (promptLower.includes('confirmation')) {
        config.body = "This is a confirmation message.";
      } else {
        // Use template variable for dynamic content
        config.body = "{{form.submission_data.message || 'Your message has been received.'}}";
      }
    }

    // Infer 'to' from prompt context
    if (!existingConfig.to) {
      // Check if there's a form or previous node that provides email
      config.to = "{{form.submission_data.email || trigger.output.email || input.email}}";
    }

    return config;
  }

  /**
   * Fill Slack node configuration intelligently
   */
  private fillSlackConfig(
    node: WorkflowNode,
    enhancedPrompt: string,
    originalPrompt: string,
    existingConfig: Record<string, any>
  ): Record<string, any> {
    const config: Record<string, any> = {};
    const promptLower = (enhancedPrompt + ' ' + originalPrompt).toLowerCase();

    // Infer channel from prompt
    if (!existingConfig.channel) {
      if (promptLower.includes('team')) {
        config.channel = "#team";
      } else if (promptLower.includes('contact') || promptLower.includes('form')) {
        config.channel = "#contact-form-submissions";
      } else if (promptLower.includes('notification')) {
        config.channel = "#notifications";
      } else {
        config.channel = "#general";
      }
    }

    // Infer message from prompt
    if (!existingConfig.text && !existingConfig.message) {
      if (promptLower.includes('form submission') || promptLower.includes('contact form')) {
        config.text = "New contact form submission:\n\nName: {{form.submission_data.name}}\nEmail: {{form.submission_data.email}}\nMessage: {{form.submission_data.message}}";
      } else if (promptLower.includes('notify') || promptLower.includes('alert')) {
        config.text = "Notification: {{trigger.output.message || 'Workflow executed'}}";
      } else {
        config.text = "{{trigger.output.message || 'Workflow notification'}}";
      }
    }

    return config;
  }

  /**
   * Fill AI node configuration intelligently
   */
  private fillAIConfig(
    node: WorkflowNode,
    enhancedPrompt: string,
    originalPrompt: string,
    existingConfig: Record<string, any>
  ): Record<string, any> {
    const config: Record<string, any> = {};
    const promptLower = (enhancedPrompt + ' ' + originalPrompt).toLowerCase();

    // Infer system prompt from workflow goal
    if (!existingConfig.systemPrompt) {
      if (promptLower.includes('spam') || promptLower.includes('detect')) {
        config.systemPrompt = "You are a spam detection system. Analyze the provided content and classify it as 'spam' or 'not_spam'. Respond with ONLY the classification word.";
      } else if (promptLower.includes('classify')) {
        config.systemPrompt = "You are a classification system. Analyze the provided content and classify it appropriately.";
      } else {
        config.systemPrompt = "You are a helpful AI assistant that processes the input and provides useful responses.";
      }
    }

    // Infer prompt from context
    if (!existingConfig.prompt) {
      if (promptLower.includes('spam')) {
        config.prompt = "Classify this content as 'spam' or 'not_spam':\n\n{{form.submission_data.message || input.message}}";
      } else {
        config.prompt = "{{input.message || input.data || 'Process this request'}}";
      }
    }

    return config;
  }

  /**
   * Fill form node configuration intelligently
   */
  private fillFormConfig(
    node: WorkflowNode,
    enhancedPrompt: string,
    originalPrompt: string,
    existingConfig: Record<string, any>
  ): Record<string, any> {
    const config: Record<string, any> = {};
    const promptLower = (enhancedPrompt + ' ' + originalPrompt).toLowerCase();

    // Infer form title
    if (!existingConfig.formTitle) {
      if (promptLower.includes('contact')) {
        config.formTitle = "Contact Us Form";
      } else if (promptLower.includes('feedback')) {
        config.formTitle = "Feedback Form";
      } else {
        config.formTitle = "Form Submission";
      }
    }

    // Infer form fields from prompt context
    if (!existingConfig.fields || (Array.isArray(existingConfig.fields) && existingConfig.fields.length === 0)) {
      const fields: any[] = [];
      
      // Always add name if mentioned
      if (promptLower.includes('name')) {
        fields.push({
          key: 'name',
          label: 'Name',
          type: 'text',
          required: true,
          placeholder: 'Your name'
        });
      }
      
      // Always add email if mentioned or if sending email
      if (promptLower.includes('email') || promptLower.includes('gmail') || promptLower.includes('send')) {
        fields.push({
          key: 'email',
          label: 'Email',
          type: 'email',
          required: true,
          placeholder: 'your@email.com'
        });
      }
      
      // Add message if mentioned
      if (promptLower.includes('message')) {
        fields.push({
          key: 'message',
          label: 'Message',
          type: 'textarea',
          required: true,
          placeholder: 'Your message'
        });
      }

      if (fields.length > 0) {
        config.fields = fields;
      }
    }

    return config;
  }

  /**
   * Fill generic node configuration intelligently
   */
  private fillGenericConfig(
    node: WorkflowNode,
    nodeType: string,
    enhancedPrompt: string,
    originalPrompt: string,
    existingConfig: Record<string, any>
  ): Record<string, any> {
    // For generic nodes, try to infer common fields
    const config: Record<string, any> = {};
    const promptLower = (enhancedPrompt + ' ' + originalPrompt).toLowerCase();

    // Common pattern: if node has a "message" or "text" field, try to infer it
    if (!existingConfig.message && !existingConfig.text) {
      if (promptLower.includes('notify') || promptLower.includes('alert')) {
        config.message = "{{trigger.output.message || 'Notification'}}";
      }
    }

    return config;
  }
}

export const intelligentConfigFiller = new IntelligentConfigFiller();
