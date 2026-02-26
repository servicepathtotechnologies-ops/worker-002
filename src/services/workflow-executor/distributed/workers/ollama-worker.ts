/**
 * Ollama Worker
 * 
 * Specialized worker for Ollama AI operations:
 * - Embeddings
 * - Text generation
 * - Model training
 */

import { NodeWorker } from '../node-worker';
import { OllamaManager } from '../../../ai/ollama-manager';

export class OllamaWorker extends NodeWorker {
  private ollamaManager: OllamaManager;

  constructor(config: any) {
    super(config);
    this.ollamaManager = new OllamaManager();
  }

  protected async executeNodeLogic(
    inputs: Record<string, unknown>,
    executionId: string,
    nodeId: string
  ): Promise<{
    outputs: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }> {
    const nodeType = inputs.node_type as string || 'ollama_generate';

    if (nodeType === 'ollama_embed' || inputs.operation === 'embed') {
      return await this.processEmbeddings(inputs, executionId);
    } else if (nodeType === 'ollama_generate' || inputs.operation === 'generate') {
      return await this.processGeneration(inputs, executionId);
    } else if (nodeType === 'ollama_train' || inputs.operation === 'train') {
      return await this.processTraining(inputs, executionId);
    } else {
      throw new Error(`Unknown Ollama operation: ${nodeType}`);
    }
  }

  /**
   * Process embeddings
   */
  private async processEmbeddings(
    inputs: Record<string, unknown>,
    executionId: string
  ): Promise<{
    outputs: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }> {
    // Input is a REFERENCE to document in storage
    const documentRef = inputs.document_ref || inputs.document;

    // Load document from storage
    let documentContent: string;
    if (typeof documentRef === 'string') {
      documentContent = documentRef;
    } else if (documentRef && typeof documentRef === 'object' && '_storage' in documentRef) {
      // Load from object storage
      const loaded = await this.storage.loadData(documentRef);
      documentContent = typeof loaded === 'string' ? loaded : JSON.stringify(loaded);
    } else {
      throw new Error('Invalid document reference');
    }

    // Process with Ollama
    const model = (inputs.model as string) || 'nomic-embed-text';
    const embeddings = await this.ollamaManager.embeddings(
      documentContent,
      model
    );

    // Store embeddings in object storage (too large for DB)
    // Embeddings are returned as array, which will be stored in object storage
    return {
      outputs: {
        embeddings: embeddings, // Will be stored in object storage if large
        model_used: model,
      },
      metadata: {
        model_used: model,
        embedding_dim: Array.isArray(embeddings) && embeddings.length > 0 
          ? (Array.isArray(embeddings[0]) ? embeddings[0].length : 1)
          : 0,
        text_length: documentContent.length,
      },
    };
  }

  /**
   * Process text generation
   */
  private async processGeneration(
    inputs: Record<string, unknown>,
    executionId: string
  ): Promise<{
    outputs: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }> {
    const prompt = inputs.prompt as string;
    const model = (inputs.model as string) || 'qwen2.5:14b-instruct-q4_K_M';
    const options = (inputs.options as Record<string, unknown>) || {};

    // Retrieve context embeddings if provided
    let contextEmbeddings: unknown = null;
    if (inputs.context_embeddings_ref) {
      contextEmbeddings = await this.storage.loadData(
        inputs.context_embeddings_ref as Record<string, unknown>
      );
    }

    // Generate with Ollama
    // Note: context embeddings would need to be incorporated into the prompt
    // OllamaGenerationOptions doesn't support a separate context parameter
    // If context is needed, it should be prepended to the prompt
    let finalPrompt = prompt;
    if (contextEmbeddings) {
      // For now, if context embeddings are provided, we'll note it in metadata
      // In a full implementation, you'd use RAG to incorporate embeddings into the prompt
      console.log('[OllamaWorker] Context embeddings provided but not yet integrated into prompt');
    }

    const response = await this.ollamaManager.generate(
      finalPrompt,
      {
        model: model,
        ...options,
      }
    );

    // Store generated text (could be large)
    const generatedText = response.content || '';
    
    return {
      outputs: {
        generated_text: generatedText,
        model: model,
      },
      metadata: {
        model: model,
        text_length: generatedText.length,
        tokens_used: response.usage?.totalTokens || 0,
        prompt_tokens: response.usage?.promptTokens || 0,
        completion_tokens: response.usage?.completionTokens || 0,
      },
    };
  }

  /**
   * Process model training
   */
  private async processTraining(
    inputs: Record<string, unknown>,
    executionId: string
  ): Promise<{
    outputs: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }> {
    // Training is a long-running operation
    // This is a placeholder - actual training would be more complex
    const trainingDataRef = inputs.training_data_ref;
    const baseModel = (inputs.base_model as string) || 'qwen2.5:14b-instruct-q4_K_M';

    // Load training data from storage
    const trainingData = await this.storage.loadData(
      trainingDataRef as Record<string, unknown>
    );

    // Start training (this would be async and long-running)
    // For now, return a placeholder
    return {
      outputs: {
        training_job_id: `train-${executionId}-${Date.now()}`,
        status: 'started',
      },
      metadata: {
        base_model: baseModel,
        training_samples: Array.isArray(trainingData) ? trainingData.length : 0,
      },
    };
  }
}
