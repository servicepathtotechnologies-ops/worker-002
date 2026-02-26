// Core Ollama Orchestrator
// Unified model management & routing for all AI services
// Performance optimization & caching
// Fallback chains & error recovery

import { ollamaManager, OllamaModel } from './ollama-manager';
import { metricsTracker } from './metrics-tracker';
import { modelManager } from './model-manager';
import { aiPerformanceMonitor } from './performance-monitor';

export type AIRequestType = 
  | 'chat-generation'
  | 'intent-analysis'
  | 'text-analysis'
  | 'entity-extraction'
  | 'summarization'
  | 'translation'
  | 'code-generation'
  | 'code-assistance'
  | 'image-understanding'
  | 'image-comparison'
  | 'audio-transcription'
  | 'workflow-generation'
  | 'workflow-analysis'
  | 'node-suggestion'
  | 'error-analysis'
  | 'reasoning';

interface ModelRegistry {
  capabilities: string[];
  size: string;
  loaded: boolean;
  performance: number; // Average response time in ms
  usageCount: number;
  successRate: number;
}

interface SpecializedModels {
  [key: string]: string[];
}

export class OllamaOrchestrator {
  private modelRegistry: Map<string, ModelRegistry> = new Map();
  private specializedModels: SpecializedModels = {
    // Website Chatbot
    'chichu-chat': ['qwen2.5:14b-instruct-q4_K_M'],
    
    // Text Processing
    'text-analysis': ['qwen2.5:14b-instruct-q4_K_M'],
    
    // Code/Editing
    'code-generation': ['qwen2.5-coder:7b-instruct-q4_K_M'],
    'text-editing': ['qwen2.5:14b-instruct-q4_K_M'],
    
    // Workflow Generation (primary: 14B, fallback: 7B)
    'workflow-generation': ['qwen2.5:14b-instruct-q4_K_M', 'qwen2.5:7b-instruct-q4_K_M'],
    'reasoning': ['qwen2.5:14b-instruct-q4_K_M']
  };
  
  private cache: Map<string, { result: any; timestamp: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.initializeModelRegistry();
  }

  private initializeModelRegistry() {
    // Initialize registry with production models (AWS g4dn.xlarge - Qwen2.5 14B primary, 7B fallback)
    const models = [
      { name: 'qwen2.5:14b-instruct-q4_K_M', capabilities: ['text', 'chat', 'reasoning', 'multilingual', 'general', 'workflow'], size: '~8GB' },
      { name: 'qwen2.5:7b-instruct-q4_K_M', capabilities: ['text', 'chat', 'reasoning', 'multilingual', 'general', 'workflow'], size: '~4GB' },
      { name: 'qwen2.5-coder:7b-instruct-q4_K_M', capabilities: ['code', 'programming', 'debugging', 'analysis'], size: '~4GB' },
    ];

    // Add fine-tuned model if configured
    const fineTunedModel = process.env.FINE_TUNED_MODEL || 'ctrlchecks-workflow-builder';
    if (process.env.USE_FINE_TUNED_MODEL === 'true') {
      models.push({
        name: fineTunedModel,
        capabilities: ['workflow', 'automation', 'general', 'chat'],
        size: 'unknown',
      });
      console.log(`✅ Fine-tuned model registered: ${fineTunedModel}`);
    }

    models.forEach(model => {
      this.modelRegistry.set(model.name, {
        capabilities: model.capabilities,
        size: model.size,
        loaded: false,
        performance: 0,
        usageCount: 0,
        successRate: 100,
      });
    });
  }

  async initialize(): Promise<void> {
    console.log('🤖 Initializing Ollama AI Orchestrator...');
    
    try {
      // Initialize underlying Ollama manager
      await ollamaManager.initialize();
      
      // Load all required models
      await this.loadSpecializedModels();
      
      // Warm up models with test prompts
      await this.warmupModels();
      
      // Start performance monitoring
      this.startPerformanceMonitoring();
      
      console.log('✅ Ollama AI Orchestrator ready');
    } catch (error) {
      console.error('❌ Failed to initialize Ollama Orchestrator:', error);
      throw error;
    }
  }

  private async loadSpecializedModels(): Promise<void> {
    const allModels = new Set<string>();
    
    Object.values(this.specializedModels).forEach(models => {
      models.forEach(model => allModels.add(model));
    });
    
    const modelArray = Array.from(allModels);
    console.log(`📦 Loading specialized models: ${modelArray.join(', ')}`);
    
    await ollamaManager.ensureModelsLoaded(modelArray);
    
    // Update registry
    modelArray.forEach(model => {
      const registry = this.modelRegistry.get(model);
      if (registry) {
        registry.loaded = true;
      }
    });
  }

  private async warmupModels(): Promise<void> {
    console.log('🔥 Warming up models...');
    
    // IMPORTANT: Generate enough tokens to fully load models into GPU memory
    // Small token counts don't fully warm up the model
    // Use actual available models from specialized models configuration
    const warmupPrompts = [
      { model: 'qwen2.5:14b-instruct-q4_K_M', prompt: 'Hello, how are you?', max_tokens: 50 },
      { model: 'qwen2.5-coder:7b-instruct-q4_K_M', prompt: '// Write a simple hello function', max_tokens: 50 },
    ];

    // Warm up models in parallel for faster startup
    const warmupPromises = warmupPrompts.map(async ({ model, prompt, max_tokens }) => {
      try {
        const startTime = Date.now();
        await ollamaManager.generate(prompt, { model, max_tokens });
        const duration = Date.now() - startTime;
        console.log(`✅ Warmed up ${model} (${duration}ms)`);
      } catch (error) {
        console.warn(`⚠️  Failed to warm up ${model}:`, error);
      }
    });

    await Promise.all(warmupPromises);
  }

  private startPerformanceMonitoring(): void {
    // Monitor performance every 5 minutes
    setInterval(() => {
      this.logPerformanceMetrics();
    }, 5 * 60 * 1000);
  }

  private logPerformanceMetrics(): void {
    console.log('\n📊 AI Performance Metrics:');
    this.modelRegistry.forEach((stats, model) => {
      if (stats.usageCount > 0) {
        console.log(`  ${model}: ${stats.usageCount} requests, ${stats.performance.toFixed(0)}ms avg, ${stats.successRate.toFixed(1)}% success`);
      }
    });
  }

  async processRequest(
    type: AIRequestType,
    input: any,
    options?: {
      cache?: boolean;
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
    }
  ): Promise<any> {
    const startTime = Date.now();
    // Select optimal model for the task (declare outside try/catch to avoid shadowing)
    let model = await this.selectOptimalModel(type, input);
    
    try {
      // Check cache
      if (options?.cache !== false) {
        const cacheKey = this.getCacheKey(type, input);
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
          metricsTracker.trackCache(true);
          return cached.result;
        }
        metricsTracker.trackCache(false);
      }
      
      // Apply preprocessing based on type
      const processedInput = this.preprocessInput(type, input);
      
      // Execute with retry logic
      const result = await this.executeWithRetry(model, type, processedInput, options);
      
      // Apply postprocessing
      const processedResult = this.postprocessResult(type, result);
      
      // Update model performance metrics
      const duration = Date.now() - startTime;
      this.updateModelPerformance(model, duration, true);
      
      // Cache result
      if (options?.cache !== false) {
        const cacheKey = this.getCacheKey(type, input);
        this.cache.set(cacheKey, {
          result: processedResult,
          timestamp: Date.now(),
        });
      }
      
      // Track metrics
      metricsTracker.trackRequest(model, true, duration);
      aiPerformanceMonitor.trackRequest(type, model, startTime, true);
      
      return processedResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      // Track failure metrics
      metricsTracker.trackRequest(model, false, duration);
      aiPerformanceMonitor.trackRequest(type, model, startTime, false);
      
      // Try fallback model
      try {
        const fallbackModel = this.getFallbackModel(type);
        if (fallbackModel && fallbackModel !== model) {
          console.log(`🔄 Trying fallback model: ${fallbackModel}`);
          model = fallbackModel; // Update model for fallback
          const result = await this.executeWithRetry(fallbackModel, type, input, options);
          this.updateModelPerformance(fallbackModel, Date.now() - startTime, true);
          return this.postprocessResult(type, result);
        }
      } catch (fallbackError) {
        console.error('❌ Fallback also failed:', fallbackError);
      }
      
      // CRITICAL: Check if error is due to missing models
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isModelNotFound = errorMessage.includes('not found') || 
                             errorMessage.includes('404') ||
                             errorMessage.includes('model') && errorMessage.includes('not found');
      
      if (isModelNotFound) {
        console.error('❌ Ollama models not available. AI features will be disabled.');
        console.error('💡 To fix: Install models on Ollama server or use local Ollama with models installed.');
        // Return a graceful error response instead of throwing
        this.updateModelPerformance(model, duration, false);
        throw new Error('Ollama models not available. Please install qwen2.5:14b-instruct-q4_K_M, qwen2.5:7b-instruct-q4_K_M, and qwen2.5-coder:7b-instruct-q4_K_M on your Ollama server.');
      }
      
      this.updateModelPerformance(model, duration, false);
      throw error;
    }
  }

  private async selectOptimalModel(type: AIRequestType, input: any): Promise<string> {
    // Check if fine-tuned model is enabled and available
    const useFineTuned = process.env.USE_FINE_TUNED_MODEL === 'true';
    const fineTunedModel = process.env.FINE_TUNED_MODEL || 'ctrlchecks-workflow-builder';
    
    // Use fine-tuned model for workflow-related tasks
    const workflowTypes: AIRequestType[] = ['workflow-generation', 'workflow-analysis'];
    if (useFineTuned && workflowTypes.includes(type)) {
      const registry = this.modelRegistry.get(fineTunedModel);
      if (registry && registry.loaded) {
        console.log(`🎯 Using fine-tuned model for ${type}: ${fineTunedModel}`);
        return fineTunedModel;
      } else {
        // Try to load fine-tuned model if not in registry
        const loadedModels = await ollamaManager.getAvailableModels();
        const modelExists = loadedModels.some((m: OllamaModel) => m.name === fineTunedModel);
        if (modelExists) {
          // Add to registry
          this.modelRegistry.set(fineTunedModel, {
            capabilities: ['workflow', 'automation', 'general'],
            size: 'unknown',
            loaded: true,
            performance: 0,
            usageCount: 0,
            successRate: 100,
          });
          console.log(`🎯 Using fine-tuned model for ${type}: ${fineTunedModel}`);
          return fineTunedModel;
        }
      }
    }
    
    // Check for specialized models
    if (type === 'image-understanding' || type === 'image-comparison') {
      // Vision models not supported, fallback to general model
      console.warn('Vision models not available, using general-purpose model');
      return 'qwen2.5:14b-instruct-q4_K_M';
    }
    
    if (type === 'code-generation' || type === 'code-assistance') {
      return 'qwen2.5-coder:7b-instruct-q4_K_M';
    }
    
    if (type === 'audio-transcription') {
      // Whisper is not a standard Ollama model - use text models as fallback
      // Audio transcription should be handled by specialized services
      return 'qwen2.5:14b-instruct-q4_K_M'; // Fallback to general model
    }
    
    // Get specialized models for this type
    const specialized = this.specializedModels[type] || this.specializedModels['chichu-chat'];
    
    if (specialized && specialized.length > 0) {
      // Select based on performance
      let bestModel = specialized[0];
      let bestPerformance = Infinity;
      
      for (const model of specialized) {
        const registry = this.modelRegistry.get(model);
        if (registry && registry.loaded) {
          if (registry.performance < bestPerformance) {
            bestPerformance = registry.performance;
            bestModel = model;
          }
        }
      }
      
      return bestModel;
    }
    
    // Default to primary Qwen2.5 14B model
    return 'qwen2.5:14b-instruct-q4_K_M';
  }

  private preprocessInput(type: AIRequestType, input: any): any {
    // Apply type-specific preprocessing
    switch (type) {
      case 'intent-analysis':
        return {
          message: input.message || input,
          availableIntents: input.availableIntents || ['question', 'command', 'feedback', 'help'],
        };
      
      case 'summarization':
        return {
          text: input.text || input,
          length: input.length || 'medium',
        };
      
      default:
        return input;
    }
  }

  private async executeWithRetry(
    model: string,
    type: AIRequestType,
    input: any,
    options?: any,
    maxRetries = 3
  ): Promise<any> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (type === 'image-understanding' || type === 'image-comparison') {
          throw new Error('Image analysis functionality has been removed. Multimodal features are no longer supported.');
        }
        
        if (type === 'code-generation' || type === 'code-assistance') {
          const prompt = this.buildCodePrompt(type, input);
        // Enforce temperature <= 0.2 for workflow generation
        const temperature = Math.min(options?.temperature ?? 0.2, 0.2);
        return await ollamaManager.generate(prompt, {
          model,
          system: input.system,
          temperature,
          max_tokens: options?.max_tokens,
          stream: options?.stream,
        });
        }
        
        // Default: text generation
        const prompt = this.buildPrompt(type, input);
        
        // OPTIMIZATION: For chat-generation, use lower max_tokens for faster responses
        let maxTokens = options?.max_tokens;
        if (type === 'chat-generation' && !maxTokens) {
          maxTokens = 300; // Default to 300 tokens for faster chat responses
        }
        
        // Enforce temperature <= 0.2 for deterministic responses
        const temperature = Math.min(options?.temperature ?? 0.2, 0.2);
        return await ollamaManager.generate(prompt, {
          model,
          system: input.system,
          temperature,
          max_tokens: maxTokens,
          stream: options?.stream,
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message.toLowerCase();
        const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('und_err');
        
        if (attempt < maxRetries) {
          // Exponential backoff with longer delays for timeout errors
          const baseDelay = isTimeout ? 5000 : 2000; // 5 seconds for timeouts, 2 seconds for other errors
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.warn(`⚠️  Attempt ${attempt} failed${isTimeout ? ' (timeout)' : ''}, retrying in ${delay}ms...`);
          
          // For timeout errors, try a different model on retry
          if (isTimeout && attempt === 1) {
            const fallbackChain: Record<string, string[]> = {
              'qwen2.5:14b-instruct-q4_K_M': ['qwen2.5:7b-instruct-q4_K_M', 'qwen2.5-coder:7b-instruct-q4_K_M'],
              'qwen2.5:7b-instruct-q4_K_M': ['qwen2.5-coder:7b-instruct-q4_K_M'],
              'qwen2.5-coder:7b-instruct-q4_K_M': ['qwen2.5:7b-instruct-q4_K_M'],
              'qwen2.5-coder:7b': ['qwen2.5:7b-instruct-q4_K_M', 'qwen2.5-coder:7b-instruct-q4_K_M'],
            };
            
            const fallbacks = fallbackChain[model] || ['qwen2.5:7b-instruct-q4_K_M'];
            if (fallbacks.length > 0) {
              const newModel = fallbacks[0];
              console.log(`🔄 Switching to fallback model: ${newModel} due to timeout (was using ${model})`);
              return this.executeWithRetry(newModel, type, input, {
                ...options,
                max_tokens: options?.max_tokens ? Math.floor(options.max_tokens * 0.7) : undefined
              }, maxRetries - attempt);
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`❌ All ${maxRetries} attempts failed. Last error:`, lastError.message);
          
          // Final fallback: try a different model
          if (isTimeout) {
            const fallbackChain: Record<string, string[]> = {
              'qwen2.5:14b-instruct-q4_K_M': ['qwen2.5:7b-instruct-q4_K_M', 'qwen2.5-coder:7b-instruct-q4_K_M'],
              'qwen2.5:7b-instruct-q4_K_M': ['qwen2.5-coder:7b-instruct-q4_K_M'],
              'qwen2.5-coder:7b-instruct-q4_K_M': ['qwen2.5:7b-instruct-q4_K_M'],
              'qwen2.5-coder:7b': ['qwen2.5:7b-instruct-q4_K_M', 'qwen2.5-coder:7b-instruct-q4_K_M'],
            };
            
            const fallbacks = fallbackChain[model] || ['qwen2.5:7b-instruct-q4_K_M'];
            if (fallbacks.length > 0) {
              const newModel = fallbacks[0];
              console.log(`🔄 Final fallback: trying model ${newModel} (was using ${model})`);
              try {
                return await this.executeWithRetry(newModel, type, input, {
                  ...options,
                  max_tokens: options?.max_tokens ? Math.floor(options.max_tokens * 0.5) : undefined
                }, 2);
              } catch (finalError) {
                console.error(`❌ Fallback model ${newModel} also failed:`, finalError instanceof Error ? finalError.message : String(finalError));
              }
            }
          }
        }
      }
    }
    
    throw lastError || new Error('Execution failed after retries');
  }

  private buildPrompt(type: AIRequestType, input: any): string {
    switch (type) {
      case 'intent-analysis':
        return `Analyze the following message and determine its intent. Available intents: ${input.availableIntents?.join(', ')}. 
Message: "${input.message}"
Respond with JSON: { "intent": "...", "confidence": 0.0-1.0, "entities": [], "requiresAction": false }`;
      
      case 'summarization':
        const length = input.length || 'medium';
        return `Summarize the following text in a ${length} format:
${input.text}`;
      
      case 'workflow-generation':
        // If prompt is already a full prompt (with few-shot examples), use it directly
        // Otherwise, build a simple prompt
        if (typeof input === 'string' && input.length > 200) {
          // Likely a full prompt with examples
          return input;
        }
        if (input.prompt && typeof input.prompt === 'string' && input.prompt.length > 200) {
          // Full prompt provided
          return input.prompt;
        }
        // Simple prompt for basic requests
        return `Generate a workflow based on this requirement: ${input.prompt || input}`;
      
      case 'error-analysis':
        return `Analyze this error and suggest a fix:
Error: ${input.error}
Context: ${JSON.stringify(input.context || {})}`;
      
      default:
        return typeof input === 'string' ? input : JSON.stringify(input);
    }
  }

  private buildCodePrompt(type: AIRequestType, input: any): string {
    if (type === 'code-assistance') {
      return `Provide code assistance for this context:
${JSON.stringify(input, null, 2)}

Provide suggestions, corrections, and optimizations.`;
    }
    
    return `Generate code based on: ${input.prompt || JSON.stringify(input)}`;
  }

  private postprocessResult(type: AIRequestType, result: any): any {
    // Apply type-specific postprocessing
    if (type === 'intent-analysis') {
      try {
        const parsed = typeof result.content === 'string' 
          ? JSON.parse(result.content) 
          : result.content;
        return parsed;
      } catch {
        return {
          intent: 'unknown',
          confidence: 0.5,
          entities: [],
          requiresAction: false,
        };
      }
    }
    
    return result.content || result;
  }

  private updateModelPerformance(model: string, duration: number, success: boolean): void {
    const registry = this.modelRegistry.get(model);
    if (registry) {
      registry.usageCount++;
      
      if (success) {
        // Update average performance
        registry.performance = 
          (registry.performance * (registry.usageCount - 1) + duration) / registry.usageCount;
        
        // Update success rate
        const successCount = Math.floor(registry.usageCount * (registry.successRate / 100));
        registry.successRate = ((successCount + 1) / registry.usageCount) * 100;
      } else {
        const successCount = Math.floor(registry.usageCount * (registry.successRate / 100));
        registry.successRate = (successCount / registry.usageCount) * 100;
      }
    }
  }

  private getFallbackModel(type: AIRequestType): string | null {
    // Return a fallback model for the type
    if (type === 'code-generation' || type === 'code-assistance') {
      return 'qwen2.5-coder:7b-instruct-q4_K_M'; // Code model
    }
    
    return 'qwen2.5:7b-instruct-q4_K_M'; // Default fallback to 7B model
  }

  private getCacheKey(type: AIRequestType, input: any): string {
    return `${type}:${JSON.stringify(input)}`;
  }

  async listModels(): Promise<any[]> {
    return await ollamaManager.getAvailableModels();
  }

  async loadModel(model: string): Promise<void> {
    await ollamaManager.ensureModelsLoaded([model]);
    const registry = this.modelRegistry.get(model);
    if (registry) {
      registry.loaded = true;
    }
  }

  getOptimizationSuggestions(): any[] {
    const suggestions: any[] = [];
    
    this.modelRegistry.forEach((stats, model) => {
      if (stats.performance > 5000) {
        suggestions.push({
          type: 'performance',
          model,
          issue: `Slow response time: ${stats.performance.toFixed(0)}ms`,
          suggestion: 'Consider using lighter model or implementing caching',
        });
      }
      
      if (stats.usageCount > 1000) {
        suggestions.push({
          type: 'popularity',
          model,
          issue: `High usage: ${stats.usageCount} requests`,
          suggestion: 'Keep this model pre-loaded for better performance',
        });
      }
      
      if (stats.successRate < 95) {
        suggestions.push({
          type: 'reliability',
          model,
          issue: `Low success rate: ${stats.successRate.toFixed(1)}%`,
          suggestion: 'Investigate error patterns and improve error handling',
        });
      }
    });
    
    return suggestions;
  }
}

// Export singleton instance
export const ollamaOrchestrator = new OllamaOrchestrator();
