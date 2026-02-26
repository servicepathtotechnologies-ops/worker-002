// HuggingFace Router Client - OpenAI-Compatible API
// Migrated from Deno to Node.js

export type Modality = 'text' | 'code' | 'image' | 'audio' | 'embedding';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  [key: string]: unknown;
}

export interface ImageGenerationOptions {
  size?: '256x256' | '512x512' | '1024x1024';
  n?: number;
  [key: string]: unknown;
}

export interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
  };
}

export class HuggingFaceRouterClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultTimeout: number;
  private maxRetries: number;

  constructor(
    apiKey: string | undefined,
    baseUrl: string = "https://router.huggingface.co",
    defaultTimeout: number = 60000,
    maxRetries: number = 3
  ) {
    if (!apiKey) {
      throw new Error("HuggingFace API key is required");
    }
    if (!apiKey.startsWith("hf_")) {
      throw new Error("Invalid HuggingFace API key format. Must start with 'hf_'");
    }
    
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultTimeout = defaultTimeout;
    this.maxRetries = maxRetries;
  }

  private detectModality(modelName: string): Modality {
    const lower = modelName.toLowerCase();
    
    if (lower.includes('stable-diffusion') || 
        lower.includes('sd-') || 
        lower.includes('image') ||
        lower.includes('pixart') ||
        lower.includes('flux')) {
      return 'image';
    }
    
    if (lower.includes('whisper') || 
        lower.includes('bark') ||
        lower.includes('tts') ||
        lower.includes('audio')) {
      return 'audio';
    }
    
    if (lower.includes('embedding') || 
        lower.includes('sentence-transformers')) {
      return 'embedding';
    }
    
    if (lower.includes('code') || 
        lower.includes('codellama') ||
        lower.includes('deepseek-coder') ||
        lower.includes('starcoder')) {
      return 'code';
    }
    
    return 'text';
  }

  async generateText(
    modelName: string,
    prompt: string | ChatMessage[],
    options: ChatCompletionOptions = {}
  ): Promise<string> {
    const modality: Modality = this.detectModality(modelName);
    
    let messages: ChatMessage[];
    if (typeof prompt === 'string') {
      messages = [{ role: 'user', content: prompt }];
    } else {
      messages = prompt;
    }

    const url = `${this.baseUrl}/v1/chat/completions`;
    const payload = {
      model: modelName,
      messages: messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 300,
      top_p: options.top_p ?? 0.9,
      ...options,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const waitTime = Math.min(3000 * attempt, 10000);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text().catch(() => response.statusText);
            let errorData: any = {};
            try {
              errorData = JSON.parse(errorText);
            } catch {
              // Not JSON
            }
            
            if (response.status === 404 || response.status === 400) {
              const errorMsg = errorData?.error?.message || errorText;
              throw new Error(`Model '${modelName}' not found: ${errorMsg}`);
            }
            if (response.status === 401) {
              throw new Error("Invalid HuggingFace API key.");
            }
            if (response.status === 429) {
              if (attempt < this.maxRetries) {
                const waitTime = Math.min(5000 * (attempt + 1), 30000);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
              }
              throw new Error("Rate limit exceeded.");
            }
            if (response.status === 503) {
              const estimatedTime = errorData?.estimated_time || 10;
              if (attempt < this.maxRetries) {
                const waitTime = Math.min(estimatedTime * 1000, 15000);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
              }
              throw new Error(`Model is loading. Please try again in ${estimatedTime} seconds.`);
            }
            
            throw new Error(`HuggingFace API error (${response.status}): ${errorText.substring(0, 200)}`);
          }

          const data = await response.json() as OpenAICompatibleResponse;

          if (data.error) {
            throw new Error(data.error.message || "Unknown error from HuggingFace API");
          }

          if (data.choices && data.choices.length > 0) {
            const content = data.choices[0].message?.content || data.choices[0].text;
            if (content) {
              return content.trim();
            }
          }

          throw new Error("Invalid response format: missing choices[0].message.content");

        } catch (fetchError) {
          clearTimeout(timeoutId);
          
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error("Request timeout.");
          }
          throw fetchError;
        }

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const shouldRetry = attempt < this.maxRetries && 
          (lastError.message.includes('503') || 
           lastError.message.includes('429') ||
           lastError.message.includes('timeout'));
        
        if (!shouldRetry) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error("Failed to call HuggingFace API after retries");
  }

  static fromEnvironment(baseUrl?: string): HuggingFaceRouterClient {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
      throw new Error("HUGGINGFACE_API_KEY environment variable is not set");
    }
    return new HuggingFaceRouterClient(apiKey, baseUrl);
  }
}

// Backward compatibility alias
export const HuggingFaceClient = HuggingFaceRouterClient;
