// Ollama Manager - Central AI Service
// Routes ALL AI requests through Ollama models
// Supports local and AWS Ollama instances

import { Ollama } from 'ollama';
import { config } from '../../core/config';

export interface OllamaModel {
  name: string;
  size: string;
  capabilities: string[];
  loaded: boolean;
}

export interface OllamaGenerationOptions {
  model?: string;
  system?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  images?: string[];
  __fallbackAttempt?: number; // Internal: track fallback attempts
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

/**
 * Model Capabilities Mapping
 * Optimized for AWS g4dn.xlarge deployment (16GB GPU)
 * Using only 2 best models for production
 */
const MODEL_CAPABILITIES = {
  // PRIMARY MODELS (Qwen2.5 14B primary, 7B fallback)
  'qwen2.5:14b-instruct-q4_K_M': {
    size: '~8GB',
    capabilities: ['text-generation', 'reasoning', 'chat', 'multilingual', 'general-purpose', 'workflow-generation'],
    priority: 1, // Primary - best general purpose and reasoning
    useCase: 'General purpose, chat, reasoning, multilingual tasks, workflow generation'
  },
  'qwen2.5:7b-instruct-q4_K_M': {
    size: '~4GB',
    capabilities: ['text-generation', 'reasoning', 'chat', 'multilingual', 'general-purpose', 'workflow-generation'],
    priority: 2, // Fallback - lighter model
    useCase: 'Fallback for general tasks when VRAM is constrained'
  },
  'qwen2.5-coder:7b-instruct-q4_K_M': {
    size: '~4GB',
    capabilities: ['code-generation', 'code-analysis', 'debugging', 'documentation', 'programming'],
    priority: 1, // Primary - best for code
    useCase: 'Code generation, analysis, debugging, programming tasks'
  }
};

/**
 * Ollama Manager - Central AI Service
 * Manages all Ollama model interactions
 */
export class OllamaManager {
  private ollama: Ollama;
  private endpoint: string;
  private useHttpDirect: boolean; // Flag to use direct HTTP fetch instead of Ollama library
  private loadedModels: Set<string> = new Set();
  private modelCache: Map<string, any> = new Map();
  private requestQueue: Array<() => Promise<any>> = [];
  private processing = false;
  private unavailableModels: Set<string> = new Set(); // Cache for models known to be unavailable

  constructor(endpoint?: string) {
    this.endpoint = endpoint || config.ollamaHost || 'http://localhost:11434';
    
    // Auto-upgrade to HTTPS if using ollama.ctrlchecks.ai with HTTP
    // The service is accessible via HTTPS and may require it for POST requests
    if (this.endpoint === 'http://ollama.ctrlchecks.ai') {
      this.endpoint = 'https://ollama.ctrlchecks.ai';
      console.log(`🔒 Auto-upgraded to HTTPS: ${this.endpoint}`);
    }
    
    // IMPORTANT: Use the remote Ollama endpoint if configured
    // For FastAPI service: https://ollama.ctrlchecks.ai (reverse proxy handles all requests)
    // 
    // Available endpoints at https://ollama.ctrlchecks.ai:
    //   GET  /api/tags - List models
    //   POST /api/generate - Text generation
    //   POST /api/chat - Chat completion
    //   POST /api/create - Create model
    //   POST /api/video/generate - Video generation with LTX-2
    //   GET  /health - Health check
    console.log(`🔗 Initializing Ollama client for endpoint: ${this.endpoint}`);
    
    // Check if endpoint is HTTP (not HTTPS)
    // For HTTP endpoints, we'll use direct fetch calls to avoid SSL errors
    // For HTTPS endpoints, we can also use direct fetch (Node.js handles SSL)
    this.useHttpDirect = this.endpoint.startsWith('http://') || this.endpoint.startsWith('https://');
    
    // Parse the endpoint URL for host configuration
    let hostConfig: string;
    
    try {
      const url = new URL(this.endpoint);
      
      if (url.protocol === 'https:') {
        // For HTTPS, use full URL with Ollama library
        hostConfig = this.endpoint;
      } else {
        // For HTTP, extract hostname:port for library initialization
        // But we'll use direct fetch for actual requests
        const port = url.port || '11434';
        hostConfig = port === '80' || port === '' ? url.hostname : `${url.hostname}:${port}`;
      }
    } catch (error) {
      // If URL parsing fails, try to extract hostname:port manually
      if (this.endpoint.startsWith('http://')) {
        hostConfig = this.endpoint.replace('http://', '').split('/')[0];
      } else if (this.endpoint.startsWith('https://')) {
        hostConfig = this.endpoint;
      } else {
        hostConfig = this.endpoint;
      }
    }
    
    // Initialize Ollama client
    // For HTTP/HTTPS endpoints, we'll use direct fetch for better control
    this.ollama = new Ollama({ 
      host: hostConfig
    });
    
    console.log(`✅ Ollama client initialized with host: ${hostConfig} (Direct fetch: ${this.useHttpDirect})`);
  }

  /**
   * Wrapper for fetch with extended timeout
   */
  private async fetchWithTimeout(url: string, options: any = {}, timeoutMs: number = 600000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  /**
   * Initialize - Check connection and load primary models
   */
  async initialize(): Promise<void> {
    try {
      // Check Ollama connection
      let models: any;
      
      if (this.useHttpDirect) {
        // Use direct HTTP fetch for HTTP endpoints with extended timeout for initial connection
        const response = await this.fetchWithTimeout(`${this.endpoint}/api/tags`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }, 30000); // 30 second timeout for initial connection
        
        if (!response.ok) {
          throw new Error(`Failed to list models: ${response.statusText}`);
        }
        
        models = await response.json();
      } else {
        models = await this.ollama.list();
      }
      
      this.loadedModels = new Set(models.models.map((m: any) => m.name));
      
      console.log(`✅ Ollama connected at ${this.endpoint}`);
      console.log(`📦 Loaded models: ${Array.from(this.loadedModels).join(', ')}`);
      
      // Ensure primary models are loaded (14B primary, 7B fallback, coder)
      await this.ensureModelsLoaded(['qwen2.5:14b-instruct-q4_K_M', 'qwen2.5:7b-instruct-q4_K_M', 'qwen2.5-coder:7b-instruct-q4_K_M']);
    } catch (error) {
      console.error('❌ Failed to connect to Ollama:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout') || errorMessage.includes('UND_ERR');
      
      if (isTimeout) {
        throw new Error(
          `Ollama connection timeout at ${this.endpoint}. ` +
          `Please verify:\n` +
          `  1. The endpoint is accessible: ${this.endpoint}\n` +
          `  2. The server is running and reachable\n` +
          `  3. Network connectivity is available\n` +
          `  4. Firewall rules allow connections to this endpoint`
        );
      }
      
      throw new Error(`Ollama connection failed at ${this.endpoint}: ${errorMessage}`);
    }
  }

  /**
   * Ensure models are loaded (pull if needed)
   */
  async ensureModelsLoaded(modelNames: string[]): Promise<void> {
    for (const modelName of modelNames) {
      // Skip if model is known to be unavailable
      if (this.unavailableModels.has(modelName)) {
        console.warn(`⚠️  Skipping ${modelName} - marked as unavailable`);
        continue;
      }
      
      // Check if model is already loaded (handle tags: "model" matches "model:latest")
      const isLoaded = Array.from(this.loadedModels).some(loadedName => {
        // Exact match
        if (loadedName === modelName) return true;
        // Match with tag (e.g., "model:latest" matches "model")
        if (loadedName.startsWith(modelName + ':')) return true;
        // Match without tag (e.g., "model" matches "model:latest")
        const loadedBaseName = loadedName.split(':')[0];
        return loadedBaseName === modelName;
      });
      
      if (isLoaded) {
        // Model is already loaded, skip pulling
        continue;
      }
      
      console.log(`📥 Pulling model: ${modelName}...`);
      try {
        await this.pullModel(modelName);
        this.loadedModels.add(modelName);
        console.log(`✅ Model loaded: ${modelName}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Mark as unavailable if it's a 404 or "not found" error
        if (errorMessage.includes('not found') || errorMessage.includes('404') || errorMessage.includes('Not Found')) {
          this.unavailableModels.add(modelName);
          console.warn(`⚠️  Model ${modelName} not found on server - marking as unavailable`);
        } else {
          console.warn(`⚠️  Failed to load model ${modelName}:`, error);
        }
      }
    }
  }

  /**
   * Pull a model from Ollama
   */
  private async pullModel(modelName: string): Promise<void> {
    // CRITICAL: Skip if model is known to be unavailable
    if (this.unavailableModels.has(modelName)) {
      throw new Error(`Model ${modelName} is not available on the server`);
    }
    
    if (this.useHttpDirect) {
      // Use direct HTTP fetch for HTTP endpoints with extended timeout for model pulling
      const response = await this.fetchWithTimeout(`${this.endpoint}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: false }),
      }, 600000); // 10 minutes timeout for model pulling
      
      if (!response.ok) {
        // Mark model as unavailable if 404 or similar error
        if (response.status === 404 || response.status === 500) {
          this.unavailableModels.add(modelName);
          console.warn(`⚠️  Marking model ${modelName} as unavailable (status: ${response.status})`);
        }
        throw new Error(`Failed to pull model: ${response.statusText}`);
      }
      
      // For streaming, we'd need to handle the stream differently
      // For now, just wait for the pull to complete
      await response.json();
      return;
    }
    
    try {
      const stream = await this.ollama.pull({ model: modelName, stream: true });
      
      for await (const chunk of stream) {
        if (chunk.digest) {
          process.stdout.write(`\r📥 Downloading ${modelName}: ${chunk.completed || 0}/${chunk.total || 0}`);
        }
      }
      process.stdout.write('\n');
    } catch (error) {
      // Mark model as unavailable on error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('not found') || errorMessage.includes('404')) {
        this.unavailableModels.add(modelName);
        console.warn(`⚠️  Marking model ${modelName} as unavailable`);
      }
      throw error;
    }
  }

  /**
   * Select best model for a given task
   * Checks for fine-tuned model first if enabled
   */
  selectBestModel(task: string, options?: { requireVision?: boolean; requireCode?: boolean }): string {
    // Check if fine-tuned model is enabled and available
    const useFineTuned = process.env.USE_FINE_TUNED_MODEL === 'true';
    const fineTunedModel = process.env.FINE_TUNED_MODEL || 'ctrlchecks-workflow-builder';
    
    if (useFineTuned && this.loadedModels.has(fineTunedModel)) {
      // Use fine-tuned model for workflow-related tasks
      const isWorkflowTask = task.toLowerCase().includes('workflow') || 
                            task.toLowerCase().includes('automation') ||
                            task.toLowerCase().includes('process') ||
                            task.toLowerCase().includes('build');
      
      if (isWorkflowTask) {
        console.log(`🎯 Using fine-tuned model: ${fineTunedModel}`);
        return fineTunedModel;
      }
    }
    
    if (options?.requireVision) {
      // Vision not supported, fallback to general model
      console.warn('Vision models not available, using general-purpose model');
      return 'qwen2.5:14b-instruct-q4_K_M';
    }
    
    if (options?.requireCode || task.toLowerCase().includes('code') || task.toLowerCase().includes('programming') || 
        task.toLowerCase().includes('debug') || task.toLowerCase().includes('function') || 
        task.toLowerCase().includes('script') || task.toLowerCase().includes('algorithm')) {
      return 'qwen2.5-coder:7b-instruct-q4_K_M';
    }
    
    // Default to primary Qwen2.5 14B model
    return 'qwen2.5:14b-instruct-q4_K_M';
  }

  /**
   * Direct HTTP fetch for HTTP endpoints (bypasses Ollama library to avoid SSL errors)
   */
  private async directHttpFetch(endpoint: string, body: any): Promise<any> {
    // Ensure endpoint starts with / if not already
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    // Use the configured endpoint directly (reverse proxy should handle both GET and POST)
    // Port 8000 is not accessible from external networks, so use reverse proxy
    const url = `${this.endpoint}${normalizedEndpoint}`;
    
    console.log(`🔗 [OllamaManager] Making POST request to: ${url}`);
    console.log(`📤 [OllamaManager] Request body:`, JSON.stringify(body, null, 2));
    
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, 300000); // 5 minutes timeout for generate/chat operations

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [OllamaManager] Request failed: ${response.status} - ${errorText}`);
      
      // Special handling for 405 Method Not Allowed
      if (response.status === 405) {
        const errorMsg = `HTTP 405: Method Not Allowed. The reverse proxy at ${this.endpoint} is not configured to forward POST requests. ` +
          `Please configure the reverse proxy (nginx) to allow POST requests to /api/generate and /api/chat endpoints. ` +
          `Alternatively, ensure port 8000 is accessible if using direct connection.`;
        throw new Error(errorMsg);
      }
      
      // Special handling for 502 Bad Gateway
      if (response.status === 502) {
        const errorMsg = `HTTP 502: Bad Gateway. The Ollama service at ${this.endpoint} is not responding. ` +
          `This usually means:\n` +
          `1. The FastAPI backend service is not running on the server\n` +
          `2. nginx cannot connect to the backend (check nginx configuration)\n` +
          `3. The backend service crashed or is overloaded\n\n` +
          `To fix:\n` +
          `- SSH to the server and check: sudo systemctl status fastapi-ollama\n` +
          `- Check nginx logs: sudo tail -f /var/log/nginx/error.log\n` +
          `- Restart the service: sudo systemctl restart fastapi-ollama\n` +
          `- Verify the service is listening: sudo netstat -tlnp | grep 8000\n` +
          `- Check if using HTTPS, ensure OLLAMA_BASE_URL uses http:// (not https://) for direct connection`;
        throw new Error(errorMsg);
      }
      
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Generate text using Ollama
   */
  async generate(
    prompt: string,
    options: OllamaGenerationOptions = {}
  ): Promise<{
    content: string;
    model: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }> {
    let model = options.model || this.selectBestModel(prompt);
    
    // Check if model is already loaded (handle tags: "model" matches "model:latest")
    const isLoaded = Array.from(this.loadedModels).some(loadedName => {
      // Exact match
      if (loadedName === model) return true;
      // Match with tag (e.g., "model:latest" matches "model")
      if (loadedName.startsWith(model + ':')) {
        model = loadedName; // Use the full name with tag
        return true;
      }
      // Match without tag (e.g., "model" matches "model:latest")
      const loadedBaseName = loadedName.split(':')[0];
      if (loadedBaseName === model) {
        model = loadedName; // Use the full name with tag
        return true;
      }
      return false;
    });
    
    // Ensure model is loaded if not already
    if (!isLoaded) {
      await this.ensureModelsLoaded([model]);
    }

    // OPTIMIZED: Reduced timeout for chat responses
    // For remote endpoints, first request might be slower (model loading), but subsequent should be fast
    const TIMEOUT_MS = options.max_tokens && options.max_tokens <= 500 
      ? 180000  // 3 minutes for short responses (allows for model loading on first request)
      : 300000; // 5 minutes for longer responses
    
    try {
      // Use direct HTTP fetch for HTTP endpoints to avoid SSL errors
      if (this.useHttpDirect && !options.stream) {
        const response = await this.directHttpFetch('/api/generate', {
          model,
          prompt,
          system: options.system,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.max_tokens,
          },
          stream: false,
        });

        return {
          content: response.response || '',
          model: response.model || model,
          usage: {
            promptTokens: response.prompt_eval_count || 0,
            completionTokens: response.eval_count || 0,
            totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
          },
        };
      }

      if (options.stream) {
        // Handle streaming with timeout
        const generatePromise = this.ollama.generate({
          model,
          prompt,
          system: options.system,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.max_tokens,
          },
          stream: true,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Stream generation timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
        });

        const stream = await Promise.race([generatePromise, timeoutPromise]);

        let fullContent = '';
        for await (const chunk of stream) {
          fullContent += chunk.response || '';
        }

        return {
          content: fullContent,
          model,
        };
      } else {
        // Non-streaming with timeout
        const generatePromise = this.ollama.generate({
          model,
          prompt,
          system: options.system,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.max_tokens,
          },
          stream: false,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Generation timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
        });

        const response = await Promise.race([generatePromise, timeoutPromise]);

        return {
          content: response.response,
          model: response.model,
          usage: {
            promptTokens: response.prompt_eval_count || 0,
            completionTokens: response.eval_count || 0,
            totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
          },
        };
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout') || errorMessage.includes('UND_ERR');
      
      console.error(`Error generating with model ${model}:`, error);
      
      if (isTimeout) {
        console.warn(`⏱️  Timeout error with model ${model}. This may indicate the model is slow or Ollama service is overloaded.`);
      }
      
      // Try fallback models (14B -> 7B -> coder)
      const fallbackChain: Record<string, string[]> = {
        'qwen2.5:14b-instruct-q4_K_M': ['qwen2.5:7b-instruct-q4_K_M', 'qwen2.5-coder:7b-instruct-q4_K_M'],
        'qwen2.5:7b-instruct-q4_K_M': ['qwen2.5-coder:7b-instruct-q4_K_M'],
        'qwen2.5-coder:7b-instruct-q4_K_M': ['qwen2.5:7b-instruct-q4_K_M'],
      };
      
      const fallbacks = fallbackChain[model] || ['qwen2.5:7b-instruct-q4_K_M'];
      
      if (fallbacks.length > 0) {
        const fallbackModel = fallbacks[0];
        console.log(`🔄 Trying fallback model: ${fallbackModel} (was using ${model})`);
        
        // Reduce max_tokens on retry to prevent timeout (reduce by 30%)
        const reducedMaxTokens = options.max_tokens 
          ? Math.floor(options.max_tokens * 0.7)
          : undefined;
        
        // Prevent infinite recursion by tracking attempts
        const attemptCount = (options as any).__fallbackAttempt || 0;
        if (attemptCount >= 2) {
          throw new Error(`All fallback models exhausted. Original error: ${errorMessage}`);
        }
        
        return this.generate(prompt, { 
          ...options, 
          model: fallbackModel,
          max_tokens: reducedMaxTokens,
          __fallbackAttempt: attemptCount + 1
        });
      }
      
      // If all fallbacks exhausted or model is already a fallback, throw error
      throw error;
    }
  }

  /**
   * Chat completion using Ollama
   */
  async chat(
    messages: OllamaChatMessage[],
    options: { model?: string; temperature?: number; stream?: boolean; max_tokens?: number; __fallbackAttempt?: number } = {}
  ): Promise<{
    content: string;
    model: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  }> {
    const model = options.model || this.selectBestModel(messages[messages.length - 1]?.content || '');
    
    // Ensure model is loaded
    if (!this.loadedModels.has(model)) {
      await this.ensureModelsLoaded([model]);
    }

    // OPTIMIZED: Timeout for chat responses
    // For remote endpoints, first request might be slower (model loading), but subsequent should be fast
    const TIMEOUT_MS = options.max_tokens && options.max_tokens <= 500 
      ? 180000  // 3 minutes for short responses (allows for model loading on first request)
      : 300000; // 5 minutes for longer responses

    try {
      // Use direct HTTP fetch for HTTP endpoints to avoid SSL errors
      if (this.useHttpDirect && !options.stream) {
        const ollamaMessages = messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        }));

        const response = await this.directHttpFetch('/api/chat', {
          model,
          messages: ollamaMessages,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.max_tokens,
          },
          stream: false,
        });

        return {
          content: response.message?.content || '',
          model: response.model || model,
          usage: {
            promptTokens: response.prompt_eval_count || 0,
            completionTokens: response.eval_count || 0,
            totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
          },
        };
      }

      // Convert messages to Ollama format
      const ollamaMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        images: msg.images,
      }));

      if (options.stream) {
        const chatPromise = this.ollama.chat({
          model,
          messages: ollamaMessages,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.max_tokens,
          },
          stream: true,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Chat stream timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
        });

        const stream = await Promise.race([chatPromise, timeoutPromise]);

        let fullContent = '';
        for await (const chunk of stream) {
          fullContent += chunk.message?.content || '';
        }

        return {
          content: fullContent,
          model,
        };
      } else {
        const chatPromise = this.ollama.chat({
          model,
          messages: ollamaMessages,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.max_tokens,
          },
          stream: false,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Chat timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
        });

        const response = await Promise.race([chatPromise, timeoutPromise]);

        return {
          content: response.message.content,
          model: response.model,
          usage: {
            promptTokens: response.prompt_eval_count || 0,
            completionTokens: response.eval_count || 0,
            totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
          },
        };
      }
    } catch (error) {
      console.error(`Error in chat with model ${model}:`, error);
      
      // Try fallback models (14B -> 7B -> coder)
      const fallbackChain: Record<string, string[]> = {
        'qwen2.5:14b-instruct-q4_K_M': ['qwen2.5:7b-instruct-q4_K_M', 'qwen2.5-coder:7b-instruct-q4_K_M'],
        'qwen2.5:7b-instruct-q4_K_M': ['qwen2.5-coder:7b-instruct-q4_K_M'],
        'qwen2.5-coder:7b-instruct-q4_K_M': ['qwen2.5:7b-instruct-q4_K_M'],
      };
      
      const fallbacks = fallbackChain[model] || ['qwen2.5:7b-instruct-q4_K_M'];
      
      if (fallbacks.length > 0) {
        const fallbackModel = fallbacks[0];
        const attemptCount = (options as any).__fallbackAttempt || 0;
        if (attemptCount >= 2) {
          throw error;
        }
        
        console.log(`🔄 Trying fallback model for chat: ${fallbackModel}`);
        return this.chat(messages, { 
          ...options, 
          model: fallbackModel,
          __fallbackAttempt: attemptCount + 1
        });
      }
      
      throw error;
    }
  }


  /**
   * Generate embeddings
   */
  async embeddings(
    text: string,
    model: string = 'nomic-embed-text'
  ): Promise<number[]> {
    try {
      const response = await this.fetchWithTimeout(`${this.endpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: text,
        }),
      }, 60000); // 1 minute timeout for embeddings

      if (!response.ok) {
        throw new Error(`Embeddings API error: ${response.statusText}`);
      }

      const data = await response.json() as { embedding?: number[] };
      return data.embedding || [];
    } catch (error) {
      console.error(`Error generating embeddings:`, error);
      throw error;
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<OllamaModel[]> {
    try {
      let models: any;
      
      if (this.useHttpDirect) {
        const response = await this.fetchWithTimeout(`${this.endpoint}/api/tags`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }, 30000); // 30 second timeout for listing models
        
        if (!response.ok) {
          throw new Error(`Failed to list models: ${response.statusText}`);
        }
        
        models = await response.json();
      } else {
        models = await this.ollama.list();
      }
      return models.models.map((m: any) => ({
        name: m.name,
        size: `${(m.size / 1024 / 1024 / 1024).toFixed(1)}GB`,
        capabilities: MODEL_CAPABILITIES[m.name as keyof typeof MODEL_CAPABILITIES]?.capabilities || [],
        loaded: true,
      }));
    } catch (error) {
      console.error('Error fetching models:', error);
      return [];
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; models: string[]; endpoint: string }> {       
    try {
      let models: any;
      
      if (this.useHttpDirect) {
        const response = await this.fetchWithTimeout(`${this.endpoint}/api/tags`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }, 10000); // 10 second timeout for health checks
        
        if (!response.ok) {
          throw new Error(`Health check failed: ${response.statusText}`);
        }
        
        models = await response.json();
      } else {
        models = await this.ollama.list();
      }
      return {
        healthy: true,
        models: models.models.map((m: any) => m.name),
        endpoint: this.endpoint,
      };
    } catch (error) {
      return {
        healthy: false,
        models: [],
        endpoint: this.endpoint,
      };
    }
  }
}

// Export singleton instance
export const ollamaManager = new OllamaManager();
