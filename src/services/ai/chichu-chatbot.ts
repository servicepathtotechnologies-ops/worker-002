// Chichu - Website AI Chatbot
// Enhanced chatbot with knowledge base and conversation memory

import { ollamaOrchestrator } from './ollama-orchestrator';
import { readFileSync } from 'fs';
import { join } from 'path';

interface Conversation {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatContext {
  message: string;
  history: Conversation[];
  knowledge: any;
  context?: any;
  analysis?: any;
}

interface MessageAnalysis {
  intent: string;
  confidence: number;
  entities: any[];
  requiresAction: boolean;
  suggestedActions?: string[];
}

export class ChichuChatbot {
  private knowledgeBase: any = null;
  private conversationMemory: Map<string, Conversation[]> = new Map();
  private maxHistoryLength = 20;

  constructor() {
    this.loadKnowledgeBase();
  }

  private loadKnowledgeBase(): void {
    try {
      const knowledgePath = join(__dirname, '../../data/website_knowledge.json');
      const knowledgeText = readFileSync(knowledgePath, 'utf-8');
      this.knowledgeBase = JSON.parse(knowledgeText);
      console.log('✅ Chichu knowledge base loaded');
    } catch (error) {
      console.error('❌ Failed to load knowledge base:', error);
      this.knowledgeBase = this.getFallbackKnowledge();
    }
  }

  private getFallbackKnowledge(): any {
    return {
      product: {
        name: 'CtrlChecks',
        description: 'AI-native workflow automation platform',
      },
      faqs: [],
      personality: {
        tone: 'friendly',
        greeting: 'Hello! How can I help you today?',
      },
    };
  }

  async handleMessage(
    sessionId: string,
    message: string,
    context?: any
  ): Promise<{
    response: string;
    analysis: MessageAnalysis;
    suggestedActions?: string[];
    confidence: number;
  }> {
    console.log(`💬 Chichu processing message from session ${sessionId}`);
    
    // 1. Retrieve conversation history
    const history = this.getConversationHistory(sessionId);
    
    // 2. Check for greetings first (before FAQ matching)
    const greetingResponse = this.handleGreeting(message, history.length === 0);
    if (greetingResponse) {
      const greetingAnalysis: MessageAnalysis = {
        intent: 'greeting',
        confidence: 0.95,
        entities: [],
        requiresAction: false,
      };
      return {
        response: greetingResponse,
        analysis: greetingAnalysis,
        confidence: 0.95,
      };
    }
    
    // 3. Quick FAQ check (no LLM call needed)
    const matchedFAQ = this.findMatchingFAQ(message);
    if (matchedFAQ) {
      const quickAnalysis: MessageAnalysis = {
        intent: 'question',
        confidence: 0.9,
        entities: [],
        requiresAction: false,
      };
      return {
        response: matchedFAQ.answer,
        analysis: quickAnalysis,
        confidence: 0.9,
      };
    }
    
    // 4. Retrieve relevant knowledge (no LLM call)
    const knowledge = await this.retrieveRelevantKnowledge(message, {
      intent: 'question',
      confidence: 0.7,
      entities: [],
      requiresAction: false,
    });
    
    // 5. Generate response directly (single LLM call instead of 2)
    // Skip separate intent analysis - the model can infer intent from context
    const response = await this.generateResponse({
      message,
      history,
      knowledge,
      context,
    });
    
    // 6. Update conversation memory
    this.updateConversation(sessionId, message, response);
    
    // 7. Simple analysis without LLM call
    const analysis: MessageAnalysis = {
      intent: 'question',
      confidence: 0.8,
      entities: [],
      requiresAction: false,
    };
    
    return {
      response,
      analysis,
      confidence: 0.8,
    };
  }

  private handleGreeting(message: string, isFirstMessage: boolean): string | null {
    const lowerMessage = message.toLowerCase().trim();
    
    // Greeting patterns - more flexible to catch variations
    const greetingPatterns = [
      /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening))[!.]?$/i,
      /^(hi|hello|hey)\s+(i\s+am|i'm|my\s+name\s+is|this\s+is)/i,
      /^(hi|hello|hey)\s*[,.]?\s*(i\s+am|i'm|my\s+name\s+is|this\s+is)/i,
    ];
    
    // Check if message starts with a greeting
    const isGreeting = greetingPatterns.some(pattern => pattern.test(lowerMessage));
    
    if (isGreeting) {
      // Extract name if present - more flexible pattern
      const nameMatch = lowerMessage.match(/(?:i\s+am|i'm|my\s+name\s+is|this\s+is)\s+([a-z]+(?:\s+[a-z]+)?)/i);
      const name = nameMatch ? nameMatch[1].trim() : null;
      
      if (isFirstMessage) {
        // First message greeting
        if (name) {
          return `Hello ${name}! 👋 Nice to meet you! I'm Chichu, your AI assistant for CtrlChecks. I'm here to help you build amazing workflows and automations. What would you like to know?`;
        } else {
          return this.knowledgeBase?.personality?.greeting || 
                 "Hello! 👋 I'm Chichu, your AI assistant for CtrlChecks. I'm here to help you build amazing workflows and automations. How can I assist you today?";
        }
      } else {
        // Subsequent greeting
        if (name) {
          return `Hello again ${name}! 👋 How can I help you today?`;
        } else {
          return `Hello! 👋 How can I help you today?`;
        }
      }
    }
    
    return null;
  }

  async analyzeMessage(message: string): Promise<MessageAnalysis> {
    // OPTIMIZED: Skip LLM call for intent analysis - use simple keyword matching instead
    // This saves ~60-80 seconds per request
    const lowerMessage = message.toLowerCase();
    
    // Simple intent detection without LLM
    let intent = 'question';
    if (lowerMessage.includes('help') || lowerMessage.includes('how')) {
      intent = 'help';
    } else if (lowerMessage.includes('feedback') || lowerMessage.includes('suggest')) {
      intent = 'feedback';
    } else if (lowerMessage.includes('do') || lowerMessage.includes('create') || lowerMessage.includes('make')) {
      intent = 'command';
    }
    
    return {
      intent,
      confidence: 0.8,
      entities: [],
      requiresAction: false,
      suggestedActions: [],
    };
  }

  private async retrieveRelevantKnowledge(
    message: string,
    analysis: MessageAnalysis
  ): Promise<any> {
    // Simple keyword matching for now
    // Can be enhanced with embeddings/semantic search
    const keywords = message.toLowerCase().split(/\s+/);
    const relevantFAQs = this.knowledgeBase?.faqs?.filter((faq: any) => {
      const faqText = `${faq.question} ${faq.answer}`.toLowerCase();
      return keywords.some(keyword => faqText.includes(keyword));
    }) || [];
    
    return {
      faqs: relevantFAQs.slice(0, 3), // Top 3 relevant FAQs
      product: this.knowledgeBase?.product,
      features: this.knowledgeBase?.features,
    };
  }

  async generateResponse(context: ChatContext): Promise<string> {
    const prompt = this.buildChatPrompt(context);
    
    try {
      // Use faster model and lower token limit for quicker responses
      const result = await ollamaOrchestrator.processRequest('chat-generation', {
        prompt,
        system: `You are Chichu, a helpful AI assistant for CtrlChecks workflow platform. 
Be friendly, informative, and concise. Keep responses under 200 words.
Use the knowledge base provided to answer questions accurately.
If you don't know something, admit it and suggest contacting support.`,
        temperature: 0.7,
        max_tokens: 300, // Reduced from 500 for faster generation
      });
      
      return this.enhanceResponse(result, context);
    } catch (error) {
      console.error('Error generating response:', error);
      return this.getFallbackResponse(context.message);
    }
  }

  private buildChatPrompt(context: ChatContext): string {
    const { message, history, knowledge, analysis } = context;
    
    let prompt = `You are Chichu, the AI assistant for CtrlChecks.\n\n`;
    
    // Add knowledge base
    if (knowledge.product) {
      prompt += `Product Information:\n`;
      prompt += `- Name: ${knowledge.product.name}\n`;
      prompt += `- Description: ${knowledge.product.description}\n\n`;
    }
    
    // Add relevant FAQs
    if (knowledge.faqs && knowledge.faqs.length > 0) {
      prompt += `Relevant FAQs:\n`;
      knowledge.faqs.forEach((faq: any) => {
        prompt += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
      });
    }
    
    // Add conversation history
    if (history.length > 0) {
      prompt += `Conversation History:\n`;
      history.slice(-5).forEach((conv: Conversation) => {
        prompt += `${conv.role}: ${conv.content}\n`;
      });
      prompt += `\n`;
    }
    
    // Add current message
    prompt += `User: ${message}\n\n`;
    prompt += `Chichu:`;
    
    return prompt;
  }

  private enhanceResponse(response: string, context: ChatContext): string {
    // Post-process response
    let enhanced = response.trim();
    
    // Remove any markdown code blocks if present
    enhanced = enhanced.replace(/```[\s\S]*?```/g, '');
    
    // Ensure response ends properly
    if (!enhanced.match(/[.!?]$/)) {
      enhanced += '.';
    }
    
    return enhanced;
  }

  private getFallbackResponse(message: string): string {
    // Check for FAQ match
    const matchedFAQ = this.findMatchingFAQ(message);
    if (matchedFAQ) {
      return matchedFAQ.answer;
    }
    
    return this.knowledgeBase?.personality?.fallback || 
           "I'm sorry, I'm having trouble understanding that. Could you rephrase your question?";
  }

  private findMatchingFAQ(message: string): any {
    if (!this.knowledgeBase?.faqs) return null;
    
    const lowerMessage = message.toLowerCase().trim();
    
    // Skip FAQ matching for simple greetings or personal introductions
    const isSimpleGreeting = /^(hi|hello|hey|greetings)[!.]?$/i.test(lowerMessage);
    const isPersonalIntro = /^(hi|hello|hey)[!.]?\s*(i\s+am|i'm|my\s+name\s+is|this\s+is)/i.test(lowerMessage);
    if (isSimpleGreeting || isPersonalIntro) {
      return null; // Let greeting handler deal with this
    }
    
    // Filter out common words and short words (less than 3 chars)
    const keywords = lowerMessage.split(/\s+/).filter((kw: string) => 
      kw.length > 2 && 
      !['the', 'and', 'or', 'but', 'for', 'are', 'you', 'can', 'what', 'how', 'when', 'where', 'why'].includes(kw)
    );
    
    // Require at least 3 matching keywords for FAQ match (more strict)
    // This prevents false matches on greetings or simple messages
    for (const faq of this.knowledgeBase.faqs) {
      const faqKeywords = (faq.keywords || []).map((k: string) => k.toLowerCase());
      const questionKeywords = faq.question.toLowerCase().split(/\s+/).filter((kw: string) => kw.length > 2);
      const answerKeywords = (faq.answer || '').toLowerCase().split(/\s+/).filter((kw: string) => kw.length > 2);
      const allKeywords = [...faqKeywords, ...questionKeywords, ...answerKeywords];
      
      const matchCount = keywords.filter(kw => 
        allKeywords.some(fk => fk.includes(kw) || kw.includes(fk))
      ).length;
      
      // Require at least 3 matching keywords (more strict matching)
      if (matchCount >= 3) {
        return faq;
      }
    }
    
    return null;
  }

  getConversationHistory(sessionId: string): Conversation[] {
    return this.conversationMemory.get(sessionId) || [];
  }

  private updateConversation(
    sessionId: string,
    userMessage: string,
    assistantResponse: string
  ): void {
    let history = this.conversationMemory.get(sessionId) || [];
    
    // Add user message
    history.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    });
    
    // Add assistant response
    history.push({
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date().toISOString(),
    });
    
    // Limit history length
    if (history.length > this.maxHistoryLength) {
      history = history.slice(-this.maxHistoryLength);
    }
    
    this.conversationMemory.set(sessionId, history);
  }

  clearConversation(sessionId: string): void {
    this.conversationMemory.delete(sessionId);
  }
}

// Export singleton instance
export const chichuChatbot = new ChichuChatbot();
