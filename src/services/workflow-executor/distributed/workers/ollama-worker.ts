/**
 * Legacy Ollama Worker - Deprecated
 * All AI operations use Gemini (GEMINI_API_KEY). This worker is kept for compatibility;
 * it delegates to Gemini for generate; embed/train throw.
 */

import { NodeWorker } from '../node-worker';
import { geminiOrchestrator } from '../../../ai/gemini-orchestrator';
import { config } from '../../../../core/config';

export class OllamaWorker extends NodeWorker {
  constructor(config: any) {
    super(config);
  }

  protected async executeNodeLogic(
    inputs: Record<string, unknown>,
    executionId: string,
    nodeId: string
  ): Promise<{ outputs: Record<string, unknown>; metadata?: Record<string, unknown> }> {
    const nodeType = (inputs.node_type as string) || 'ollama_generate';

    if (nodeType === 'ollama_embed' || inputs.operation === 'embed') {
      throw new Error('Ollama removed. Embeddings: use Gemini when implemented or an external embedding API.');
    }
    if (nodeType === 'ollama_train' || inputs.operation === 'train') {
      throw new Error('Ollama removed. Training is not supported with Gemini in this worker.');
    }
    if (nodeType === 'ollama_generate' || inputs.operation === 'generate') {
      return this.processGeneration(inputs, executionId);
    }
    throw new Error(`Unknown operation: ${nodeType}`);
  }

  private async processGeneration(
    inputs: Record<string, unknown>,
    executionId: string
  ): Promise<{ outputs: Record<string, unknown>; metadata?: Record<string, unknown> }> {
    const prompt = (inputs.prompt as string) || (inputs.input as string) || '';
    if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY not configured');
    const content = await geminiOrchestrator.processRequest('chat-generation', prompt, {
      model: (inputs.model as string) || 'gemini-2.5-flash',
      cache: false,
    });
    const text = typeof content === 'string' ? content : (content?.content ?? JSON.stringify(content));
    return {
      outputs: {
        content: text,
        model_used: (inputs.model as string) || 'gemini-2.5-flash',
      },
      metadata: { executionId },
    };
  }
}
