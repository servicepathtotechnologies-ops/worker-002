// Model Manager - Gemini models only (uses GEMINI_API_KEY)

import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_MODELS,
  GEMINI_PRO_MODEL,
  getGeminiFallbackModels,
  normalizeGeminiModel,
} from './gemini-models';

export interface ModelInfo {
  name: string;
  size: string;
  capabilities: string[];
  loaded: boolean;
  lastUsed?: Date;
  usageCount: number;
}

/**
 * Model Manager - Gemini API models (no local loading)
 */
export class ModelManager {
  private modelStats: Map<string, ModelInfo> = new Map();
  private modelUsage: Map<string, number> = new Map();

  constructor() {
    GEMINI_MODELS.forEach(name => {
      this.modelStats.set(name, {
        name,
        size: name.includes('pro') ? '~1.25/5 (in/out $/M)' : '~0.075/0.30 (in/out $/M)',
        capabilities: ['text-generation', 'chat', 'reasoning', 'workflow-generation'],
        loaded: true,
        usageCount: 0,
      });
    });
  }

  getModelInfo(modelName: string): ModelInfo | null {
    return this.modelStats.get(modelName) || null;
  }

  trackUsage(modelName: string): void {
    const current = this.modelUsage.get(modelName) || 0;
    this.modelUsage.set(modelName, current + 1);
    const info = this.modelStats.get(modelName);
    if (info) {
      info.lastUsed = new Date();
      info.usageCount++;
    }
  }

  getRecommendedModels(): string[] {
    return [GEMINI_DEFAULT_MODEL, GEMINI_PRO_MODEL];
  }

  getFallbackModels(primaryModel: string): string[] {
    return getGeminiFallbackModels(normalizeGeminiModel(primaryModel));
  }

  async initialize(): Promise<void> {
    // Gemini models are API-based, no loading needed
    console.log('[ModelManager] Gemini models available:', this.getRecommendedModels().join(', '));
  }

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

export const modelManager = new ModelManager();
