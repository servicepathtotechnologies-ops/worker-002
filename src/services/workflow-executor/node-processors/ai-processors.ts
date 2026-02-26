// AI Node Processors - All AI operations use Ollama
// Replaces external AI APIs in workflow nodes

import { aiAdapter } from '../../../services/ai/ai-adapter';
import { ollamaManager } from '../../../services/ai/ollama-manager';
import { metricsTracker } from '../../../services/ai/metrics-tracker';
import { performanceOptimizer } from '../../../services/ai/performance-optimizer';

export interface AIProcessorInput {
  text?: string;
  image?: string; // base64
  audio?: string; // base64
  context?: string;
  [key: string]: any;
}

export interface AIProcessorConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  [key: string]: any;
}

/**
 * Text Analysis Processor
 * Analyzes text for sentiment, topics, entities, etc.
 */
export class TextAnalysisProcessor {
  async process(input: AIProcessorInput, config: AIProcessorConfig): Promise<any> {
    const startTime = Date.now();
    
    try {
      const { text, analysisType = 'general' } = input;
      if (!text) {
        throw new Error('Text input is required');
      }

      const systemPrompt = config.systemPrompt || 
        `You are a text analysis expert. Analyze the text and provide insights based on the analysis type: ${analysisType}`;

      const prompt = `Analyze this text (Analysis type: ${analysisType}):\n\n${text}\n\nProvide a detailed analysis.`;

      const cacheKey = performanceOptimizer.generateCacheKey(prompt, {
        analysisType,
        model: config.model || 'qwen2.5:14b-instruct-q4_K_M',
      });

      const result = await performanceOptimizer.getCachedResponse(
        cacheKey,
        () => aiAdapter.textGeneration(prompt, {
          model: config.model || 'qwen2.5:14b-instruct-q4_K_M',
          system: systemPrompt,
          temperature: config.temperature ?? 0.7,
          max_tokens: config.maxTokens,
        })
      );

      const duration = Date.now() - startTime;
      metricsTracker.trackRequest(config.model || 'qwen2.5:14b-instruct-q4_K_M', true, duration);

      return {
        analysis: result,
        analysisType,
        model: config.model || 'qwen2.5:14b-instruct-q4_K_M',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      metricsTracker.trackRequest(config.model || 'qwen2.5:14b-instruct-q4_K_M', false, duration, 'text-analysis-error');
      throw error;
    }
  }
}

/**
 * Code Generation Processor
 * Generates code based on requirements
 */
export class CodeGeneratorProcessor {
  async process(input: AIProcessorInput, config: AIProcessorConfig): Promise<any> {
    const startTime = Date.now();
    
    try {
      const { requirements, language, framework } = input;
      if (!requirements) {
        throw new Error('Requirements are required for code generation');
      }

      const code = await aiAdapter.codeGeneration(requirements, {
        language: language || config.language,
        framework: framework || config.framework,
        temperature: config.temperature ?? 0.3,
      });

      const duration = Date.now() - startTime;
      metricsTracker.trackRequest('qwen2.5-coder:7b', true, duration);

      return {
        generatedCode: code,
        language: language || config.language,
        framework: framework || config.framework,
        model: 'qwen2.5-coder:7b',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      metricsTracker.trackRequest('qwen2.5-coder:7b', false, duration, 'code-generation-error');
      throw error;
    }
  }
}

/**
 * Image Understanding Processor
 * Image analysis (removed - multimodal not supported)
 */
export class ImageUnderstandingProcessor {
  async process(input: AIProcessorInput, config: AIProcessorConfig): Promise<any> {
    // Multimodal functionality has been removed
    throw new Error('Image understanding functionality has been removed. Multimodal features are no longer supported.');
  }
}

/**
 * Chat/Conversation Processor
 * Handles conversational AI interactions
 */
export class ChatProcessor {
  async process(input: AIProcessorInput, config: AIProcessorConfig): Promise<any> {
    const startTime = Date.now();
    
    try {
      const { message, conversationHistory = [] } = input;
      if (!message) {
        throw new Error('Message is required');
      }

      const messages = [
        ...(config.systemPrompt ? [{ role: 'system' as const, content: config.systemPrompt }] : []),
        ...conversationHistory,
        { role: 'user' as const, content: message },
      ];

      const response = await aiAdapter.chat(messages, {
        model: config.model || 'qwen2.5:14b-instruct-q4_K_M',
        temperature: config.temperature ?? 0.7,
      });

      const duration = Date.now() - startTime;
      metricsTracker.trackRequest(config.model || 'qwen2.5:14b-instruct-q4_K_M', true, duration);

      return {
        response,
        conversationHistory: [
          ...messages,
          { role: 'assistant' as const, content: response },
        ],
        model: config.model || 'qwen2.5:14b-instruct-q4_K_M',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      metricsTracker.trackRequest(config.model || 'qwen2.5:14b-instruct-q4_K_M', false, duration, 'chat-error');
      throw error;
    }
  }
}

/**
 * Document Analysis Processor
 * Analyzes documents (PDF, DOCX, etc.)
 */
export class DocumentAnalysisProcessor {
  async process(input: AIProcessorInput, config: AIProcessorConfig): Promise<any> {
    const startTime = Date.now();
    
    try {
      const { documentText, focusAreas = [] } = input;
      if (!documentText) {
        throw new Error('Document text is required');
      }

      const focusPrompt = focusAreas.length > 0
        ? `Focus on: ${focusAreas.join(', ')}`
        : '';

      const prompt = `Analyze this document:\n\n${documentText}\n\n${focusPrompt}\n\nProvide a comprehensive analysis.`;

      const analysis = await aiAdapter.textGeneration(prompt, {
        model: config.model || 'qwen2.5:14b-instruct-q4_K_M',
        system: 'You are an expert document analyst. Provide detailed, structured analysis.',
        temperature: config.temperature ?? 0.5,
        max_tokens: config.maxTokens || 2000,
      });

      // Generate summary
      const summary = await aiAdapter.summarize(analysis, {
        maxLength: 200,
      });

      const duration = Date.now() - startTime;
      metricsTracker.trackRequest(config.model || 'qwen2.5:14b-instruct-q4_K_M', true, duration);

      return {
        documentAnalysis: analysis,
        summary,
        focusAreas,
        model: config.model || 'qwen2.5:14b-instruct-q4_K_M',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      metricsTracker.trackRequest(config.model || 'qwen2.5:14b-instruct-q4_K_M', false, duration, 'document-analysis-error');
      throw error;
    }
  }
}

/**
 * Summarization Processor
 * Summarizes text content
 */
export class SummarizationProcessor {
  async process(input: AIProcessorInput, config: AIProcessorConfig): Promise<any> {
    const startTime = Date.now();
    
    try {
      const { text, maxLength, focus } = input;
      if (!text) {
        throw new Error('Text input is required');
      }

      const summary = await aiAdapter.summarize(text, {
        maxLength: maxLength || config.maxLength,
        focus: focus || config.focus,
      });

      const duration = Date.now() - startTime;
      metricsTracker.trackRequest('qwen2.5:14b-instruct-q4_K_M', true, duration);

      return {
        summary,
        originalLength: text.length,
        summaryLength: summary.length,
        model: 'qwen2.5:14b-instruct-q4_K_M',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      metricsTracker.trackRequest('qwen2.5:14b-instruct-q4_K_M', false, duration, 'summarization-error');
      throw error;
    }
  }
}

/**
 * Translation Processor
 * Translates text between languages
 */
export class TranslationProcessor {
  async process(input: AIProcessorInput, config: AIProcessorConfig): Promise<any> {
    const startTime = Date.now();
    
    try {
      const { text, targetLanguage, sourceLanguage } = input;
      if (!text || !targetLanguage) {
        throw new Error('Text and target language are required');
      }

      const translation = await aiAdapter.translate(
        text,
        targetLanguage,
        sourceLanguage
      );

      const duration = Date.now() - startTime;
      metricsTracker.trackRequest('qwen2.5:14b-instruct-q4_K_M', true, duration);

      return {
        translation,
        sourceLanguage: sourceLanguage || 'auto',
        targetLanguage,
        originalText: text,
        model: 'qwen2.5:14b-instruct-q4_K_M',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      metricsTracker.trackRequest('qwen2.5:14b-instruct-q4_K_M', false, duration, 'translation-error');
      throw error;
    }
  }
}

/**
 * Sentiment Analysis Processor
 * Analyzes sentiment of text
 */
export class SentimentAnalysisProcessor {
  async process(input: AIProcessorInput, config: AIProcessorConfig): Promise<any> {
    const startTime = Date.now();
    
    try {
      const { text } = input;
      if (!text) {
        throw new Error('Text input is required');
      }

      const sentiment = await aiAdapter.sentimentAnalysis(text);

      const duration = Date.now() - startTime;
      metricsTracker.trackRequest('qwen2.5:14b-instruct-q4_K_M', true, duration);

      return {
        ...sentiment,
        text,
        model: 'qwen2.5:14b-instruct-q4_K_M',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      metricsTracker.trackRequest('qwen2.5:14b-instruct-q4_K_M', false, duration, 'sentiment-analysis-error');
      throw error;
    }
  }
}

/**
 * Semantic Search Processor
 * Performs semantic search over documents
 */
export class SemanticSearchProcessor {
  async process(input: AIProcessorInput, config: AIProcessorConfig): Promise<any> {
    const startTime = Date.now();
    
    try {
      const { query, documents, topK = 5 } = input;
      if (!query || !documents || !Array.isArray(documents)) {
        throw new Error('Query and documents array are required');
      }

      const results = await aiAdapter.semanticSearch(query, documents, topK);

      const duration = Date.now() - startTime;
      metricsTracker.trackRequest('qwen2.5:14b-instruct-q4_K_M', true, duration);

      return {
        results,
        query,
        totalDocuments: documents.length,
        topK,
        model: 'qwen2.5:14b-instruct-q4_K_M',
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      metricsTracker.trackRequest('qwen2.5:14b-instruct-q4_K_M', false, duration, 'semantic-search-error');
      throw error;
    }
  }
}

// Export all processors
export const aiProcessors = {
  'text-analysis': new TextAnalysisProcessor(),
  'code-generation': new CodeGeneratorProcessor(),
  'image-understanding': new ImageUnderstandingProcessor(),
  'chat': new ChatProcessor(),
  'document-analysis': new DocumentAnalysisProcessor(),
  'summarization': new SummarizationProcessor(),
  'translation': new TranslationProcessor(),
  'sentiment-analysis': new SentimentAnalysisProcessor(),
  'semantic-search': new SemanticSearchProcessor(),
};
