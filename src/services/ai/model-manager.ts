// Model Manager - Handles model loading, unloading, and optimization

import { OllamaManager } from './ollama-manager';
import { ollamaManager } from './ollama-manager';

export interface ModelInfo {
  name: string;
  size: string;
  capabilities: string[];
  loaded: boolean;
  lastUsed?: Date;
  usageCount: number;
}

/**
 * Model Manager
 * Manages model lifecycle, loading, and optimization
 */
export class ModelManager {
  private ollama: OllamaManager;
  private modelStats: Map<string, ModelInfo> = new Map();
  private maxLoadedModels = 5; // Keep max 5 models loaded at once
  private modelUsage: Map<string, number> = new Map();

  constructor(ollamaManager: OllamaManager) {
    this.ollama = ollamaManager;
  }

  /**
   * Get model information
   */
  getModelInfo(modelName: string): ModelInfo | null {
    return this.modelStats.get(modelName) || null;
  }

  /**
   * Track model usage
   */
  trackUsage(modelName: string): void {
    const current = this.modelUsage.get(modelName) || 0;
    this.modelUsage.set(modelName, current + 1);

    const info = this.modelStats.get(modelName);
    if (info) {
      info.lastUsed = new Date();
      info.usageCount++;
    }
  }

  /**
   * Get recommended models for AWS deployment (g4dn.xlarge - 16GB GPU)
   * Optimized for production with 2 best models
   */
  getRecommendedModels(): string[] {
    // Best 2 models for production (fits perfectly in g4dn.xlarge)
    return [
      'qwen2.5:14b-instruct-q4_K_M',  // ~8GB - Best general purpose, excellent reasoning, multilingual
      'qwen2.5-coder:7b-instruct-q4_K_M',   // ~4GB - Best for code generation and analysis (Qwen2.5-Coder)
    ];
    // Total: ~12GB - Fits comfortably in g4dn.xlarge (16GB GPU) with room for inference
  }

  /**
   * Get fallback models
   */
  getFallbackModels(primaryModel: string): string[] {
    const fallbackMap: Record<string, string[]> = {
      'qwen2.5:14b-instruct-q4_K_M': ['qwen2.5:7b-instruct-q4_K_M', 'qwen2.5-coder:7b-instruct-q4_K_M'],      // Fallback to smaller models
      'qwen2.5:7b-instruct-q4_K_M': ['qwen2.5-coder:7b-instruct-q4_K_M'],      // Fallback to code model
      'qwen2.5-coder:7b-instruct-q4_K_M': ['qwen2.5:7b-instruct-q4_K_M'],      // Fallback to general model
      'qwen2.5-coder:7b': ['qwen2.5:7b-instruct-q4_K_M', 'qwen2.5-coder:7b-instruct-q4_K_M'],
    };

    return fallbackMap[primaryModel] || ['qwen2.5:7b-instruct-q4_K_M'];
  }

  /**
   * Initialize - Load recommended models
   */
  async initialize(): Promise<void> {
    const recommended = this.getRecommendedModels();
    console.log('📦 Loading recommended models:', recommended.join(', '));
    
    await this.ollama.ensureModelsLoaded(recommended);
    
    // Initialize stats
    for (const model of recommended) {
      this.modelStats.set(model, {
        name: model,
        size: this.getModelSize(model),
        capabilities: this.getModelCapabilities(model),
        loaded: true,
        usageCount: 0,
      });
    }
  }

  /**
   * Get model size
   */
  private getModelSize(modelName: string): string {
    const sizes: Record<string, string> = {
      'qwen2.5:14b-instruct-q4_K_M': '~8GB',
      'qwen2.5:7b-instruct-q4_K_M': '~4GB',
      'qwen2.5-coder:7b-instruct-q4_K_M': '~4GB',
      'qwen2.5-coder:7b': '4.5GB',
    };
    return sizes[modelName] || 'Unknown';
  }

  /**
   * Get model capabilities
   */
  private getModelCapabilities(modelName: string): string[] {
    const capabilities: Record<string, string[]> = {
      'qwen2.5:14b-instruct-q4_K_M': ['text-generation', 'reasoning', 'chat', 'multilingual', 'general-purpose', 'workflow-generation'],
      'qwen2.5:7b-instruct-q4_K_M': ['text-generation', 'reasoning', 'chat', 'multilingual', 'general-purpose'],
      'qwen2.5-coder:7b-instruct-q4_K_M': ['code-generation', 'code-analysis', 'debugging', 'programming', 'documentation'],
      'qwen2.5-coder:7b': ['code-generation', 'code-analysis', 'debugging', 'programming', 'documentation'],
    };
    return capabilities[modelName] || [];
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [model, count] of this.modelUsage.entries()) {
      const info = this.modelStats.get(model);
      stats[model] = {
        usageCount: count,
        lastUsed: info?.lastUsed,
        capabilities: info?.capabilities || [],
        size: info?.size || 'Unknown',
      };
    }
    
    return stats;
  }
}

// Export singleton
export const modelManager = new ModelManager(ollamaManager);
