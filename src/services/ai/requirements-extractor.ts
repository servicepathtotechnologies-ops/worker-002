// Requirements Extractor Service
// Step 4: Extract technical requirements from refined prompt
// Uses Llama 3.1:8B to extract URLs, APIs, credentials, schedules, etc.

import { ollamaOrchestrator } from './ollama-orchestrator';
import { Requirements } from '../../core/types/ai-types';
import { config } from '../../core/config';

import { DataTransformation, InputOutputMapping } from '../../core/types/ai-types';

export interface ExtractedRequirements extends Requirements {
  // Extended requirements
  urls: string[];
  apis: string[];
  credentials: string[];
  schedules: string[];
  platforms: string[];
  dataFormats: string[];
  errorHandling: string[];
  notifications: string[];
  // Data transformation requirements
  dataTransformations?: DataTransformation[];
  inputOutputMappings?: InputOutputMapping[];
}

/**
 * RequirementsExtractor - Step 4: Extract Technical Requirements
 * 
 * Extracts technical requirements from user prompt and answers:
 * - URLs and API endpoints
 * - Required credentials
 * - Schedule information
 * - Data formats
 * - Error handling preferences
 * - Notification requirements
 */
export class RequirementsExtractor {
  private readonly model = this.getModel();
  
  private getModel(): string {
    // Use fine-tuned model if enabled and available
    if (process.env.USE_FINE_TUNED_MODEL === 'true') {
      const fineTunedModel = process.env.FINE_TUNED_MODEL || 'ctrlchecks-workflow-builder';
      return fineTunedModel;
    }
    return 'qwen2.5:14b-instruct-q4_K_M';
  }

  /**
   * Check if Ollama is configured and available
   * If Ollama is available, we don't need external API keys like GEMINI_API_KEY
   */
  private isOllamaConfigured(): boolean {
    return !!(config.ollamaHost && config.ollamaHost.trim().length > 0);
  }

  /**
   * Extract workflow requirements from refined prompt
   */
  async extractRequirements(
    userPrompt: string,
    systemPrompt: string,
    answers?: Record<string, string>,
    constraints?: any
  ): Promise<ExtractedRequirements> {
    console.log(`📋 Extracting requirements from: "${systemPrompt}"`);

    const extractionPrompt = this.buildExtractionPrompt(
      userPrompt,
      systemPrompt,
      answers,
      constraints
    );

    try {
      const response = await ollamaOrchestrator.processRequest(
        'workflow-analysis',
        {
          system: this.buildSystemPrompt(),
          message: extractionPrompt,
        },
        {
          temperature: 0.3, // Lower temperature for more accurate extraction
          max_tokens: 2000,
          cache: false,
        }
      );

      const requirements = this.parseRequirementsResponse(response, systemPrompt, answers);
      
      // Extract data transformation requirements
      const dataTransformations = this.extractDataTransformRequirements(userPrompt, systemPrompt);
      const inputOutputMappings = this.extractInputOutputMappings(userPrompt, systemPrompt);
      
      return {
        ...requirements,
        dataTransformations,
        inputOutputMappings,
      };
    } catch (error) {
      // CRITICAL: Check if error is due to missing models
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isModelUnavailable = errorMessage.includes('not found') || 
                                 errorMessage.includes('Ollama models not available') ||
                                 errorMessage.includes('404') && errorMessage.includes('model');
      
      if (isModelUnavailable) {
        console.warn('⚠️  [RequirementsExtractor] Ollama models not available, using rule-based fallback');
      } else {
        console.error('❌ Error extracting requirements:', error);
      }
      
      const fallback = this.generateFallbackRequirements(systemPrompt);
      return {
        ...fallback,
        dataTransformations: [],
        inputOutputMappings: [],
      };
    }
  }

  /**
   * Build system prompt for requirements extraction
   */
  private buildSystemPrompt(): string {
    return `You are an expert Requirements Extraction Agent. Your role is to extract technical requirements from workflow descriptions.

Your task:
1. Identify all URLs, API endpoints, and service URLs
2. Identify required credentials and authentication methods
3. Extract schedule information (cron expressions, frequencies)
4. Identify data formats and structures
5. Extract error handling requirements
6. Identify notification needs
7. Determine platform/service integrations

Return structured JSON with all extracted requirements.`;
  }

  /**
   * Build extraction prompt
   */
  private buildExtractionPrompt(
    userPrompt: string,
    systemPrompt: string,
    answers?: Record<string, string>,
    constraints?: any
  ): string {
    let prompt = `Extract technical requirements from this workflow description:

System Prompt (Understanding): "${systemPrompt}"
Original User Prompt: "${userPrompt}"

`;

    // Add answers if available
    if (answers && Object.keys(answers).length > 0) {
      prompt += `User Answers to Questions:\n`;
      Object.entries(answers).forEach(([questionId, answer]) => {
        prompt += `  ${questionId}: ${answer}\n`;
      });
      prompt += '\n';
    }

    // Add constraints if available
    if (constraints) {
      prompt += `Constraints: ${JSON.stringify(constraints, null, 2)}\n\n`;
    }

    prompt += `Extract the following requirements:

CRITICAL: Extract SPECIFIC data fields mentioned in the prompt. For example:
- If prompt mentions "age" → extract "age" as input field
- If prompt mentions "amount" → extract "amount" as input field
- If prompt mentions "email" → extract "email" as input field
- Identify ALL specific data fields that need to be extracted

CRITICAL: Extract SPECIFIC logic requirements:
- If prompt mentions comparison (>=, <, ==, etc.) → extract the exact condition
- If prompt mentions calculation → extract the calculation type
- If prompt mentions validation → extract validation rules
- Identify thresholds, constants, and reference values

IMPORTANT: If user answers are provided, ONLY extract credentials for services that the user has SELECTED in their answers.
For example, if user selected "OpenAI GPT" in their answers, extract "OpenAI API Key" but NOT "Anthropic API Key" or "Gemini API Key".

CRITICAL: If the workflow uses AI Agent nodes or AI-generated content (detected from answers like "AI-generated content", "AI-generated", etc.), use Ollama - no API keys needed since AI Agent nodes use Ollama models.

IMPORTANT: Do NOT extract "Google OAuth" credentials. Google services (Sheets, Gmail, Drive) are pre-connected via OAuth and do not require additional credentials. Only extract credentials that are NOT pre-connected.

1. URLs & API Endpoints:
   - Any URLs mentioned (API endpoints, webhooks, services)
   - Extract from text or infer from service names
   - Format: ["https://api.example.com", "https://webhook.example.com"]

2. APIs & Services:
   - Service names based on user selections (if answers provided) or from prompt
   - Only include services that user has explicitly selected
   - API types (REST, GraphQL, Webhook)
   - Format: ["OpenAI API", "Slack API", "Google Sheets API"]

3. Credentials Required:
   - ONLY extract credentials for services that user has SELECTED
   - If user selected "OpenAI GPT" → extract "OpenAI API Key" only
   - If user selected "Slack" → extract "Slack Bot Token" only
   - DO NOT extract "Google OAuth" credentials - Google services (Sheets, Gmail, Drive) are pre-connected
   - Authentication methods needed for selected services only
   - Service credentials (API keys, OAuth, etc.)
   - Format: ["OpenAI API Key", "Slack Bot Token", "Database Credentials"]

4. Schedules:
   - Time-based triggers (daily, hourly, cron expressions)
   - Extract or infer cron expressions
   - Format: ["0 9 * * *", "*/30 * * * *"]

5. Data Formats:
   - Input/output data formats
   - File types, data structures
   - Format: ["JSON", "CSV", "XML"]

6. Error Handling:
   - Retry logic mentioned
   - Error notification preferences
   - Format: ["retry on failure", "send alert on error"]

7. Notifications:
   - Notification channels mentioned
   - Alert preferences
   - Format: ["email", "slack", "sms"]

8. Platforms:
   - Platforms/services to integrate with
   - Format: ["Twitter", "Slack", "PostgreSQL", "Supabase"]

Return JSON in this exact format:
{
  "primaryGoal": "Brief description of primary goal",
  "keySteps": ["step1", "step2", "step3"],
  "inputs": ["input1", "input2"],
  "outputs": ["output1", "output2"],
  "constraints": ["constraint1", "constraint2"],
  "complexity": "simple|medium|complex",
  "urls": ["url1", "url2"],
  "apis": ["api1", "api2"],
  "credentials": ["credential1", "credential2"],
  "schedules": ["cron1", "cron2"],
  "dataFormats": ["format1", "format2"],
  "errorHandling": ["handling1", "handling2"],
  "notifications": ["notification1", "notification2"],
  "platforms": ["platform1", "platform2"]
}`;

    return prompt;
  }

  /**
   * Parse AI response into ExtractedRequirements
   * COMPLETE FIX - Robust parsing with multiple fallbacks
   */
  private parseRequirementsResponse(
    response: any,
    systemPrompt: string,
    answers?: Record<string, string>
  ): ExtractedRequirements {
    try {
      // Step 1: Clean input data
      let content = typeof response === 'string' ? response : response.content || JSON.stringify(response);
      
      // Step 2: Extract with multiple fallbacks
      let parsed: any;
      
      // Method 1: Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch {
          // Continue to next method
        }
      }
      
      // Method 2: Try to find JSON object in the response
      if (!parsed) {
        const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          try {
            parsed = JSON.parse(jsonObjectMatch[0]);
          } catch {
            // Continue to next method
          }
        }
      }
      
      // Method 3: Try to fix common JSON issues
      if (!parsed) {
        try {
          // Fix unquoted property names
          const fixedContent = content.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
          // Remove trailing commas
          const noTrailingCommas = fixedContent.replace(/,(\s*[}\]])/g, '$1');
          parsed = JSON.parse(noTrailingCommas);
        } catch {
          // Continue to fallback
        }
      }
      
      // Method 4: Use rule-based extraction if all parsing fails
      if (!parsed) {
        console.warn('⚠️  Could not parse JSON, using rule-based extraction');
        return this.extractWithRules(systemPrompt, answers);
      }
      
      // Step 3: Validate and normalize parsed data
      parsed = this.normalizeParsedData(parsed);
      
      // Step 4: Add contextual information from answers
      if (answers) {
        parsed = this.enhanceWithAnswers(parsed, answers);
      }

      // Normalize credentials first and deduplicate
      const rawCredentials = this.normalizeArray(parsed.credentials);
      
      // Normalize credential names to avoid duplicates (e.g., SLACK_TOKEN vs SLACK_BOT_TOKEN)
      const normalizeCredentialName = (name: string): string => {
        const upper = name.toUpperCase();
        // Normalize Slack token variations to SLACK_BOT_TOKEN
        if (upper.includes('SLACK') && upper.includes('TOKEN') && !upper.includes('WEBHOOK')) {
          return 'SLACK_BOT_TOKEN';
        }
        // Normalize Slack webhook variations
        if (upper.includes('SLACK') && upper.includes('WEBHOOK')) {
          return 'SLACK_WEBHOOK_URL';
        }
        return upper;
      };
      
      // Deduplicate credentials using normalization
      const normalizedCreds = new Map<string, string>();
      rawCredentials.forEach((cred: string) => {
        const normalized = normalizeCredentialName(cred);
        if (!normalizedCreds.has(normalized)) {
          normalizedCreds.set(normalized, cred);
        }
      });
      
      const credentials = Array.from(normalizedCreds.values());
      
      // CRITICAL: Check if AI Agent/LLM functionality is needed and add Google Gemini API key
      // This ensures AI Agent nodes always have the required credential
      const systemPromptLower = systemPrompt.toLowerCase();
      // Safely extract answer values - handle both string and object values
      const answerValues = answers ? Object.values(answers).map(v => {
        if (typeof v === 'string') return v.toLowerCase();
        if (typeof v === 'object' && v !== null) {
          // If it's an object, try to stringify and lowercase
          try {
            return JSON.stringify(v).toLowerCase();
          } catch {
            return String(v).toLowerCase();
          }
        }
        return String(v).toLowerCase();
      }) : [];
      const answerTexts = answers ? Object.values(answers).map(v => {
        if (typeof v === 'string') return v;
        if (typeof v === 'object' && v !== null) {
          try {
            return JSON.stringify(v);
          } catch {
            return String(v);
          }
        }
        return String(v);
      }).join(' ').toLowerCase() : '';
      
      const hasAIFunctionality = 
        systemPromptLower.includes('ai agent') ||
        systemPromptLower.includes('ai assistant') ||
        systemPromptLower.includes('chatbot') ||
        systemPromptLower.includes('chat bot') ||
        systemPromptLower.includes('llm') ||
        systemPromptLower.includes('language model') ||
        systemPromptLower.includes('ai-generated') ||
        systemPromptLower.includes('ai generated') ||
        systemPromptLower.includes('ai-generated content') ||
        systemPromptLower.includes('generate') ||
        systemPromptLower.includes('analyze') ||
        systemPromptLower.includes('summarize') ||
        systemPromptLower.includes('classify') ||
        systemPromptLower.includes('sentiment') ||
        systemPromptLower.includes('intent') ||
        systemPromptLower.includes('natural language') ||
        systemPromptLower.includes('nlp') ||
        systemPromptLower.includes('text analysis') ||
        systemPromptLower.includes('content generation') ||
        systemPromptLower.includes('ai-powered') ||
        systemPromptLower.includes('ai powered') ||
        systemPromptLower.includes('using ai') ||
        systemPromptLower.includes('with ai') ||
        systemPromptLower.includes('ai model') ||
        answerTexts.includes('ai-generated') ||
        answerTexts.includes('ai generated') ||
        answerTexts.includes('ai-generated content') ||
        answerTexts.includes('ai content') ||
        answerValues.some(v => v.includes('ai-generated') || v.includes('ai generated'));
      
      // AI functionality uses Ollama - no external API keys needed
      if (hasAIFunctionality) {
        console.log('✅ AI functionality detected - using Ollama (no API key required)');
      }

      // Normalize and validate
      return {
        primaryGoal: parsed.primaryGoal || this.extractPrimaryGoal(systemPrompt),
        keySteps: Array.isArray(parsed.keySteps) ? parsed.keySteps : this.extractKeySteps(systemPrompt),
        inputs: Array.isArray(parsed.inputs) ? parsed.inputs : [],
        outputs: Array.isArray(parsed.outputs) ? parsed.outputs : [],
        constraints: Array.isArray(parsed.constraints) ? parsed.constraints : [],
        complexity: this.normalizeComplexity(parsed.complexity),
        urls: this.normalizeArray(parsed.urls),
        apis: this.normalizeArray(parsed.apis),
        credentials: credentials,
        schedules: this.normalizeArray(parsed.schedules),
        dataFormats: this.normalizeArray(parsed.dataFormats),
        errorHandling: this.normalizeArray(parsed.errorHandling),
        notifications: this.normalizeArray(parsed.notifications),
        platforms: this.normalizeArray(parsed.platforms),
      };
    } catch (error) {
      console.error('❌ Error parsing requirements response:', error);
      return this.getMinimalRequirements(systemPrompt);
    }
  }

  /**
   * Normalize parsed data to ensure all fields are in correct format
   */
  private normalizeParsedData(parsed: any): any {
    return {
      primaryGoal: typeof parsed.primaryGoal === 'string' ? parsed.primaryGoal : (parsed.primaryGoal || ''),
      keySteps: this.parseStringArray(parsed.keySteps),
      inputs: this.parseStringArray(parsed.inputs),
      outputs: this.parseStringArray(parsed.outputs),
      constraints: this.parseStringArray(parsed.constraints),
      complexity: parsed.complexity || 'medium',
      urls: this.parseStringArray(parsed.urls),
      apis: this.parseStringArray(parsed.apis),
      credentials: this.parseStringArray(parsed.credentials),
      schedules: this.parseStringArray(parsed.schedules),
      dataFormats: this.parseStringArray(parsed.dataFormats),
      errorHandling: this.parseStringArray(parsed.errorHandling),
      notifications: this.parseStringArray(parsed.notifications),
      platforms: this.parseStringArray(parsed.platforms),
    };
  }

  /**
   * SAFE parsing with type guards
   */
  private parseStringArray(arr: any): string[] {
    if (!Array.isArray(arr)) return [];
    return arr.map(item => {
      if (typeof item === 'string') return item;
      if (typeof item === 'number' || typeof item === 'boolean') return String(item);
      if (typeof item === 'object' && item !== null) {
        // Try to extract meaningful string from object
        return item.name || item.type || item.label || JSON.stringify(item);
      }
      return String(item);
    }).filter(item => item.length > 0);
  }

  /**
   * Enhance requirements with answers
   */
  private enhanceWithAnswers(parsed: any, answers: Record<string, string>): any {
    const enhanced = { ...parsed };
    
    // Extract additional information from answers
    const answerText = Object.values(answers).join(' ').toLowerCase();
    
    // CRITICAL FIX: Only add platforms if they are EXPLICITLY mentioned as services/platforms
    // Check for Slack - only if explicitly mentioned as a platform/service (not just the word "slack")
    const slackPatterns = [
      'slack integration',
      'slack bot',
      'slack channel',
      'slack notification',
      'slack message',
      'send to slack',
      'post to slack',
      'slack api',
      'slack service',
      'use slack',
      'slack platform'
    ];
    const hasExplicitSlack = slackPatterns.some(pattern => answerText.includes(pattern));
    if (hasExplicitSlack && !enhanced.platforms.some((p: string) => p.toLowerCase().includes('slack'))) {
      enhanced.platforms.push('Slack');
    }
    
    // Check for Email - only if explicitly mentioned as a service
    const emailPatterns = [
      'email service',
      'send email',
      'email notification',
      'email integration',
      'gmail',
      'email api'
    ];
    const hasExplicitEmail = emailPatterns.some(pattern => answerText.includes(pattern));
    if (hasExplicitEmail && !enhanced.platforms.some((p: string) => p.toLowerCase().includes('email'))) {
      enhanced.platforms.push('Email');
    }
    
    return enhanced;
  }

  /**
   * Rule-based extraction fallback
   */
  private extractWithRules(systemPrompt: string, answers?: Record<string, string>): ExtractedRequirements {
    console.log('📋 Using rule-based extraction fallback');
    return this.generateFallbackRequirements(systemPrompt);
  }

  /**
   * Get minimal requirements when all extraction fails
   */
  private getMinimalRequirements(systemPrompt: string): ExtractedRequirements {
    return {
      primaryGoal: this.extractPrimaryGoal(systemPrompt),
      keySteps: this.extractKeySteps(systemPrompt),
      inputs: [],
      outputs: [],
      constraints: [],
      complexity: 'medium',
      urls: [],
      apis: [],
      credentials: [],
      schedules: [],
      dataFormats: ['JSON'],
      errorHandling: ['retry on failure'],
      notifications: [],
      platforms: [],
      dataTransformations: [],
      inputOutputMappings: [],
    };
  }

  /**
   * Normalize array fields
   */
  private normalizeArray(value: any): string[] {
    if (Array.isArray(value)) {
      return value.map(v => String(v)).filter(v => v.length > 0);
    }
    if (typeof value === 'string' && value.length > 0) {
      return [value];
    }
    return [];
  }

  /**
   * Normalize complexity
   */
  private normalizeComplexity(value: any): 'simple' | 'medium' | 'complex' {
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'simple' || lower === 'easy' || lower === 'basic') return 'simple';
      if (lower === 'complex' || lower === 'advanced' || lower === 'hard') return 'complex';
    }
    return 'medium';
  }

  /**
   * Extract primary goal from system prompt
   */
  private extractPrimaryGoal(systemPrompt: string): string {
    // Simple extraction - take first sentence
    const sentences = systemPrompt.split(/[.!?]/);
    return sentences[0]?.trim() || systemPrompt.slice(0, 100);
  }

  /**
   * Extract key steps from system prompt
   */
  private extractKeySteps(systemPrompt: string): string[] {
    // Simple extraction - look for action verbs
    const actions = [
      'fetch', 'get', 'retrieve', 'send', 'post', 'update', 'create',
      'sync', 'process', 'transform', 'validate', 'notify', 'schedule'
    ];
    
    const steps: string[] = [];
    const lowerPrompt = systemPrompt.toLowerCase();
    
    actions.forEach(action => {
      if (lowerPrompt.includes(action)) {
        steps.push(action);
      }
    });

    return steps.length > 0 ? steps : ['process', 'execute'];
  }

  /**
   * Generate fallback requirements if extraction fails
   */
  private generateFallbackRequirements(systemPrompt: string): ExtractedRequirements {
    const lowerPrompt = systemPrompt.toLowerCase();
    
    // Detect common patterns
    const urls: string[] = [];
    const apis: string[] = [];
    const credentials: string[] = [];
    const schedules: string[] = [];
    const platforms: string[] = [];

    // Detect services
    if (lowerPrompt.includes('twitter')) {
      apis.push('Twitter API');
      credentials.push('Twitter API Credentials');
      platforms.push('Twitter');
    }
    if (lowerPrompt.includes('slack')) {
      apis.push('Slack API');
      credentials.push('Slack Bot Token');
      platforms.push('Slack');
    }
    if (lowerPrompt.includes('google') || lowerPrompt.includes('gmail') || lowerPrompt.includes('sheets')) {
      apis.push('Google API');
      // Google OAuth is handled via navbar credentials button - already integrated with Supabase
      // Do NOT add Google OAuth credentials - they are already configured
      platforms.push('Google');
    }
    if (lowerPrompt.includes('database') || lowerPrompt.includes('postgres') || lowerPrompt.includes('supabase')) {
      credentials.push('Database Credentials');
      platforms.push('Database');
    }
    
    // CRITICAL: Detect AI functionality and add Google Gemini API key
    // AI Agent nodes always require Google Gemini API key (default chat model)
    const hasAIFunctionality = 
      lowerPrompt.includes('ai agent') ||
      lowerPrompt.includes('ai assistant') ||
      lowerPrompt.includes('chatbot') ||
      lowerPrompt.includes('chat bot') ||
      lowerPrompt.includes('llm') ||
      lowerPrompt.includes('language model') ||
      lowerPrompt.includes('ai-generated') ||
      lowerPrompt.includes('ai generated') ||
      lowerPrompt.includes('ai-generated content') ||
      lowerPrompt.includes('generate') ||
      lowerPrompt.includes('analyze') ||
      lowerPrompt.includes('summarize') ||
      lowerPrompt.includes('classify') ||
      lowerPrompt.includes('sentiment') ||
      lowerPrompt.includes('intent') ||
      lowerPrompt.includes('natural language') ||
      lowerPrompt.includes('nlp') ||
      lowerPrompt.includes('text analysis') ||
      lowerPrompt.includes('content generation') ||
      lowerPrompt.includes('ai-powered') ||
      lowerPrompt.includes('ai powered') ||
      lowerPrompt.includes('using ai') ||
      lowerPrompt.includes('with ai') ||
      lowerPrompt.includes('ai model');
    
    // AI functionality uses Ollama - no external API keys needed
    if (hasAIFunctionality) {
      console.log('✅ AI functionality detected in fallback - using Ollama (no API key required)');
    }

    // Detect schedules
    if (lowerPrompt.includes('daily') || lowerPrompt.includes('every day')) {
      schedules.push('0 9 * * *'); // Default: 9 AM daily
    } else if (lowerPrompt.includes('hourly') || lowerPrompt.includes('every hour')) {
      schedules.push('0 * * * *');
    } else if (lowerPrompt.includes('weekly') || lowerPrompt.includes('every week')) {
      schedules.push('0 9 * * 1'); // Monday 9 AM
    }

    return {
      primaryGoal: this.extractPrimaryGoal(systemPrompt),
      keySteps: this.extractKeySteps(systemPrompt),
      inputs: [],
      outputs: [],
      constraints: [],
      complexity: 'medium',
      urls,
      apis,
      credentials,
      schedules,
      dataFormats: ['JSON'],
      errorHandling: ['retry on failure'],
      notifications: [],
      platforms,
      dataTransformations: [],
      inputOutputMappings: [],
    };
  }

  /**
   * Extract data transformation requirements from prompt
   */
  private extractDataTransformRequirements(
    userPrompt: string,
    systemPrompt: string
  ): DataTransformation[] {
    const transformations: DataTransformation[] = [];
    const promptLower = (userPrompt + ' ' + systemPrompt).toLowerCase();

    // Format conversion
    if (promptLower.includes('format') || promptLower.includes('convert')) {
      const sourceFormat = this.detectFormat(promptLower, 'source');
      const targetFormat = this.detectFormat(promptLower, 'target');
      
      transformations.push({
        type: 'format_conversion',
        sourceFormat: sourceFormat || 'json',
        targetFormat: targetFormat || 'csv',
        mappingRequired: true,
      });
    }

    // Filtering
    if (promptLower.includes('filter') || promptLower.includes('select')) {
      const criteria = this.extractFilterCriteria(promptLower);
      transformations.push({
        type: 'filtering',
        criteria: criteria || [],
        operator: 'AND',
      });
    }

    // Aggregation
    if (promptLower.includes('aggregate') || promptLower.includes('summarize') || 
        promptLower.includes('sum') || promptLower.includes('count') ||
        promptLower.includes('average') || promptLower.includes('avg')) {
      const operations = this.extractAggregationOperations(promptLower);
      transformations.push({
        type: 'aggregation',
        operations: operations || [],
      });
    }

    // Mapping
    if (promptLower.includes('map') || promptLower.includes('transform') ||
        promptLower.includes('process')) {
      transformations.push({
        type: 'mapping',
        mappingRequired: true,
      });
    }

    return transformations;
  }

  /**
   * Extract input-output mappings from prompt
   */
  private extractInputOutputMappings(
    userPrompt: string,
    systemPrompt: string
  ): InputOutputMapping[] {
    // This is a simplified extraction - in a full implementation,
    // this would use AI to extract specific field mappings
    const mappings: InputOutputMapping[] = [];
    
    // For now, return empty array - mappings will be generated during node configuration
    return mappings;
  }

  /**
   * Detect data format from prompt
   */
  private detectFormat(prompt: string, type: 'source' | 'target'): string | undefined {
    const promptLower = prompt.toLowerCase();
    
    if (type === 'source') {
      if (promptLower.includes('from json') || promptLower.includes('json to')) {
        return 'json';
      }
      if (promptLower.includes('from csv') || promptLower.includes('csv to')) {
        return 'csv';
      }
      if (promptLower.includes('from xml') || promptLower.includes('xml to')) {
        return 'xml';
      }
    } else {
      if (promptLower.includes('to json') || promptLower.includes('json format')) {
        return 'json';
      }
      if (promptLower.includes('to csv') || promptLower.includes('csv format')) {
        return 'csv';
      }
      if (promptLower.includes('to xml') || promptLower.includes('xml format')) {
        return 'xml';
      }
    }
    
    return undefined;
  }

  /**
   * Extract filter criteria from prompt
   */
  private extractFilterCriteria(prompt: string): any[] {
    const criteria: any[] = [];
    
    // Simple extraction - look for common filter patterns
    if (prompt.includes('above') || prompt.includes('greater than') || prompt.includes('>')) {
      const match = prompt.match(/(?:above|greater than|>)\s*\$?(\d+)/i);
      if (match) {
        criteria.push({
          field: 'value',
          operator: 'gt',
          value: parseFloat(match[1]),
        });
      }
    }
    
    if (prompt.includes('below') || prompt.includes('less than') || prompt.includes('<')) {
      const match = prompt.match(/(?:below|less than|<)\s*\$?(\d+)/i);
      if (match) {
        criteria.push({
          field: 'value',
          operator: 'lt',
          value: parseFloat(match[1]),
        });
      }
    }
    
    return criteria;
  }

  /**
   * Extract aggregation operations from prompt
   */
  private extractAggregationOperations(prompt: string): any[] {
    const operations: any[] = [];
    const promptLower = prompt.toLowerCase();
    
    if (promptLower.includes('sum') || promptLower.includes('total')) {
      operations.push({
        field: 'amount',
        operation: 'sum',
        alias: 'total',
      });
    }
    
    if (promptLower.includes('count')) {
      operations.push({
        field: '*',
        operation: 'count',
        alias: 'count',
      });
    }
    
    if (promptLower.includes('average') || promptLower.includes('avg')) {
      operations.push({
        field: 'value',
        operation: 'avg',
        alias: 'average',
      });
    }
    
    return operations;
  }
}

// Export singleton instance
export const requirementsExtractor = new RequirementsExtractor();
