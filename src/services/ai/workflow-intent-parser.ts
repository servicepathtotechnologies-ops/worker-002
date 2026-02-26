/**
 * Workflow Intent Parser
 * Parses natural language prompts into structured workflow intent
 */

export interface WorkflowIntent {
  trigger?: string;
  action?: string;
  platform?: string;
  schedule?: string;
  content_type?: string;
  data_format?: string;
  destination?: string;
  [key: string]: any;
}

/**
 * Workflow Intent Parser
 * Extracts machine-readable intent from natural language
 */
export class WorkflowIntentParser {
  /**
   * Parse user prompt into structured intent
   */
  async parse(userPrompt: string): Promise<WorkflowIntent | null> {
    const intent: WorkflowIntent = {};
    const lowerPrompt = userPrompt.toLowerCase();

    // Extract trigger type
    intent.trigger = this.extractTrigger(lowerPrompt);

    // Extract action type
    intent.action = this.extractAction(lowerPrompt);

    // Extract platform
    intent.platform = this.extractPlatform(lowerPrompt);

    // Extract schedule
    intent.schedule = this.extractSchedule(userPrompt);

    // Extract content type
    intent.content_type = this.extractContentType(lowerPrompt);

    // Extract data format
    intent.data_format = this.extractDataFormat(lowerPrompt);

    // Extract destination
    intent.destination = this.extractDestination(lowerPrompt);

    // If no trigger found, return null (needs clarification)
    if (!intent.trigger && !intent.action) {
      return null;
    }

    return intent;
  }

  /**
   * Extract trigger type from prompt
   */
  private extractTrigger(prompt: string): string | undefined {
    if (prompt.includes('schedule') || prompt.includes('daily') || 
        prompt.includes('hourly') || prompt.includes('weekly') ||
        prompt.includes('every') || prompt.includes('at ') ||
        prompt.match(/\d+\s*(am|pm)/i)) {
      return 'schedule';
    }

    if (prompt.includes('form') || prompt.includes('submit') || 
        prompt.includes('submission')) {
      return 'form';
    }

    if (prompt.includes('webhook') || prompt.includes('http request') ||
        prompt.includes('api call')) {
      return 'webhook';
    }

    if (prompt.includes('manual') || prompt.includes('when i') ||
        prompt.includes('on demand')) {
      return 'manual_trigger';
    }

    return undefined;
  }

  /**
   * Extract action type from prompt
   */
  private extractAction(prompt: string): string | undefined {
    if (prompt.includes('send') || prompt.includes('post') ||
        prompt.includes('message')) {
      return 'send';
    }

    if (prompt.includes('sync') || prompt.includes('synchronize')) {
      return 'sync';
    }

    if (prompt.includes('save') || prompt.includes('store') ||
        prompt.includes('write')) {
      return 'write';
    }

    if (prompt.includes('read') || prompt.includes('fetch') ||
        prompt.includes('get')) {
      return 'read';
    }

    if (prompt.includes('analyze') || prompt.includes('process') ||
        prompt.includes('transform')) {
      return 'process';
    }

    return undefined;
  }

  /**
   * Extract platform from prompt
   */
  private extractPlatform(prompt: string): string | undefined {
    const platforms = [
      'slack', 'email', 'gmail', 'discord', 'telegram',
      'linkedin', 'twitter', 'instagram', 'facebook',
      'google_sheets', 'google_doc', 'google_drive',
      'database', 'supabase', 'postgresql', 'mysql'
    ];

    for (const platform of platforms) {
      if (prompt.includes(platform)) {
        return platform;
      }
    }

    return undefined;
  }

  /**
   * Extract schedule information
   */
  private extractSchedule(prompt: string): string | undefined {
    // Look for time patterns
    const timePattern = prompt.match(/(\d{1,2})\s*(am|pm|:)/i);
    if (timePattern) {
      return prompt.substring(Math.max(0, prompt.toLowerCase().indexOf('daily') - 20),
                             Math.min(prompt.length, prompt.toLowerCase().indexOf('daily') + 50));
    }

    if (prompt.includes('daily') || prompt.includes('every day')) {
      return 'daily';
    }

    if (prompt.includes('hourly') || prompt.includes('every hour')) {
      return 'hourly';
    }

    if (prompt.includes('weekly') || prompt.includes('every week')) {
      return 'weekly';
    }

    return undefined;
  }

  /**
   * Extract content type
   */
  private extractContentType(prompt: string): string | undefined {
    if (prompt.includes('message') || prompt.includes('text')) {
      return 'text';
    }

    if (prompt.includes('email')) {
      return 'email';
    }

    if (prompt.includes('report') || prompt.includes('summary')) {
      return 'report';
    }

    if (prompt.includes('notification')) {
      return 'notification';
    }

    return undefined;
  }

  /**
   * Extract data format
   */
  private extractDataFormat(prompt: string): string | undefined {
    if (prompt.includes('json')) {
      return 'json';
    }

    if (prompt.includes('csv')) {
      return 'csv';
    }

    if (prompt.includes('xml')) {
      return 'xml';
    }

    return undefined;
  }

  /**
   * Extract destination
   */
  private extractDestination(prompt: string): string | undefined {
    const destinations = [
      'slack', 'email', 'discord', 'telegram',
      'database', 'sheets', 'drive'
    ];

    for (const dest of destinations) {
      if (prompt.includes(dest)) {
        return dest;
      }
    }

    return undefined;
  }
}
