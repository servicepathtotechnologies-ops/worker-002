// AI Adapter - Unified Interface for All AI Operations
// Replaces all external AI APIs with Ollama

import { OllamaManager, OllamaChatMessage, ollamaManager } from './ollama-manager';

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

/**
 * AI Adapter - Unified AI Interface
 * All AI operations route through Ollama
 */
export class AIAdapter {
  private ollama: OllamaManager;

  constructor(ollamaManager: OllamaManager) {
    this.ollama = ollamaManager;
  }

  /**
   * Text Generation (replaces OpenAI, Anthropic, Google AI)
   */
  async textGeneration(
    prompt: string,
    options: TextGenerationOptions = {}
  ): Promise<string> {
    const result = await this.ollama.generate(prompt, {
      model: options.model || 'qwen2.5:14b-instruct-q4_K_M',
      system: options.system,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens,
      stream: false,
    });

    return result.content;
  }

  /**
   * Code Generation (replaces GitHub Copilot, Codex)
   */
  async codeGeneration(
    prompt: string,
    options: CodeGenerationOptions = {}
  ): Promise<string> {
    const systemPrompt = options.language
      ? `You are an expert ${options.language}${options.framework ? ` and ${options.framework}` : ''} developer. Generate clean, efficient, and well-commented code.`
      : 'You are an expert programmer. Generate clean, efficient, and well-commented code.';

    const fullPrompt = options.language
      ? `Write ${options.language}${options.framework ? ` using ${options.framework}` : ''} code for: ${prompt}`
      : prompt;

    const result = await this.ollama.generate(fullPrompt, {
      model: 'qwen2.5-coder:7b',
      system: systemPrompt,
      temperature: options.temperature ?? 0.3,
      stream: false,
    });

    return result.content;
  }

  /**
   * Image Analysis (replaces GPT-4 Vision, Claude Vision)
   */
  async imageAnalysis(
    imageBase64: string,
    question: string = 'Describe this image in detail',
    options: ImageAnalysisOptions = {}
  ): Promise<string> {
    throw new Error('Image analysis functionality has been removed. Multimodal features are no longer supported.');
    // Removed multimodal support
    const result = null as any;

    return result.content;
  }

  /**
   * Chat/Conversation (replaces OpenAI Chat, Anthropic Messages)
   */
  async chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: { model?: string; temperature?: number } = {}
  ): Promise<string> {
    const ollamaMessages: OllamaChatMessage[] = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    const result = await this.ollama.chat(ollamaMessages, {
      model: options.model || 'qwen2.5:14b-instruct-q4_K_M',
      temperature: options.temperature ?? 0.7,
      stream: false,
    });

    return result.content;
  }

  /**
   * Summarization (replaces OpenAI Summarize, Anthropic Summarize)
   */
  async summarize(
    text: string,
    options: { maxLength?: number; focus?: string } = {}
  ): Promise<string> {
    const prompt = options.focus
      ? `Summarize the following text focusing on ${options.focus}:\n\n${text}`
      : `Summarize the following text${options.maxLength ? ` in ${options.maxLength} words` : ''}:\n\n${text}`;

    const result = await this.ollama.generate(prompt, {
      model: 'qwen2.5:14b-instruct-q4_K_M',
      system: 'You are an expert at creating concise, accurate summaries.',
      temperature: 0.5,
      max_tokens: options.maxLength ? options.maxLength * 2 : 500,
      stream: false,
    });

    return result.content;
  }

  /**
   * Translation (replaces Google Translate API)
   */
  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<string> {
    const prompt = sourceLanguage
      ? `Translate the following ${sourceLanguage} text to ${targetLanguage}:\n\n${text}`
      : `Translate the following text to ${targetLanguage}:\n\n${text}`;

    const result = await this.ollama.generate(prompt, {
      model: 'qwen2.5:14b-instruct-q4_K_M', // Good multilingual support
      system: 'You are an expert translator. Provide accurate translations.',
      temperature: 0.3,
      stream: false,
    });

    return result.content;
  }

  /**
   * Sentiment Analysis (replaces various sentiment APIs)
   */
  async sentimentAnalysis(text: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    explanation: string;
  }> {
    const prompt = `Analyze the sentiment of the following text. Respond with JSON: {"sentiment": "positive|negative|neutral", "score": 0.0-1.0, "explanation": "brief explanation"}\n\nText: ${text}`;

    const result = await this.ollama.generate(prompt, {
      model: 'qwen2.5:14b-instruct-q4_K_M',
      system: 'You are a sentiment analysis expert. Always respond with valid JSON.',
      temperature: 0.3,
      stream: false,
    });

    try {
      // Extract JSON from response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse sentiment analysis:', error);
    }

    // Fallback
    return {
      sentiment: 'neutral',
      score: 0.5,
      explanation: result.content,
    };
  }

  /**
   * Semantic Search / Embeddings (replaces OpenAI Embeddings)
   */
  async semanticSearch(
    query: string,
    documents: string[],
    topK: number = 5
  ): Promise<Array<{ document: string; score: number; index: number }>> {
    try {
      // Generate embeddings
      const queryEmbedding = await this.ollama.embeddings(query);
      const documentEmbeddings = await Promise.all(
        documents.map(doc => this.ollama.embeddings(doc))
      );

      // Calculate cosine similarity
      const similarities = documentEmbeddings.map((docEmbedding, index) => {
        const score = this.cosineSimilarity(queryEmbedding, docEmbedding);
        return {
          document: documents[index],
          score,
          index,
        };
      });

      // Sort by score and return top K
      return similarities
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } catch (error) {
      console.error('Semantic search error:', error);
      // Fallback to simple text matching
      return documents
        .map((doc, index) => ({
          document: doc,
          score: this.textSimilarity(query, doc),
          index,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    }
  }

  /**
   * Extract Information (replaces various extraction APIs)
   */
  async extractInformation(
    text: string,
    schema: { fields: Array<{ name: string; type: string; description: string }> }
  ): Promise<Record<string, any>> {
    const fieldsDescription = schema.fields
      .map(f => `- ${f.name} (${f.type}): ${f.description}`)
      .join('\n');

    const prompt = `Extract the following information from the text below. Respond with JSON object containing only the extracted fields:\n\nFields to extract:\n${fieldsDescription}\n\nText:\n${text}`;

    const result = await this.ollama.generate(prompt, {
      model: 'qwen2.5:14b-instruct-q4_K_M',
      system: 'You are an expert at extracting structured information. Always respond with valid JSON only.',
      temperature: 0.3,
      stream: false,
    });

    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse extraction:', error);
    }

    return {};
  }

  /**
   * Question Answering (replaces various QA APIs)
   */
  async questionAnswering(
    question: string,
    context: string
  ): Promise<string> {
    const prompt = `Answer the following question based on the provided context. If the answer cannot be found in the context, say "I don't know."\n\nContext:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;

    const result = await this.ollama.generate(prompt, {
      model: 'qwen2.5:14b-instruct-q4_K_M',
      system: 'You are a helpful assistant that answers questions based on provided context.',
      temperature: 0.3,
      stream: false,
    });

    return result.content;
  }

  /**
   * Helper: Cosine similarity for embeddings
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Helper: Text similarity fallback
   */
  private textSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
}

// Export singleton instance
export const aiAdapter = new AIAdapter(ollamaManager);
