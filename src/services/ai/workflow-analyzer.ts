// Workflow Analyzer Service
// Step 2: Question Generation using Llama 3.1:8B
// Enhanced prompts based on comprehensive guide

import { ollamaOrchestrator } from './ollama-orchestrator';
import { workflowTrainingService } from './workflow-training-service';

export interface AnalysisResult {
  summary: string; // 20-30 word summary
  questions: Question[];
  intent?: string;
  entities?: string[];
  implicitRequirements?: string[];
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  category: QuestionCategory;
}

export type QuestionCategory = 
  | 'node_selection'  // NEW: For selecting specific services/nodes
  | 'content'
  | 'schedule'
  | 'authentication'
  | 'destination'
  | 'error_handling'
  | 'data_source'
  | 'preferences'
  | 'credentials'  // NEW: For credentials (asked AFTER node selection)
  | 'other';

/**
 * WorkflowAnalyzer - Step 2: Question Generation
 * 
 * Uses Llama 3.1:8B to analyze user prompts and generate clarifying questions.
 * Follows strict rules:
 * - NEVER ask about technical implementation
 * - ALWAYS ask about business requirements
 * - Generate 3-5 relevant questions with multiple choice options
 */
export class WorkflowAnalyzer {
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
   * FAST analysis using pattern matching - returns questions immediately without LLM
   * Use this for initial question generation to provide instant feedback
   */
  fastAnalyzePrompt(
    userPrompt: string,
    context?: {
      existingWorkflow?: any;
      userHistory?: any[];
    }
  ): AnalysisResult {
    console.log(`⚡ FAST analyzing prompt (pattern matching): "${userPrompt}"`);
    
    // Use pattern-based fallback questions for instant response
    const result = this.generateFallbackQuestions(userPrompt);
    
    // Enhance with node options detection (fast, no LLM)
    const lowerPrompt = userPrompt.toLowerCase();
    
    // Detect chatbot intent
    if (this.isChatbotIntent(userPrompt)) {
      console.log('✅ Chatbot workflow detected - returning no questions');
      return {
        summary: this.generateFallbackSummary(userPrompt),
        questions: [],
        intent: 'chatbot',
        entities: [],
        implicitRequirements: [],
      };
    }
    
    return result;
  }

  /**
   * Analyze user prompt and generate clarifying questions
   * FULL analysis using LLM - use this after questions are answered
   */
  async analyzePrompt(
    userPrompt: string,
    context?: {
      existingWorkflow?: any;
      userHistory?: any[];
    }
  ): Promise<AnalysisResult> {
    console.log(`🔍 FULL analyzing prompt (LLM): "${userPrompt}"`);

    const systemPrompt = this.buildSystemPrompt();
    const analysisPrompt = this.buildAnalysisPrompt(userPrompt, context);

    try {
      const response = await ollamaOrchestrator.processRequest(
        'workflow-analysis',
        {
          system: systemPrompt,
          message: analysisPrompt,
        },
        {
          temperature: 0.3, // Lower temperature for more consistent, rule-following behavior
          max_tokens: 2000,
          cache: false,
        }
      );

      return this.parseAnalysisResponse(response, userPrompt);
    } catch (error) {
      console.error('❌ Error analyzing prompt:', error);
      // Return fallback questions
      return this.generateFallbackQuestions(userPrompt);
    }
  }

  /**
   * Build system prompt with strict rules
   * STEP 2: CLARIFICATION QUESTIONING ENGINE
   */
  private buildSystemPrompt(): string {
    // Try to load comprehensive clarifying questions prompt
    try {
      const promptPath = require('path').join(__dirname, 'CLARIFYING_QUESTIONS_SYSTEM_PROMPT.md');
      const fs = require('fs');
      if (fs.existsSync(promptPath)) {
        const content = fs.readFileSync(promptPath, 'utf-8');
        console.log(`✅ Loaded clarifying questions prompt from: ${promptPath}`);
        return content;
      }
    } catch (error) {
      console.warn('⚠️  Could not load clarifying questions prompt, using embedded version');
    }
    
    // Fallback to embedded prompt
    return `STEP-2: CLARIFYING QUESTIONS AGENT

## 🔹 ROLE

You are a Workflow Clarification Agent.

Your ONLY responsibility is to ask essential clarifying questions required to build a fully correct, executable workflow with valid node-to-node input/output connections.

You are NOT allowed to:
- Design workflows
- Suggest nodes
- Explain concepts
- Ask exploratory or brainstorming questions

You behave like a requirements engineer, not a chatbot.

## 🔹 CORE OBJECTIVE

Ask the minimum number of short, clear, user-understandable questions needed to eliminate ambiguity that would otherwise cause:
- Wrong node selection
- Wrong input/output mapping
- Broken authentication
- Invalid triggers
- Incorrect final delivery

If the workflow can already be built correctly → ASK NOTHING.

## 🔹 ABSOLUTE QUESTION RULES (NON-NEGOTIABLE)

### ❌ YOU MUST NEVER ASK:

- "Can you explain more?"
- "What do you want exactly?"
- "How should this work?"
- Questions already answered in the user prompt
- Questions about obvious defaults
- Hypothetical or future questions
- Multiple concepts in one question
- Technical jargon the user didn't mention

### ✅ YOU MAY ASK ONLY IF:

A missing detail would directly break workflow execution or node connection.

## 🔹 ALLOWED QUESTION CATEGORIES (ONLY THESE 6)

You are allowed to ask questions ONLY from the categories below.

If a question does not fit one of these → DO NOT ASK IT.

### 1️⃣ TRIGGER SOURCE (ONLY IF UNCLEAR)

Ask ONLY if the trigger cannot be confidently inferred.

**Examples:**
- "How should this workflow start?"
- "What should trigger this workflow?"

❌ **Do NOT ask if trigger is already mentioned** (Form, Webhook, Telegram, Schedule, etc.)

### 2️⃣ AUTHENTICATION / ACCOUNT SOURCE

Ask ONLY if an external service is used AND auth source is not specified.

**Examples:**
- "Do you already have an API key for this service?"

❌ **Never ask:**
- "Which Google account should be used?" (Google OAuth is handled via navbar credentials button - already integrated with Supabase)
- How to create an account
- Google OAuth credentials (already available via navbar)

### 3️⃣ DESTINATION / FINAL OUTPUT

Ask ONLY if output destination is ambiguous.

**Examples:**
- "Where should the final result be sent?"
- "Should the message go to Slack or email?"

❌ **Do not ask formatting questions unless required.**

### 4️⃣ REQUIRED DATA FIELDS

Ask ONLY if mandatory fields for a node are missing.

**Examples:**
- "What email address should receive the message?"
- "Which sheet should data be saved to?"

❌ **Never ask optional-field questions.**

### 5️⃣ DATA FORMAT (ONLY IF MULTIPLE VALID OPTIONS EXIST)

Ask ONLY when format affects node compatibility.

**Examples:**
- "Should the message be full data or summary?"
- "Should the response be text or JSON?"

❌ **Never ask stylistic questions.**

### 6️⃣ EXECUTION MODE (ONLY IF NECESSARY)

Ask ONLY if execution behavior changes workflow logic.

**Examples:**
- "Should this run once or on every new entry?"
- "Should duplicates be allowed?"

## 🔹 QUESTION FILTER (MANDATORY SELF-CHECK)

Before asking ANY question, internally verify:

1. Is this information REQUIRED to connect nodes correctly?
2. Can this be safely inferred from the prompt?
3. Will a wrong assumption break the workflow?

**If ANY answer = NO → ❌ DO NOT ASK.**

## 🔹 QUESTION COUNT LIMIT

Ask the minimum number of questions needed.

**Maximum allowed:**
- Simple workflow: 0–2
- Medium workflow: 2–4
- Complex workflow: max 5

If more than 5 are needed → you must group logically, but still ask separately.

## 🔹 QUESTION FORMAT (STRICT)

All questions must be:
- Short
- One-line
- One concept per question
- Non-technical language

✅ **Correct:**
"Which Slack workspace should receive the message?"

❌ **Incorrect:**
"Can you explain how you want Slack integration to work?"

## 🔹 OUTPUT FORMAT (STRICT)

Output ONLY questions.
No headings.
No explanations.
No numbering emojis.

**Example output:**
What should trigger this workflow?
Do you already have an API key for this service?
Where should the final result be sent?

**If no questions are needed, output exactly:**
No clarification needed.

## 🔹 FAIL-SAFE RULE (VERY IMPORTANT)

If unsure whether to ask a question:

**Default to NOT asking**

Proceed with safest assumption internally

**Wrong question ❌ is worse than no question.**

## 🧠 WHY THIS PROMPT WORKS 100%

This prompt:
- Eliminates vague questions
- Prevents over-questioning
- Forces execution-driven clarity
- Aligns questions strictly to node IO correctness
- Mimics real enterprise requirement engineering

---

Return questions in JSON format as specified in the analysis prompt below.`;
  }

  /**
   * Detect chatbot intent from user prompt
   */
  private isChatbotIntent(userPrompt: string): boolean {
    const promptLower = userPrompt.toLowerCase();
    const chatbotKeywords = [
      'chatbot',
      'chat bot',
      'chatbot workflow',
      'chat bot workflow',
      'create a chatbot',
      'create a chat bot',
      'create chatbot',
      'create chat bot',
      'ai chat',
      'conversational ai',
      'assistant',
      'talk to ai',
      'chat with ai',
      'ai conversation',
      'chat workflow',
    ];
    
    return chatbotKeywords.some(keyword => promptLower.includes(keyword));
  }

  /**
   * Filter out Google OAuth questions (handled via navbar credentials button)
   */
  private filterGoogleOAuthQuestions(questions: Question[]): Question[] {
    const googleOAuthPatterns = [
      /which google account/i,
      /google.*account.*used/i,
      /google.*oauth/i,
      /google.*auth/i,
      /google.*credential/i,
      /google.*authentication/i,
    ];

    return questions.filter(q => {
      const questionText = q.text.toLowerCase();
      
      // Check if question matches any Google OAuth pattern
      const isGoogleOAuth = googleOAuthPatterns.some(pattern => pattern.test(questionText));
      
      if (isGoogleOAuth) {
        console.log(`❌ Filtered out Google OAuth question (handled via navbar): "${q.text}"`);
        return false;
      }
      
      return true;
    });
  }

  /**
   * Filter out irrelevant questions for chatbot workflows
   */
  private filterChatbotQuestions(questions: Question[]): Question[] {
    const irrelevantPatterns = [
      /what should trigger/i,
      /how should this.*trigger/i,
      /which platform.*chatbot/i,
      /which service.*chatbot/i,
      /when should this.*run/i,
      /when should this.*workflow/i,
      /execution mode/i,
      /schedule/i,
      /which.*model/i,
      /which.*ai.*model/i,
    ];

    return questions.filter(q => {
      const questionText = q.text.toLowerCase();
      
      // Check if question matches any irrelevant pattern
      const isIrrelevant = irrelevantPatterns.some(pattern => pattern.test(questionText));
      
      if (isIrrelevant) {
        console.log(`❌ Filtered out irrelevant chatbot question: "${q.text}"`);
        return false;
      }
      
      return true;
    });
  }

  /**
   * Build analysis prompt with user input
   * Enhanced with training examples for better question generation
   */
  private buildAnalysisPrompt(
    userPrompt: string,
    context?: {
      existingWorkflow?: any;
      userHistory?: any[];
    }
  ): string {
    // Get training examples for clarification questions
    let fewShotExamples = '';
    try {
      const examples = workflowTrainingService.getClarificationQuestionExamples(userPrompt, 3);
      if (examples.length > 0) {
        fewShotExamples = '\n\n## 📚 TRAINING EXAMPLES - Learn from these similar workflows:\n\n';
        examples.forEach((example, idx) => {
          fewShotExamples += `### Example ${idx + 1}:\n`;
          fewShotExamples += `**User Prompt:** "${example.userPrompt}"\n`;
          if (example.questions && example.questions.length > 0) {
            fewShotExamples += `**Relevant Questions Asked:**\n`;
            example.questions.forEach((q: any) => {
              fewShotExamples += `  - "${q.text}" (${q.category})\n`;
            });
          } else {
            fewShotExamples += `**No questions needed** - all information was clear from the prompt.\n`;
          }
          fewShotExamples += '\n';
        });
        fewShotExamples += '---\n\n';
        console.log(`📚 [Question Generation] Using ${examples.length} training examples for few-shot learning`);
      }
    } catch (error) {
      console.warn('⚠️  Failed to get training examples for question generation:', error);
    }
    const isChatbot = this.isChatbotIntent(userPrompt);
    
    let prompt = `User Request: "${userPrompt}"`;

    // Add chatbot-specific context
    if (isChatbot) {
      prompt += `\n\n🔹 CHATBOT WORKFLOW DETECTED\n`;
      prompt += `This is a chatbot workflow. The following are ALREADY DETERMINED:\n`;
      prompt += `- Trigger: ALWAYS "chat_trigger" (chatbots respond to user messages on-demand)\n`;
      prompt += `- Platform: Chatbots use AI Agent nodes, NOT Slack/Gmail/Sheets as platforms\n`;
      prompt += `- Execution: Chatbots run on-demand when users send messages (NOT scheduled)\n`;
      prompt += `- Model: ALWAYS Google Gemini (no need to ask)\n`;
      prompt += `- Memory: ALWAYS Window Buffer Memory (session-based)\n\n`;
      prompt += `❌ DO NOT ASK:\n`;
      prompt += `- "What should trigger this chatbot?" (ALWAYS chat_trigger)\n`;
      prompt += `- "Which platform or service should be used for the chatbot?" (WRONG - chatbots don't use Slack/Gmail/Sheets)\n`;
      prompt += `- "When should this workflow run?" (WRONG - chatbots run on-demand, not scheduled)\n`;
      prompt += `- "Which AI model should be used?" (ALWAYS Gemini for chatbots)\n\n`;
      prompt += `✅ ONLY ASK IF:\n`;
      prompt += `- User wants specific chatbot behavior/customization (e.g., personality, knowledge base)\n`;
      prompt += `- User wants authentication/access control for the chatbot\n`;
      prompt += `- User wants specific integrations beyond basic chat\n\n`;
    }

    // Add context if available
    if (context?.existingWorkflow) {
      prompt += `\n\nContext: User is modifying an existing workflow.`;
    }

    if (context?.userHistory && context.userHistory.length > 0) {
      prompt += `\n\nUser History: User has created ${context.userHistory.length} workflow(s) before.`;
    }

    prompt += `${fewShotExamples}\n\n## CURRENT TASK: Analyze this request and ask ONLY the most critical clarification questions needed to build a correct workflow.

CRITICAL: Follow the system prompt rules EXACTLY. Remember:
- Ask ONLY if information is REQUIRED to connect nodes correctly
- Default to NOT asking if unsure
- Wrong question is worse than no question
- Maximum 5 questions (fewer is better)

STEP 1: EXTRACT INFORMATION ALREADY MENTIONED
Before asking questions, identify what the user ALREADY mentioned:
- If prompt mentions "form trigger", "form submission", "form" → DO NOT ask about trigger type (it's a form trigger)
- If prompt mentions "schedule", "daily", "weekly", "hourly", "cron" → DO NOT ask "When should this run?" (already specified)
- If prompt mentions "email", "send email", "notify via email" → User wants email notifications
- If prompt mentions "save", "store", "save data", "store in database" → User wants to store data
- If prompt mentions "send", "notify", "alert", "message" → User wants to send notifications
- If prompt mentions "separate", "split", "categorize", "filter" → User wants data processing/transformation
- If prompt mentions "document", "Google Docs", "Word", "PDF" → User wants document output
- If prompt mentions "Google", "Google Sheets", "Google Drive", "Gmail" → DO NOT ask about Google OAuth (already handled via navbar credentials button integrated with Supabase)

STEP 2: ASK ONLY RELEVANT QUESTIONS
Based on what's ALREADY mentioned, ask ONLY about MISSING information:

❌ NEVER ask about:
- Trigger type if already mentioned (form, webhook, schedule, etc.)
- Notification method if user is NOT sending notifications (only storing/saving)
- Storage location if user is NOT storing data (only sending/notifying)
- Schedule/timing if already mentioned in prompt
- Platform if already specified (e.g., "Google Sheets", "Slack", "Gmail")
- Google OAuth credentials (already handled via navbar credentials button integrated with Supabase)
- "Which Google account should be used?" (Google OAuth is integrated via navbar)

✅ ONLY ask about:
- Missing trigger details (e.g., if "form" mentioned but not clear what fields)
- Missing destination details (e.g., "save data" but not where - Google Sheets? Database? File?)
- Missing processing details (e.g., "separate data" but not how - by field? by condition?)
- Missing format details (e.g., "document" but not what format - Google Docs? PDF? Word?)
- Missing platform selection if multiple options exist (e.g., "send notification" but not which platform)
<<<<<<< HEAD
- **For Google Sheets:** Google Sheets URL and Sheet Name (tab name) - DO NOT ask for credentials
- **For Google Docs:** Google Docs URL - DO NOT ask for credentials
- **For other services requiring credentials:** Ask for credentials ONLY if not stored in environment variables (e.g., Slack token, SMTP credentials, database credentials)

STEP 3: QUESTION RELEVANCE CHECK
For each question, verify:
1. Is this information ALREADY in the prompt? → DON'T ASK
2. Is this information needed to build the workflow? → ASK
3. Does this affect which nodes are used? → ASK
4. Is this just a preference that doesn't change workflow structure? → DON'T ASK (use defaults)

EXAMPLES:

User prompt: "take the user data via form trigger like name, age, email, etc and separate male and female data and save data in the document"
✅ CORRECT questions:
- "What document format should be used?" (Google Docs, Word, PDF, etc.)
- "How should male and female data be separated?" (Separate files, separate sheets, separate sections)
- "What fields should be captured in the form?" (if not clear - but name, age, email already mentioned)

❌ WRONG questions:
- "How should this workflow be triggered?" (ALREADY MENTIONED: form trigger)
- "How to send notifications?" (NOT RELEVANT: user is saving, not sending)
- "Where to store data?" (ALREADY MENTIONED: document)
- "When should this workflow run?" (NOT RELEVANT: form trigger = event-based, not scheduled)

User prompt: "read data from the google sheets and send readed data to the slack message"
✅ CORRECT questions:
- "What is the Google Sheets URL?" (if not provided)
- "What is the sheet name/tab name?" (e.g., "Sheet1", "Data", "Sales") - REQUIRED for Google Sheets
- "Which Slack channel should receive the messages?" (if not specified)
- "What is your Slack Bot Token or Webhook URL?" (if not in environment variables)
- "How should the data be formatted in the message?" (table, list, summary, etc.)

❌ WRONG questions:
- "How should this workflow be triggered?" (NOT SPECIFIED but can infer: manual or schedule - ask only if critical)
- "Where to store data?" (NOT RELEVANT: user is sending, not storing)
- "How to send notifications?" (ALREADY MENTIONED: Slack)
- "What are your Google OAuth credentials?" (Google credentials handled via navbar button)

User prompt: "When a user submits a form, save the lead details to Google Sheets, notify my sales team in Slack with full lead info, and automatically send a personalized follow-up email"
✅ CORRECT questions:
- "Which form fields should be captured?" (Name, Email, Phone, Message, All of the above)
- "What is the Google Sheets URL?" (if not provided)
- "What is the sheet name/tab name?" (e.g., "Sheet1", "Data") - REQUIRED for Google Sheets
- "How should data be stored in Google Sheets?" (Append to existing sheet, Update existing rows, Create new sheet)
- "What is your Slack Bot Token or Webhook URL?" (if not in environment variables)
- "What type of Slack notification should be sent?" (Channel message, Direct message, Both)
- "What information should be included in the Slack message?" (Full lead details, Summary only, Custom fields)
- "What are your SMTP credentials?" (if not in environment variables - for email sending)
- "Should a personalized follow-up email be sent?" (Yes, No)
- "How should the email be generated?" (Template-based, AI-generated, Hybrid - only if email is enabled)

❌ WRONG questions:
- "How should this workflow be triggered?" (ALREADY MENTIONED: form submission)
- "When should this workflow run?" (NOT RELEVANT: form trigger = event-based)
- "What document format should be used for saving data in Google Sheets?" (NOT RELEVANT: Google Sheets has its own format)
- "How should male and female data be separated?" (NOT RELEVANT: not mentioned)
- "How to send notifications?" (ALREADY MENTIONED: Slack)
- "What are your Google OAuth credentials?" (Google credentials handled via navbar button)

User prompt: "post to social media daily morning"
✅ CORRECT questions:
- "Which social media platform?" (Instagram, LinkedIn, Twitter, etc.)
- "What time should the post be published?" (specific time)
- "Where should the post content come from?" (manual, AI-generated, document, etc.)

❌ WRONG questions:
- "When should this workflow run?" (ALREADY MENTIONED: daily morning)
- "How should this workflow be triggered?" (ALREADY MENTIONED: schedule/daily)

FINAL RULES:
1. Extract information already mentioned BEFORE asking questions
2. Ask ONLY about missing critical information
3. NEVER ask about things already in the prompt
4. NEVER ask about notifications if user is storing/saving (not sending)
5. NEVER ask about storage if user is sending/notifying (not storing)
6. NEVER ask redundant questions
7. Maximum 3-5 questions, only if truly needed

<<<<<<< HEAD
CREDENTIAL HANDLING RULES:
1. **Google Services (Sheets, Docs, Gmail):** 
   - DO NOT ask for Google OAuth credentials (handled via navbar button)
   - DO ask for: Google Sheets URL + Sheet Name (for Sheets), Google Docs URL (for Docs)
2. **Other Services (Slack, Email, Database, etc.):**
   - Ask for credentials ONLY if not stored in environment variables
   - Ask clearly: "What is your [SERVICE] [CREDENTIAL_TYPE]?" (e.g., "What is your Slack Bot Token?")
3. **Ollama/AI Agent:** No credentials needed (uses local Ollama)

CRITICAL: You MUST respond with ONLY valid JSON. Do NOT include any markdown formatting, explanations, or text outside the JSON object. Your response must start with { and end with }. No code blocks, no markdown, just raw JSON.

Return ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "summary": "20-30 word summary of what you understood",
  "questions": [
    {
      "id": "q1",
      "text": "Clear, specific question (one sentence, NOT generic)",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "category": "node_selection|content|schedule|credentials|destination|error_handling|data_source|preferences|other"
    }
  ],
  "intent": "dataSync|notification|transformation|apiIntegration|scheduledTask|chatbot|other",
  "entities": ["entity1", "entity2"],
  "implicitRequirements": ["requirement1", "requirement2"]
}`;

    return prompt;
  }

  /**
   * Remove duplicate questions based on semantic similarity
   */
  private deduplicateQuestions(questions: Question[]): Question[] {
    const seen = new Set<string>();
    const normalized = new Map<string, number>();
    
    return questions.filter((q, index) => {
      // Normalize question text for comparison
      const normalizedText = q.text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Check for exact duplicates
      if (seen.has(normalizedText)) {
        console.log(`⚠️  [Question Deduplication] Removed duplicate question: "${q.text}"`);
        return false;
      }
      
      // Check for similar questions (same keywords)
      const keywords = normalizedText.split(' ').filter(w => w.length > 3);
      const key = keywords.sort().join(' ');
      
      if (normalized.has(key)) {
        console.log(`⚠️  [Question Deduplication] Removed similar question: "${q.text}" (similar to question ${normalized.get(key)! + 1})`);
        return false;
      }
      
      seen.add(normalizedText);
      normalized.set(key, index);
      return true;
    });
  }

  /**
   * Parse AI response into AnalysisResult
   */
  private parseAnalysisResponse(response: any, userPrompt: string): AnalysisResult {
    try {
      // Extract JSON from response
      let content = typeof response === 'string' ? response : response.content || JSON.stringify(response);
      
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        content = jsonMatch[1];
      } else {
        // Try to find JSON object in the response
        const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          content = jsonObjectMatch[0];
        }
      }

      // Try to parse JSON, with better error handling
      let parsed: any;
      try {
        // First, try to find JSON object in the response (most common case)
        const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          parsed = JSON.parse(jsonObjectMatch[0]);
        } else {
          parsed = JSON.parse(content);
        }
      } catch (parseError) {
        console.error('❌ Error parsing analysis response as JSON:', parseError);
        console.error('Response content (first 1000 chars):', content.substring(0, 1000));
        
        // Try multiple extraction strategies
        let extractedJson: string | null = null;
        
        // Strategy 1: Extract from markdown code blocks
        const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
          extractedJson = codeBlockMatch[1];
        }
        
        // Strategy 2: Find first JSON object
        if (!extractedJson) {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extractedJson = jsonMatch[0];
          }
        }
        
        // Strategy 3: Find JSON after "Return" or "Output"
        if (!extractedJson) {
          const afterReturn = content.split(/return|output|json/i).pop();
          if (afterReturn) {
            const jsonMatch = afterReturn.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              extractedJson = jsonMatch[0];
            }
          }
        }
        
        if (extractedJson) {
          try {
            parsed = JSON.parse(extractedJson);
            console.log('✅ Successfully extracted JSON from response');
          } catch {
            // Fallback to generating questions from the text
            console.warn('⚠️  Could not parse extracted JSON, using fallback questions');
            return this.generateFallbackQuestions(userPrompt);
          }
        } else {
          // Fallback to generating questions from the text
          console.warn('⚠️  Could not find JSON in response, using fallback questions');
          return this.generateFallbackQuestions(userPrompt);
        }
      }

      // Validate and normalize
      const result: AnalysisResult = {
        summary: this.normalizeSummary(parsed.summary || this.generateFallbackSummary(userPrompt)),
        questions: this.normalizeQuestions(parsed.questions || []),
        intent: parsed.intent,
        entities: parsed.entities || [],
        implicitRequirements: parsed.implicitRequirements || [],
      };

      // Remove duplicates before checking count
      result.questions = this.deduplicateQuestions(this.normalizeQuestions(result.questions));

      // CRITICAL: Filter out Google OAuth questions (handled via navbar credentials button)
      result.questions = this.filterGoogleOAuthQuestions(result.questions);

      // CRITICAL: Filter out irrelevant questions for chatbot workflows
      if (this.isChatbotIntent(userPrompt)) {
        console.log('🤖 Chatbot workflow detected - filtering irrelevant questions');
        result.questions = this.filterChatbotQuestions(result.questions);
      }

      // CRITICAL FIX: Do NOT ask credential questions here - they will be asked AFTER structure is generated
      // Credentials should only be asked when we know which nodes actually need them
      // This prevents asking for random credentials before understanding the workflow structure

      // Ensure we have at least 3 questions (but don't add duplicates)
      if (result.questions.length < 3) {
        const fallback = this.generateFallbackQuestions(userPrompt);
        const existingTexts = new Set(result.questions.map(q => q.text.toLowerCase().trim()));
        
        for (const fallbackQ of fallback.questions) {
          if (result.questions.length >= 5) break;
          const fallbackText = fallbackQ.text.toLowerCase().trim();
          const isDuplicate = Array.from(existingTexts).some(existing => 
            this.calculateTextSimilarity(fallbackText, existing) > 0.85
          );
          if (!isDuplicate) {
            result.questions.push(fallbackQ);
            existingTexts.add(fallbackText);
          }
        }
      }

      return result;
    } catch (error) {
      console.error('❌ Error parsing analysis response:', error);
      return this.generateFallbackQuestions(userPrompt);
    }
  }

  /**
   * Normalize summary to 20-30 words
   */
  private normalizeSummary(summary: string): string {
    const words = summary.trim().split(/\s+/);
    if (words.length >= 20 && words.length <= 30) {
      return summary.trim();
    }
    
    // Adjust to 20-30 words
    if (words.length < 20) {
      // Add context if too short
      return summary.trim() + ' workflow automation with error handling and validation.';
    } else {
      // Trim if too long
      return words.slice(0, 30).join(' ') + '.';
    }
  }

  /**
   * Normalize questions array with deduplication
   */
  private normalizeQuestions(questions: any[]): Question[] {
    const normalized = questions
      .slice(0, 5) // Max 5 questions
      .map((q, index) => ({
        id: q.id || `q${index + 1}`,
        text: this.cleanQuestionText(q.text || q.question || ''),
        options: this.normalizeOptions(q.options || []),
        category: this.normalizeCategory(q.category),
      }))
      .filter(q => q.text.length > 0 && q.options.length >= 2);

    // Remove duplicates based on text similarity
    const uniqueQuestions: Question[] = [];
    const seenTexts = new Set<string>();

    for (const question of normalized) {
      const normalizedText = question.text.toLowerCase().trim();
      const isDuplicate = Array.from(seenTexts).some(seen => {
        // Check if questions are too similar (same meaning)
        const similarity = this.calculateTextSimilarity(normalizedText, seen);
        return similarity > 0.85; // 85% similarity threshold
      });

      if (!isDuplicate) {
        seenTexts.add(normalizedText);
        uniqueQuestions.push(question);
      }
    }

    return uniqueQuestions;
  }

  /**
   * Calculate text similarity between two strings (simple word overlap)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 2));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Detect if AI Agent or LLM functionality is needed based on user prompt
   */
  private detectAIFunctionalityNeeded(userPrompt: string, analysis: AnalysisResult): boolean {
    const lowerPrompt = userPrompt.toLowerCase();
    
    // Direct AI-related keywords
    const aiKeywords = [
      'ai agent', 'ai assistant', 'chatbot', 'chat bot', 'llm', 'language model',
      'generate', 'analyze', 'summarize', 'classify', 'sentiment', 'intent',
      'natural language', 'nlp', 'text analysis', 'content generation',
      'ai-powered', 'ai powered', 'using ai', 'with ai', 'ai model',
      'gpt', 'claude', 'gemini', 'openai', 'anthropic', 'ollama'
    ];
    
    // Check if prompt contains AI-related keywords
    const hasAIKeywords = aiKeywords.some(keyword => lowerPrompt.includes(keyword));
    
    // Check if intent suggests AI usage
    const aiIntents = ['chatbot', 'transformation', 'notification'];
    const hasAIIntent = analysis.intent && aiIntents.includes(analysis.intent);
    
    // Check if questions suggest AI usage (e.g., asking about AI providers)
    const hasAIQuestion = analysis.questions.some(q => 
      q.text.toLowerCase().includes('ai') ||
      q.text.toLowerCase().includes('model') ||
      q.text.toLowerCase().includes('provider') ||
      q.category === 'node_selection' && (
        q.options.some(opt => opt.toLowerCase().includes('ai') || 
                            opt.toLowerCase().includes('gpt') ||
                            opt.toLowerCase().includes('claude') ||
                            opt.toLowerCase().includes('gemini'))
      )
    );
    
    // Check implicit requirements
    const hasAIRequirement = analysis.implicitRequirements?.some(req => 
      req.toLowerCase().includes('ai') ||
      req.toLowerCase().includes('llm') ||
      req.toLowerCase().includes('model')
    );
    
    return hasAIKeywords || hasAIIntent || hasAIQuestion || hasAIRequirement || false;
  }

  /**
   * Clean question text (remove option letters, etc.)
   */
  private cleanQuestionText(text: string): string {
    // Remove option letters like "(A)", "(B)", etc.
    return text
      .replace(/\([A-D]\)\s*/g, '')
      .replace(/^[A-D]\.\s*/g, '')
      .trim();
  }

  /**
   * Normalize options array
   */
  private normalizeOptions(options: any[]): string[] {
    return options
      .slice(0, 4) // Max 4 options
      .map(opt => {
        const text = typeof opt === 'string' ? opt : opt.text || opt.label || String(opt);
        // Remove option letters
        return text.replace(/^[A-D][\.\)]\s*/, '').trim();
      })
      .filter(opt => opt.length > 0);
  }

  /**
   * Normalize category
   */
  private normalizeCategory(category: any): QuestionCategory {
    const validCategories: QuestionCategory[] = [
      'node_selection',
      'content',
      'schedule',
      'authentication',
      'credentials',
      'destination',
      'error_handling',
      'data_source',
      'preferences',
      'other',
    ];
    
    if (typeof category === 'string' && validCategories.includes(category as QuestionCategory)) {
      return category as QuestionCategory;
    }
    
    return 'other';
  }

  /**
   * Generate fallback questions if AI fails
   */
  private generateFallbackQuestions(userPrompt: string): AnalysisResult {
    const lowerPrompt = userPrompt.toLowerCase();
    
    // CRITICAL: For chatbot workflows, return no questions (workflow can be built directly)
    if (this.isChatbotIntent(userPrompt)) {
      console.log('✅ Chatbot workflow detected in fallback - returning no questions');
      return {
        summary: this.generateFallbackSummary(userPrompt),
        questions: [],
        intent: 'chatbot',
        entities: [],
        implicitRequirements: [],
      };
    }
    
    // Detect intent
    let questions: Question[] = [];
    
    // Social media posting
    if (lowerPrompt.includes('social media') || lowerPrompt.includes('post') || lowerPrompt.includes('instagram') || lowerPrompt.includes('twitter') || lowerPrompt.includes('linkedin') || lowerPrompt.includes('facebook')) {
      questions = [
        {
          id: 'q1',
          text: 'Which social media platform do you want to post on?',
          options: ['Instagram', 'LinkedIn', 'Twitter / X', 'Facebook', 'Multiple platforms'],
          category: 'node_selection' as QuestionCategory,
        },
        {
          id: 'q2',
          text: 'What time should the post be published?',
          options: ['Select a specific time (e.g., 9:00 AM)', 'Use platform\'s best-time suggestion', 'Morning (6-9 AM)', 'Afternoon (12-3 PM)'],
          category: 'schedule' as QuestionCategory,
        },
        {
          id: 'q3',
          text: 'Where should the post content come from?',
          options: ['Manually written text', 'AI-generated content', 'From a document or spreadsheet', 'Template with variables'],
          category: 'content' as QuestionCategory,
        },
      ];
    } else if (lowerPrompt.includes('sync') || lowerPrompt.includes('copy') || lowerPrompt.includes('import')) {
      questions = [
        {
          id: 'q1',
          text: 'What is the source system or data location?',
          options: ['API endpoint', 'Database', 'File/Spreadsheet', 'Another service'],
          category: 'data_source' as QuestionCategory,
        },
        {
          id: 'q2',
          text: 'What is the destination system?',
          options: ['Database', 'API endpoint', 'File/Spreadsheet', 'Another service'],
          category: 'destination' as QuestionCategory,
        },
        {
          id: 'q3',
          text: 'How often should the sync run?',
          options: ['Daily', 'Hourly', 'Weekly', 'On demand'],
          category: 'schedule' as QuestionCategory,
        },
      ];
    } else if (lowerPrompt.includes('notify') || lowerPrompt.includes('alert') || lowerPrompt.includes('send')) {
      questions = [
        {
          id: 'q1',
          text: 'What should trigger the notification?',
          options: ['Specific event', 'Scheduled time', 'Error condition', 'Data change'],
          category: 'content' as QuestionCategory,
        },
        {
          id: 'q2',
          text: 'Where should the notification be sent?',
          options: ['Email', 'Slack', 'SMS', 'Multiple channels'],
          category: 'destination' as QuestionCategory,
        },
        {
          id: 'q3',
          text: 'What information should the notification include?',
          options: ['Basic status', 'Detailed data', 'Error details', 'Custom message'],
          category: 'content' as QuestionCategory,
        },
      ];
    } else {
      // Generic questions - More specific than before
      questions = [
        {
          id: 'q1',
          text: 'How should this workflow be triggered?',
          options: ['Fixed Schedule', 'Regular Intervals', 'Event Trigger', 'Manual Run'],
          category: 'schedule' as QuestionCategory,
        },
        {
          id: 'q2',
          text: 'What platform or service should be used?',
          options: ['Specify platform', 'Multiple platforms', 'No specific platform', 'Let system choose'],
          category: 'node_selection' as QuestionCategory,
        },
      ];
    }

    return {
      summary: this.generateFallbackSummary(userPrompt),
      questions,
      intent: 'other',
      entities: [],
      implicitRequirements: [],
    };
  }

  /**
   * Generate fallback summary
   */
  private generateFallbackSummary(userPrompt: string): string {
    const words = userPrompt.split(/\s+/).slice(0, 25);
    return words.join(' ') + ' workflow automation with error handling and validation.';
  }
}

// Export singleton instance
export const workflowAnalyzer = new WorkflowAnalyzer();
