// LLM Adapter Layer for CtrlChecks AI
// Unified interface for LLM providers (OpenAI, Claude, Gemini). Ollama removed; use Gemini.

import { recordLlmUsage } from '../core/ai/build-usage-context';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  stream?: boolean;
  provider?: 'openai' | 'claude' | 'gemini' | 'ollama';
  /** When build-time tracking is active (`runWithBuildUsageTracking`), labels this call in snapshots. */
  usageStage?: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  finishReason?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface EmbeddingOptions {
  usageStage?: string;
}

export type LLMProvider = 'openai' | 'claude' | 'gemini' | 'ollama';

/**
 * Unified LLM Adapter (Gemini default; ollama routes to Gemini)
 */
export class LLMAdapter {
  constructor() {}
  /**
   * Chat completion. 'ollama' is treated as Gemini (GEMINI_API_KEY).
   */
  async chat(
    provider: LLMProvider,
    messages: LLMMessage[],
    options: LLMOptions
  ): Promise<LLMResponse> {
    const effectiveProvider = provider === 'ollama' ? 'gemini' : provider;
    const apiKey = options.apiKey || (effectiveProvider === 'gemini' ? process.env.GEMINI_API_KEY : undefined);
    let result: LLMResponse;
    switch (effectiveProvider) {
      case 'openai':
        result = await this.chatOpenAI(messages, options);
        break;
      case 'claude':
        result = await this.chatClaude(messages, options);
        break;
      case 'gemini':
        result = await this.chatGemini(messages, { ...options, apiKey: apiKey || options.apiKey });
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
    if (result.usage) {
      recordLlmUsage({
        provider: String(effectiveProvider),
        model: result.model || options.model || '',
        usage: result.usage,
        stage: options.usageStage,
        source: 'LLMAdapter.chat',
      });
    }
    return result;
  }

  async embed(
    provider: 'openai' | 'gemini' | 'ollama',
    text: string,
    apiKey?: string,
    embedOptions?: EmbeddingOptions
  ): Promise<EmbeddingResponse> {
    if (provider === 'ollama') {
      throw new Error('Ollama removed. Use Gemini for embeddings (or OpenAI).');
    }
    let result: EmbeddingResponse;
    switch (provider) {
      case 'openai':
        result = await this.embedOpenAI(text, apiKey);
        break;
      case 'gemini':
        result = await this.embedGemini(text, apiKey);
        break;
      default:
        throw new Error(`Embedding not supported for provider: ${provider}`);
    }
    if (result.usage) {
      recordLlmUsage({
        provider,
        model: result.model || 'embedding',
        usage: result.usage,
        stage: embedOptions?.usageStage || 'embedding',
        source: 'LLMAdapter.embed',
      });
    }
    return result;
  }

  /**
   * OpenAI Chat Completion
   */
  private async chatOpenAI(
    messages: LLMMessage[],
    options: LLMOptions
  ): Promise<LLMResponse> {
    // ⚠️ IMPORTANT: For OpenAI nodes we REQUIRE an explicit node-level API key.
    // Environment-level keys are intentionally ignored to keep ownership explicit.
    const apiKey = options.apiKey;
    if (!apiKey) {
      throw new Error('OpenAI API key required. Please provide your API key in this node’s configuration (API Key field).');
    }

    // Map model names to OpenAI format
    const modelMap: Record<string, string> = {
      'gpt-4o': 'gpt-4o',
      'gpt-4o-mini': 'gpt-4o-mini',
      'gpt-4-turbo': 'gpt-4-turbo',
      'gpt-4': 'gpt-4',
      'gpt-3.5-turbo': 'gpt-3.5-turbo',
    };

    const model = modelMap[options.model] || options.model || 'gpt-4o';

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens,
          stream: options.stream || false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `OpenAI API error: ${response.status}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.error?.message || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }
        
        throw new Error(errorMessage);
      }

      let data: any;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(`OpenAI API: Invalid JSON response. ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
      
      if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error(`OpenAI API: Invalid response format. Expected choices array.`);
      }
      
      return {
        content: data.choices[0]?.message?.content || '',
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
        } : undefined,
        model: data.model,
        finishReason: data.choices[0]?.finish_reason,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`OpenAI API request failed: ${String(error)}`);
    }
  }

  /**
   * Anthropic Claude Chat Completion
   */
  private async chatClaude(
    messages: LLMMessage[],
    options: LLMOptions
  ): Promise<LLMResponse> {
    // ⚠️ IMPORTANT: For Claude nodes we REQUIRE an explicit node-level API key.
    const apiKey = options.apiKey;
    if (!apiKey) {
      throw new Error('Anthropic API key required. Please provide your API key in this node’s configuration (API Key field).');
    }

    // Map model names to Claude format
    const modelMap: Record<string, string> = {
      'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku': 'claude-3-5-haiku-20241022',
      'claude-3-opus': 'claude-3-opus-20240229',
      'claude-3-sonnet': 'claude-3-sonnet-20240229',
      'claude-3-haiku': 'claude-3-haiku-20240307',
    };

    const model = modelMap[options.model] || options.model || 'claude-3-5-sonnet-20241022';

    // Convert messages to Claude format
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages
      .filter(m => m.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      }));

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens || 4096,
          temperature: options.temperature ?? 0.7,
          system: systemMessage?.content,
          messages: conversationMessages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Claude API error: ${response.status}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.error?.message || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }
        
        throw new Error(errorMessage);
      }

      let data: any;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(`Claude API: Invalid JSON response. ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
      
      if (!data || !data.content || !Array.isArray(data.content)) {
        throw new Error(`Claude API: Invalid response format. Expected content array.`);
      }
      
      const content = data.content
        .map((block: any) => block?.text || '')
        .filter((text: string) => text)
        .join('');

      return {
        content,
        usage: data.usage ? {
          promptTokens: data.usage.input_tokens || 0,
          completionTokens: data.usage.output_tokens || 0,
          totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
        } : undefined,
        model: data.model,
        finishReason: data.stop_reason,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Claude API request failed: ${String(error)}`);
    }
  }

  /**
   * Google Gemini Chat Completion
   */
  private async chatGemini(
    messages: LLMMessage[],
    options: LLMOptions
  ): Promise<LLMResponse> {
    // ⚠️ IMPORTANT: For Gemini nodes we REQUIRE an explicit node-level API key.
    const apiKey = options.apiKey;
    if (!apiKey) {
      throw new Error('Gemini API key required. Please provide your API key in this node’s configuration (API Key field).');
    }

    // Map model names to Gemini format
    const modelMap: Record<string, string> = {
      // Legacy aliases → modern defaults
      'gemini-1.5-flash': 'gemini-2.5-flash',
      'gemini-2.0-flash-lite': 'gemini-3-flash-preview',
      // Supported models
      'gemini-1.5-pro': 'gemini-2.5-pro',
      'gemini-2.5-flash': 'gemini-2.5-flash',
      'gemini-2.5-pro': 'gemini-2.5-pro',
      'gemini-2.5-flash-lite': 'gemini-3-flash-preview',
      'gemini-pro': 'gemini-2.5-pro',
      'gemini-3-flash': 'gemini-2.5-flash',
      'gemini-3.1-pro': 'gemini-2.5-pro',
      'gemini-3.1-flash-lite': 'gemini-3-flash-preview',
    };

    // Default to gemini-2.5-flash for broad compatibility.
    const model = modelMap[options.model] || options.model || 'gemini-2.5-flash';

    // Convert messages to Gemini format
    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    const conversationParts = messages
      .filter(m => m.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: conversationParts,
          systemInstruction: systemInstruction ? {
            parts: [{ text: systemInstruction }],
          } : undefined,
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Gemini API error: ${response.status}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage += ` - ${errorJson.error?.message || errorText}`;
        } catch {
          errorMessage += ` - ${errorText}`;
        }
        
        throw new Error(errorMessage);
      }

      let data: any;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(`Gemini API: Invalid JSON response. ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
      
      if (!data || !data.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
        throw new Error(`Gemini API: Invalid response format. Expected candidates array.`);
      }
      
      const content = data.candidates[0]?.content?.parts?.[0]?.text || '';
      const usageInfo = data.usageMetadata;

      return {
        content,
        usage: usageInfo ? {
          promptTokens: usageInfo.promptTokenCount || 0,
          completionTokens: usageInfo.candidatesTokenCount || 0,
          totalTokens: usageInfo.totalTokenCount || 0,
        } : undefined,
        model: data.model || model,
        finishReason: data.candidates?.[0]?.finishReason,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Gemini API request failed: ${String(error)}`);
    }
  }

  /**
   * OpenAI Embeddings
   */
  private async embedOpenAI(
    text: string,
    apiKey?: string
  ): Promise<EmbeddingResponse> {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OpenAI API key required for embeddings');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Embeddings API error: ${response.status} - ${errorText}`);
      }

      let data: any;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(`OpenAI Embeddings API: Invalid JSON response. ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
      
      if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error(`OpenAI Embeddings API: Invalid response format. Expected data array with embeddings.`);
      }
      
      if (!data.data[0] || !data.data[0].embedding || !Array.isArray(data.data[0].embedding)) {
        throw new Error(`OpenAI Embeddings API: Invalid embedding format.`);
      }
      
      return {
        embedding: data.data[0].embedding,
        model: data.model,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens || 0,
              completionTokens: 0,
              totalTokens: data.usage.total_tokens ?? data.usage.prompt_tokens ?? 0,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`OpenAI Embeddings request failed: ${String(error)}`);
    }
  }

  /**
   * Gemini Embeddings (if supported)
   */
  private async embedGemini(
    text: string,
    apiKey?: string
  ): Promise<EmbeddingResponse> {
    throw new Error('Gemini embeddings not yet implemented. Use OpenAI or Ollama for embeddings.');
  }

  static detectProvider(model: string): LLMProvider {
    if (model.startsWith('gpt-') || model.includes('openai')) return 'openai';
    if (model.startsWith('claude-') || model.includes('anthropic')) return 'claude';
    if (model.startsWith('gemini-') || model.includes('gemini')) return 'gemini';
    return 'gemini';
  }

  static getAvailableModels(provider: LLMProvider): string[] {
    const geminiModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview'];
    switch (provider) {
      case 'openai':
        return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'];
      case 'claude':
        return ['claude-3-5-sonnet', 'claude-3-5-haiku', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
      case 'gemini':
      case 'ollama':
        return geminiModels;
      default:
        return geminiModels;
    }
  }
}
