// Intent Classification Layer
// Classifies user prompts into workflow types before generation

export type WorkflowIntent = 
  | 'read_workflow'      // Read data from source
  | 'write_workflow'     // Write data to destination
  | 'sync_workflow'      // Sync data between sources
  | 'automation_workflow' // Automated task execution
  | 'conditional_workflow' // Conditional logic workflow
  | 'ai_workflow'        // AI-powered workflow
  | 'ambiguous';         // Needs clarification

export interface IntentClassification {
  intent: WorkflowIntent;
  confidence: number;
  requiresClarification: boolean;
  suggestedClarification?: string;
  minimalSafeStructure?: {
    trigger: string;
    steps: Array<{ type: string; description: string }>;
  };
}

export class IntentClassifier {
  /**
   * Classify user prompt into workflow intent
   */
  classifyIntent(userPrompt: string): IntentClassification {
    const promptLower = userPrompt.toLowerCase().trim();
    
    // Check for explicit read patterns
    if (this.isReadWorkflow(promptLower)) {
      return {
        intent: 'read_workflow',
        confidence: 0.9,
        requiresClarification: false
      };
    }
    
    // Check for explicit write patterns
    if (this.isWriteWorkflow(promptLower)) {
      return {
        intent: 'write_workflow',
        confidence: 0.9,
        requiresClarification: false
      };
    }
    
    // Check for sync patterns
    if (this.isSyncWorkflow(promptLower)) {
      return {
        intent: 'sync_workflow',
        confidence: 0.85,
        requiresClarification: false
      };
    }
    
    // Check for conditional patterns
    if (this.isConditionalWorkflow(promptLower)) {
      return {
        intent: 'conditional_workflow',
        confidence: 0.9,
        requiresClarification: false
      };
    }
    
    // Check for AI patterns
    if (this.isAIWorkflow(promptLower)) {
      return {
        intent: 'ai_workflow',
        confidence: 0.85,
        requiresClarification: false
      };
    }
    
    // Check for automation patterns
    if (this.isAutomationWorkflow(promptLower)) {
      return {
        intent: 'automation_workflow',
        confidence: 0.8,
        requiresClarification: false
      };
    }
    
    // Vague prompts - needs clarification or minimal safe structure
    if (this.isVaguePrompt(promptLower)) {
      const minimalStructure = this.generateMinimalSafeStructure(promptLower);
      return {
        intent: 'ambiguous',
        confidence: 0.3,
        requiresClarification: true,
        suggestedClarification: this.generateClarificationQuestion(promptLower),
        minimalSafeStructure: minimalStructure
      };
    }
    
    // Default to automation
    return {
      intent: 'automation_workflow',
      confidence: 0.6,
      requiresClarification: false
    };
  }
  
  private isReadWorkflow(prompt: string): boolean {
    const readKeywords = [
      'read', 'get', 'fetch', 'retrieve', 'extract', 'download',
      'read from', 'get from', 'fetch from', 'extract from',
      'show', 'display', 'list', 'view'
    ];
    return readKeywords.some(keyword => prompt.includes(keyword));
  }
  
  private isWriteWorkflow(prompt: string): boolean {
    const writeKeywords = [
      'create', 'add', 'save', 'store', 'write', 'insert', 'post',
      'create in', 'add to', 'save to', 'store in', 'write to',
      'send', 'notify', 'email', 'message'
    ];
    return writeKeywords.some(keyword => prompt.includes(keyword));
  }
  
  private isSyncWorkflow(prompt: string): boolean {
    const syncKeywords = [
      'sync', 'synchronize', 'copy', 'transfer', 'move',
      'from X to Y', 'from X and Y', 'between', 'and also',
      'extract from X and create in Y', 'get from X and store in Y'
    ];
    return syncKeywords.some(keyword => prompt.includes(keyword));
  }
  
  private isConditionalWorkflow(prompt: string): boolean {
    const conditionalPatterns = [
      /\bif\s+(.+?)\s+then\b/i,
      /\bif\s+(.+?)\s+else\b/i,
      /\bcheck\s+if\b/i,
      /\bwhen\s+(.+?)\s+then\b/i,
      /\bonly\s+if\b/i,
      /\bunless\b/i,
      /\bgreater\s+than\b/i,
      /\bless\s+than\b/i,
      /\bage\s+(is|>|>=|<|<=|greater|less)/i
    ];
    return conditionalPatterns.some(pattern => pattern.test(prompt));
  }
  
  private isAIWorkflow(prompt: string): boolean {
    const aiKeywords = [
      'ai agent', 'ai assistant', 'chatbot', 'llm', 'analyze',
      'summarize', 'generate', 'ai-powered', 'using ai'
    ];
    return aiKeywords.some(keyword => prompt.includes(keyword));
  }
  
  private isAutomationWorkflow(prompt: string): boolean {
    const automationKeywords = [
      'automate', 'automatic', 'schedule', 'daily', 'weekly',
      'hourly', 'recurring', 'trigger', 'when'
    ];
    return automationKeywords.some(keyword => prompt.includes(keyword));
  }
  
  private isVaguePrompt(prompt: string): boolean {
    // Vague prompts are short, lack specific actions, or are too generic
    const vaguePatterns = [
      /^create\s+(crm|sales|hr)\s+agent/i,  // "create crm agent"
      /^setup\s+(workflow|automation)/i,     // "setup workflow"
      /^make\s+(something|it)/i,             // "make something"
      /^(workflow|automation)$/i             // Just "workflow"
    ];
    
    // Also check if prompt is too short (< 3 words) and lacks action verbs
    const words = prompt.split(/\s+/).filter(w => w.length > 0);
    const isTooShort = words.length < 3;
    const hasActionVerb = /(create|read|write|send|get|fetch|extract|sync|automate)/i.test(prompt);
    
    return vaguePatterns.some(pattern => pattern.test(prompt)) || 
           (isTooShort && !hasActionVerb);
  }
  
  private generateClarificationQuestion(prompt: string): string {
    if (prompt.includes('crm')) {
      return 'What should the CRM agent do? For example: "Create contacts from form submissions" or "Sync leads from Google Sheets to HubSpot"';
    }
    if (prompt.includes('sales')) {
      return 'What sales task should be automated? For example: "Send follow-up emails to new leads" or "Update deal status in CRM"';
    }
    if (prompt.includes('hr')) {
      return 'What HR task should be automated? For example: "Send onboarding emails to new hires" or "Schedule interviews for candidates"';
    }
    return 'Could you provide more details? What should this workflow do? What data should it process? Where should results go?';
  }
  
  private generateMinimalSafeStructure(prompt: string): {
    trigger: string;
    steps: Array<{ type: string; description: string }>;
  } {
    const promptLower = prompt.toLowerCase();
    
    // Determine trigger
    let trigger = 'manual_trigger';
    if (promptLower.includes('schedule') || promptLower.includes('daily') || 
        promptLower.includes('weekly') || promptLower.includes('hourly')) {
      trigger = 'schedule';
    } else if (promptLower.includes('form') || promptLower.includes('submit')) {
      trigger = 'form';
    } else if (promptLower.includes('webhook') || promptLower.includes('api')) {
      trigger = 'webhook';
    }
    
    // Determine minimal safe node
    const steps: Array<{ type: string; description: string }> = [];
    
    // 🚨 CRITICAL: Detect "sales agent" as requiring CRM
    if (promptLower.includes('crm') || promptLower.includes('sales agent') || promptLower.includes('sales automation')) {
      // Detect which CRM platform is mentioned
      let crmType = 'hubspot'; // Default
      if (promptLower.includes('zoho')) {
        crmType = 'zoho_crm';
      } else if (promptLower.includes('salesforce') || promptLower.includes('sf')) {
        crmType = 'salesforce';
      } else if (promptLower.includes('pipedrive')) {
        crmType = 'pipedrive';
      } else if (promptLower.includes('hubspot')) {
        crmType = 'hubspot';
      }
      
      steps.push({
        type: crmType,
        description: 'CRM operation'
      });
    } else if (promptLower.includes('email') || promptLower.includes('gmail')) {
      steps.push({
        type: 'google_gmail',
        description: 'Send email'
      });
    } else if (promptLower.includes('slack')) {
      steps.push({
        type: 'slack_message',
        description: 'Send Slack notification'
      });
    } else {
      // Generic safe node
      steps.push({
        type: 'log_output',
        description: 'Process data'
      });
    }
    
    return { trigger, steps };
  }
}

export const intentClassifier = new IntentClassifier();
