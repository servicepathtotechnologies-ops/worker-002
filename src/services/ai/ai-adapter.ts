// AI Adapter - Unified interface for AI operations (Gemini via GEMINI_API_KEY)

import { geminiOrchestrator } from './gemini-orchestrator';
import { LLMAdapter } from '../../shared/llm-adapter';
import { config } from '../../core/config';

export interface TextGenerationOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  system?: string;
}

export interface CodeGenerationOptions {
  language?: string;
  framework?: string;
  temperature?: number;
}

export interface ImageAnalysisOptions {
  model?: string;
  temperature?: number;
}

const llmAdapter = new LLMAdapter();

export class AIAdapter {
  async textGeneration(prompt: string, options: TextGenerationOptions = {}): Promise<string> {
    const input = options.system ? { system: options.system, message: prompt } : prompt;
    const result = await geminiOrchestrator.processRequest('chat-generation', input, {
      model: options.model || 'gemini-2.5-flash',
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens,
      cache: false,
    });
    return typeof result === 'string' ? result : (result?.content ?? String(result));
  }

  async codeGeneration(prompt: string, options: CodeGenerationOptions = {}): Promise<string> {
    const systemPrompt = options.language
      ? `You are an expert ${options.language}${options.framework ? ` and ${options.framework}` : ''} developer. Generate clean, efficient, and well-commented code.`
      : 'You are an expert programmer. Generate clean, efficient, and well-commented code.';
    const fullPrompt = options.language ? `Write ${options.language} code for: ${prompt}` : prompt;
    const result = await geminiOrchestrator.processRequest('code-generation', { system: systemPrompt, message: fullPrompt }, {
      model: 'gemini-2.5-flash',
      temperature: options.temperature ?? 0.3,
      cache: false,
    });
    return typeof result === 'string' ? result : (result?.content ?? String(result));
  }

  async imageAnalysis(_imageBase64: string, _question: string, _options?: ImageAnalysisOptions): Promise<string> {
    throw new Error('Image analysis has been removed.');
  }

  async chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: { model?: string; temperature?: number } = {}
  ): Promise<string> {
    const apiKey = config.geminiApiKey;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
    const response = await llmAdapter.chat('gemini', messages, {
      model: options.model || 'gemini-2.5-flash',
      apiKey,
      temperature: options.temperature ?? 0.7,
    });
    return response.content;
  }

  async summarize(text: string, options: { maxLength?: number; focus?: string } = {}): Promise<string> {
    const prompt = options.focus
      ? `Summarize the following text focusing on ${options.focus}:\n\n${text}`
      : `Summarize the following text${options.maxLength ? ` in ${options.maxLength} words` : ''}:\n\n${text}`;
    const result = await geminiOrchestrator.processRequest('summarization', prompt, { cache: false });
    return typeof result === 'string' ? result : (result?.content ?? String(result));
  }

  async translate(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string> {
    const prompt = sourceLanguage
      ? `Translate the following ${sourceLanguage} text to ${targetLanguage}:\n\n${text}`
      : `Translate the following text to ${targetLanguage}:\n\n${text}`;
    const result = await geminiOrchestrator.processRequest('translation', prompt, { cache: false });
    return typeof result === 'string' ? result : (result?.content ?? String(result));
  }

  async sentimentAnalysis(text: string): Promise<{ sentiment: 'positive' | 'negative' | 'neutral'; score: number; explanation: string }> {
    const prompt = `Analyze the sentiment of the following text. Respond with JSON: {"sentiment": "positive|negative|neutral", "score": 0.0-1.0, "explanation": "brief explanation"}\n\nText: ${text}`;
    const result = await geminiOrchestrator.processRequest('text-analysis', prompt, { cache: false });
    const content = typeof result === 'string' ? result : (result?.content ?? String(result));
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (_) {}
    return { sentiment: 'neutral', score: 0.5, explanation: content };
  }

  async semanticSearch(
    query: string,
    documents: string[],
    topK: number = 5
  ): Promise<Array<{ document: string; score: number; index: number }>> {
    return documents
      .map((doc, index) => ({ document: doc, score: this.textSimilarity(query, doc), index }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  async extractInformation(
    text: string,
    schema: { fields: Array<{ name: string; type: string; description: string }> }
  ): Promise<Record<string, any>> {
    const fieldsDescription = schema.fields.map(f => `- ${f.name} (${f.type}): ${f.description}`).join('\n');
    const prompt = `Extract the following information from the text below. Respond with JSON only:\n\nFields:\n${fieldsDescription}\n\nText:\n${text}`;
    const result = await geminiOrchestrator.processRequest('entity-extraction', prompt, { cache: false });
    const content = typeof result === 'string' ? result : (result?.content ?? String(result));
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (_) {}
    return {};
  }

  async questionAnswering(question: string, context: string): Promise<string> {
    const prompt = `Answer based on the context. If unknown, say "I don't know."\n\nContext:\n${context}\n\nQuestion: ${question}`;
    const result = await geminiOrchestrator.processRequest('chat-generation', prompt, { cache: false });
    return typeof result === 'string' ? result : (result?.content ?? String(result));
  }

  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    return union.size ? intersection.size / union.size : 0;
  }
}

export const aiAdapter = new AIAdapter();
