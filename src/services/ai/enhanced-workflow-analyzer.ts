// Enhanced Workflow Analyzer
// Integrates multi-node detection with standard workflow analysis

import { WorkflowAnalyzer, AnalysisResult, Question, QuestionCategory } from './workflow-analyzer';
import { nodeEquivalenceMapper, MultiNodeDetectionResult, NodeOption } from './node-equivalence-mapper';
import { questionFormatter } from './question-formatter';

export interface EnhancedAnalysisResult extends AnalysisResult {
  nodeOptionsDetected: MultiNodeDetectionResult[];
  hasNodeChoices: boolean;
}

export interface NodePreferenceQuestion extends Question {
  type: 'node_preference';
  category: QuestionCategory;
  nodeOptions: NodeOption[];
  helpText?: string;
  followUpQuestions?: Question[];
}

/**
 * EnhancedWorkflowAnalyzer - Extends WorkflowAnalyzer with multi-node detection
 * 
 * Detects when multiple nodes can accomplish the same task and generates
 * preference questions in user-friendly language
 */
export class EnhancedWorkflowAnalyzer {
  private baseAnalyzer: WorkflowAnalyzer;
  
  constructor() {
    this.baseAnalyzer = new WorkflowAnalyzer();
  }

  /**
   * FAST analysis using pattern matching - returns questions immediately without LLM
   * Use this for initial question generation to provide instant feedback
   */
  fastAnalyzePromptWithNodeOptions(
    userPrompt: string,
    context?: {
      existingWorkflow?: any;
      userHistory?: any[];
    }
  ): EnhancedAnalysisResult {
    console.log(`⚡ FAST analyzing prompt with node options (pattern matching): "${userPrompt}"`);
    
    // Step 1: Fast pattern-based analysis (no LLM)
    const baseAnalysis = this.baseAnalyzer.fastAnalyzePrompt(userPrompt, context);
    
    // Step 2: Detect multi-node options (fast, pattern-based)
    const nodeOptions = nodeEquivalenceMapper.detectMultiNodeOptions(userPrompt);
    
    // Step 3: Filter out irrelevant node options based on prompt context
    const relevantNodeOptions = this.filterRelevantNodeOptions(nodeOptions, userPrompt, baseAnalysis.questions);
    
    // Step 4: Generate preference questions only for relevant options
    const preferenceQuestions = this.generatePreferenceQuestions(relevantNodeOptions, userPrompt);
    
    // Step 5: Filter out duplicate questions (preference questions that overlap with base questions)
    const filteredPreferenceQuestions = this.filterDuplicateQuestions(preferenceQuestions, baseAnalysis.questions);
    
    // Step 6: Combine with standard questions
    // Convert NodePreferenceQuestion to Question for compatibility
    const allQuestions: Question[] = [
      ...baseAnalysis.questions,
      ...filteredPreferenceQuestions.map(q => ({
        id: q.id,
        text: q.text,
        options: q.options,
        category: q.category
      }))
    ];
    
    // ✅ CRITICAL: Deduplicate final questions array to prevent duplicate questions
    const deduplicatedQuestions = this.deduplicateQuestions(allQuestions);
    
    return {
      ...baseAnalysis,
      nodeOptionsDetected: relevantNodeOptions,
      questions: deduplicatedQuestions,
      hasNodeChoices: relevantNodeOptions.length > 0
    };
  }

  /**
   * Analyze prompt with node option detection
   * FULL analysis using LLM - use this after questions are answered
   */
  async analyzePromptWithNodeOptions(
    userPrompt: string,
    context?: {
      existingWorkflow?: any;
      userHistory?: any[];
    }
  ): Promise<EnhancedAnalysisResult> {
    // Step 1: Standard analysis (existing functionality)
    const baseAnalysis = await this.baseAnalyzer.analyzePrompt(userPrompt, context);
    
    // Step 2: Detect multi-node options
    const nodeOptions = nodeEquivalenceMapper.detectMultiNodeOptions(userPrompt);
    
    // Step 3: Filter out irrelevant node options based on prompt context
    const relevantNodeOptions = this.filterRelevantNodeOptions(nodeOptions, userPrompt, baseAnalysis.questions);
    
    // Step 4: Generate preference questions only for relevant options
    const preferenceQuestions = this.generatePreferenceQuestions(relevantNodeOptions, userPrompt);
    
    // Step 5: Filter out duplicate questions (preference questions that overlap with base questions)
    const filteredPreferenceQuestions = this.filterDuplicateQuestions(preferenceQuestions, baseAnalysis.questions);
    
    // Step 6: Combine with standard questions
    // Convert NodePreferenceQuestion to Question for compatibility
    const allQuestions: Question[] = [
      ...baseAnalysis.questions,
      ...filteredPreferenceQuestions.map(q => ({
        id: q.id,
        text: q.text,
        options: q.options,
        category: q.category
      }))
    ];
    
    // ✅ CRITICAL: Deduplicate final questions array to prevent duplicate questions
    const deduplicatedQuestions = this.deduplicateQuestions(allQuestions);
    
    return {
      ...baseAnalysis,
      nodeOptionsDetected: relevantNodeOptions,
      questions: deduplicatedQuestions,
      hasNodeChoices: relevantNodeOptions.length > 0
    };
  }
  
  /**
   * Deduplicate questions by text similarity and ID
   * Prevents the same question from being asked multiple times
   */
  private deduplicateQuestions(questions: Question[]): Question[] {
    const seen = new Set<string>();
    const seenNormalized = new Map<string, Question>();
    
    // ✅ CRITICAL: Track trigger/schedule questions separately to prevent duplicates
    let hasTriggerQuestion = false;
    
    return questions.filter((q) => {
      // Check by ID first (fastest)
      if (q.id && seen.has(q.id)) {
        console.log(`⚠️  [EnhancedAnalyzer] Removed duplicate question by ID: "${q.text}" (ID: ${q.id})`);
        return false;
      }
      
      // Normalize question text for comparison
      const normalizedText = q.text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Check for exact text duplicates
      if (seenNormalized.has(normalizedText)) {
        console.log(`⚠️  [EnhancedAnalyzer] Removed duplicate question by text: "${q.text}"`);
        return false;
      }
      
      // ✅ CRITICAL: Detect trigger/schedule questions and ensure only one is asked
      const isTriggerQuestion = 
        (normalizedText.includes('trigger') || normalizedText.includes('triggered')) &&
        (normalizedText.includes('workflow') || normalizedText.includes('this'));
      const isScheduleQuestion = 
        (normalizedText.includes('when') || normalizedText.includes('run') || normalizedText.includes('schedule')) &&
        (normalizedText.includes('workflow') || normalizedText.includes('this'));
      
      if (isTriggerQuestion || isScheduleQuestion) {
        if (hasTriggerQuestion) {
          console.log(`⚠️  [EnhancedAnalyzer] Removed duplicate trigger/schedule question: "${q.text}" (already have trigger question)`);
          return false;
        }
        hasTriggerQuestion = true;
      }
      
      // Check for similar questions (same keywords)
      const keywords = normalizedText.split(' ').filter(w => w.length > 3);
      const keywordKey = keywords.sort().join(' ');
      
      // Check if we've seen a question with the same keywords
      for (const [existingKey, existingQ] of seenNormalized.entries()) {
        const existingKeywords = existingKey.split(' ').filter(w => w.length > 3);
        const existingKeywordKey = existingKeywords.sort().join(' ');
        
        // If 80% of keywords match, consider it a duplicate
        if (keywordKey === existingKeywordKey || 
            (keywords.length > 0 && existingKeywords.length > 0 && 
             keywords.filter(k => existingKeywords.includes(k)).length / Math.max(keywords.length, existingKeywords.length) > 0.8)) {
          console.log(`⚠️  [EnhancedAnalyzer] Removed similar question: "${q.text}" (similar to: "${existingQ.text}")`);
          return false;
        }
      }
      
      // Mark as seen
      if (q.id) {
        seen.add(q.id);
      }
      seenNormalized.set(normalizedText, q);
      
      return true;
    });
  }
  
  /**
   * Filter out irrelevant node options based on prompt context
   */
  private filterRelevantNodeOptions(
    nodeOptions: MultiNodeDetectionResult[],
    userPrompt: string,
    baseQuestions: Question[]
  ): MultiNodeDetectionResult[] {
    const lowerPrompt = userPrompt.toLowerCase();
    
    return nodeOptions.filter(option => {
      // Skip notification questions if user is NOT sending notifications
      if (option.category === 'notification') {
        const isSending = lowerPrompt.includes('send') || 
                         lowerPrompt.includes('notify') || 
                         lowerPrompt.includes('alert') || 
                         lowerPrompt.includes('message') ||
                         lowerPrompt.includes('email') ||
                         lowerPrompt.includes('slack') ||
                         lowerPrompt.includes('discord');
        const isStoring = lowerPrompt.includes('store') || 
                         lowerPrompt.includes('save') || 
                         lowerPrompt.includes('database');
        // Only ask about notifications if user is sending, not storing
        if (!isSending && isStoring) {
          return false; // Skip notification question
        }
      }
      
      // Skip database questions if user is just sending data (not storing)
      if (option.category === 'database') {
        const isStoring = lowerPrompt.includes('store') || 
                         lowerPrompt.includes('save') || 
                         lowerPrompt.includes('database');
        const isJustSending = (lowerPrompt.includes('send') || 
                              lowerPrompt.includes('notify') || 
                              lowerPrompt.includes('email')) && 
                              !isStoring;
        if (isJustSending) {
          return false; // Skip database question
        }
      }
      
      // Skip scheduling questions if trigger type is already mentioned
      if (option.category === 'scheduling') {
        const hasFormTrigger = lowerPrompt.includes('form trigger') || 
                              lowerPrompt.includes('form submission') ||
                              lowerPrompt.includes('via form');
        const hasWebhookTrigger = lowerPrompt.includes('webhook') || 
                                 lowerPrompt.includes('http request');
        const hasManualTrigger = lowerPrompt.includes('manual') || 
                                lowerPrompt.includes('on demand');
        // If trigger is already specified (form, webhook, manual), don't ask about scheduling
        if (hasFormTrigger || hasWebhookTrigger || hasManualTrigger) {
          return false; // Skip scheduling question
        }
      }
      
      // Skip file storage questions if user already specified storage location
      if (option.category === 'file_storage') {
        const hasSpecificStorage = lowerPrompt.includes('google drive') || 
                                  lowerPrompt.includes('google docs') ||
                                  lowerPrompt.includes('aws s3') ||
                                  lowerPrompt.includes('document') ||
                                  lowerPrompt.includes('database');
        if (hasSpecificStorage) {
          // Only ask if multiple storage options are possible
          const storageCount = [
            lowerPrompt.includes('google drive'),
            lowerPrompt.includes('google docs'),
            lowerPrompt.includes('aws s3'),
            lowerPrompt.includes('database')
          ].filter(Boolean).length;
          if (storageCount === 1) {
            return false; // Skip if only one storage type mentioned
          }
        }
      }
      
      return true; // Keep this option
    });
  }
  
  /**
   * Filter out preference questions that duplicate base questions
   */
  private filterDuplicateQuestions(
    preferenceQuestions: NodePreferenceQuestion[],
    baseQuestions: Question[]
  ): NodePreferenceQuestion[] {
    return preferenceQuestions.filter(prefQ => {
      // Check if a base question already covers this topic
      const baseQuestionCovers = baseQuestions.some(baseQ => {
        const prefText = prefQ.text.toLowerCase();
        const baseText = baseQ.text.toLowerCase();
        
        // ✅ CRITICAL: Check for trigger/schedule question duplicates
        // Both "How should this workflow be triggered?" and "When should this workflow run?" ask the same thing
        const isPrefTriggerQuestion = 
          (prefText.includes('trigger') || prefText.includes('triggered') || prefText.includes('when') || prefText.includes('run') || prefText.includes('schedule')) &&
          (prefText.includes('workflow') || prefText.includes('this'));
        const isBaseTriggerQuestion = 
          (baseText.includes('trigger') || baseText.includes('triggered') || baseText.includes('when') || baseText.includes('run') || baseText.includes('schedule')) &&
          (baseText.includes('workflow') || baseText.includes('this'));
        
        if (isPrefTriggerQuestion && isBaseTriggerQuestion) {
          return true; // Both are trigger/schedule questions - remove preference question
        }
        
        // Check for semantic overlap based on mapped categories
        // Note: prefQ.category is the mapped QuestionCategory, not the original node option category
        if (prefQ.category === 'schedule' && (baseText.includes('trigger') || baseText.includes('run') || baseText.includes('schedule'))) {
          return true; // Base question about trigger/schedule covers scheduling
        }
        if (prefQ.category === 'destination' && (baseText.includes('send') || baseText.includes('notification'))) {
          return true; // Base question about notifications/destination covers this
        }
        if (prefQ.category === 'data_source' && (baseText.includes('store') || baseText.includes('save') || baseText.includes('data'))) {
          return true; // Base question about storage covers database/file storage
        }
        
        return false;
      });
      
      return !baseQuestionCovers;
    });
  }
  
  /**
   * Generate preference questions from detected node options
   */
  private generatePreferenceQuestions(
    nodeOptions: MultiNodeDetectionResult[],
    userPrompt: string
  ): NodePreferenceQuestion[] {
    return nodeOptions.map(option => {
      const formatted = questionFormatter.formatNodeChoiceQuestion(
        option.category,
        option.options,
        userPrompt
      );
      
      // Map category to QuestionCategory
      const questionCategory: QuestionCategory = 
        option.category === 'notification' ? 'destination' :
        option.category === 'database' ? 'data_source' :
        option.category === 'file_storage' ? 'data_source' :
        option.category === 'scheduling' ? 'schedule' :
        option.category === 'authentication' ? 'authentication' :
        'preferences';
      
      return {
        id: `node_pref_${option.category}`,
        type: 'node_preference',
        category: questionCategory,
        text: this.formatNodePreferenceQuestion(option, formatted),
        options: formatted.options.map(opt => `${opt.icon} ${opt.label}`),
        nodeOptions: option.options,
        helpText: "", // No help text needed
        followUpQuestions: this.getFollowUpQuestionsForNode(option.category)
      };
    });
  }
  
  /**
   * Format node preference question text - Simplified, no explanations
   */
  private formatNodePreferenceQuestion(
    option: MultiNodeDetectionResult,
    formatted: any
  ): string {
    // Just return the question - no explanations, no descriptions, no recommendations
    return formatted.question;
  }
  
  
  /**
   * Get follow-up questions based on selected node
   */
  private getFollowUpQuestionsForNode(nodeType: string): Question[] {
    const followUpMap: Record<string, Question[]> = {
      slack: [
        {
          id: 'slack_channel',
          text: 'Which Slack channel should receive the message?',
          options: ['#general', '#notifications', '@username', 'I\'ll provide it later'],
          category: 'destination' as QuestionCategory
        },
        {
          id: 'slack_format',
          text: 'How should the message be formatted?',
          options: ['Plain text', 'Rich format with attachments', 'Interactive buttons'],
          category: 'preferences' as QuestionCategory
        }
      ],
      email: [
        {
          id: 'email_recipients',
          text: 'Who should receive the email?',
          options: ['Single recipient', 'Multiple recipients', 'Dynamic from data', 'I\'ll configure later'],
          category: 'destination' as QuestionCategory
        },
        {
          id: 'email_subject',
          text: 'What should the subject line be?',
          options: ['Static text', 'Dynamic from data', 'Template with variables', 'I\'ll configure later'],
          category: 'content' as QuestionCategory
        }
      ],
      discord: [
        {
          id: 'discord_webhook',
          text: 'Do you have a Discord webhook URL?',
          options: ['Yes, I have it', 'No, I need help setting up', 'I\'ll provide it later'],
          category: 'authentication' as QuestionCategory
        }
      ],
      twilio: [
        {
          id: 'twilio_credentials',
          text: 'Do you have Twilio credentials configured?',
          options: ['Yes, all set up', 'No, I need help', 'I\'ll provide them later'],
          category: 'authentication' as QuestionCategory
        },
        {
          id: 'twilio_recipients',
          text: 'Who should receive the SMS?',
          options: ['Single phone number', 'Multiple numbers', 'Dynamic from data'],
          category: 'destination' as QuestionCategory
        }
      ],
      schedule: [
        {
          id: 'schedule_time',
          text: 'What time should this run?',
          options: ['9 AM', '12 PM', '6 PM', 'Custom time'],
          category: 'schedule' as QuestionCategory
        },
        {
          id: 'schedule_frequency',
          text: 'How often should this run?',
          options: ['Daily', 'Weekly', 'Monthly', 'Custom schedule'],
          category: 'schedule' as QuestionCategory
        }
      ],
      interval: [
        {
          id: 'interval_duration',
          text: 'How often should this run?',
          options: ['Every 5 minutes', 'Every hour', 'Every 6 hours', 'Custom interval'],
          category: 'schedule' as QuestionCategory
        }
      ],
      webhook: [
        {
          id: 'webhook_method',
          text: 'What HTTP method should the webhook accept?',
          options: ['GET', 'POST', 'PUT', 'Any'],
          category: 'preferences' as QuestionCategory
        }
      ],
      supabase: [
        {
          id: 'supabase_setup',
          text: 'Do you have a Supabase project set up?',
          options: ['Yes, I have credentials', 'No, I need help', 'I\'ll provide them later'],
          category: 'authentication' as QuestionCategory
        }
      ],
      postgresql: [
        {
          id: 'postgresql_connection',
          text: 'Do you have PostgreSQL connection details?',
          options: ['Yes, I have them', 'No, I need help', 'I\'ll provide them later'],
          category: 'authentication' as QuestionCategory
        }
      ]
    };
    
    return followUpMap[nodeType] || [];
  }
  
  /**
   * Extract node preferences from user answers
   */
  extractNodePreferences(answers: Record<string, string>): Record<string, string> {
    const preferences: Record<string, string> = {};
    
    for (const [questionId, answer] of Object.entries(answers)) {
      if (questionId.startsWith('node_pref_')) {
        const category = questionId.replace('node_pref_', '');
        // Extract node ID from answer (e.g., "💬 Slack Message" -> "slack")
        const nodeId = this.extractNodeIdFromAnswer(answer);
        if (nodeId) {
          preferences[category] = nodeId;
        }
      }
    }
    
    return preferences;
  }
  
  /**
   * Extract node ID from user's answer
   */
  private extractNodeIdFromAnswer(answer: string): string | null {
    // Answer format: "💬 Slack Message" or just "Slack Message"
    const lowerAnswer = answer.toLowerCase();
    
    // Map common answer patterns to node IDs
    const nodeIdMap: Record<string, string> = {
      'slack': 'slack',
      'email': 'email',
      'discord': 'discord',
      'sms': 'twilio',
      'twilio': 'twilio',
      'gmail': 'gmail',
      'postgresql': 'postgresql',
      'postgres': 'postgresql',
      'supabase': 'supabase',
      'mysql': 'mysql',
      's3': 's3',
      'aws s3': 's3',
      'google drive': 'google_drive',
      'drive': 'google_drive',
      'schedule': 'schedule',
      'interval': 'interval',
      'webhook': 'webhook',
      'manual': 'manual'
    };
    
    for (const [key, nodeId] of Object.entries(nodeIdMap)) {
      if (lowerAnswer.includes(key)) {
        return nodeId;
      }
    }
    
    return null;
  }
}

// Export singleton instance
export const enhancedWorkflowAnalyzer = new EnhancedWorkflowAnalyzer();
