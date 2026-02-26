/**
 * Lightricks Worker
 * 
 * Specialized worker for Lightricks LTX-2 video generation operations:
 * - Text-to-video generation
 * - Image-to-video generation
 * - Audio-to-video generation
 */

import { NodeWorker } from '../node-worker';

interface VideoGenerationResponse {
  success: boolean;
  error?: string;
  video_path?: string;
  metadata?: Record<string, unknown>;
}

export class LightricksWorker extends NodeWorker {
  private fastApiUrl: string;

  constructor(config: any) {
    super(config);
    // Get FastAPI URL from environment
    this.fastApiUrl = process.env.FASTAPI_OLLAMA_URL || 
                     process.env.PYTHON_BACKEND_URL || 
                     'http://localhost:8000';
  }

  protected async executeNodeLogic(
    inputs: Record<string, unknown>,
    executionId: string,
    nodeId: string
  ): Promise<{
    outputs: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }> {
    const operation = (inputs.operation as string) || 'generate';
    const mode = (inputs.mode as string) || 'text-to-video';

    if (operation === 'generate' || operation === 'text-to-video' || operation === 'image-to-video' || operation === 'audio-to-video') {
      return await this.processVideoGeneration(inputs, executionId);
    } else {
      throw new Error(`Unknown Lightricks operation: ${operation}`);
    }
  }

  /**
   * Process video generation
   */
  private async processVideoGeneration(
    inputs: Record<string, unknown>,
    executionId: string
  ): Promise<{
    outputs: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }> {
    const prompt = inputs.prompt as string;
    if (!prompt) {
      throw new Error('Prompt is required for video generation');
    }

    const mode = (inputs.mode as string) || 'text-to-video';
    const duration = (inputs.duration as number) || 5.0;
    const fps = (inputs.fps as number) || 25;
    const resolution = (inputs.resolution as string) || '1080p';
    const imageUrl = inputs.image_url || inputs.imageUrl || null;
    const audioUrl = inputs.audio_url || inputs.audioUrl || null;
    const videoUrl = inputs.video_url || inputs.videoUrl || null;
    const options = (inputs.options as Record<string, unknown>) || {};

    // Prepare request payload
    const payload: Record<string, unknown> = {
      prompt: prompt,
      mode: mode,
      duration: duration,
      fps: fps,
      resolution: resolution,
    };

    if (imageUrl) {
      payload.image_url = imageUrl;
    }
    if (audioUrl) {
      payload.audio_url = audioUrl;
    }
    if (videoUrl) {
      payload.video_url = videoUrl;
    }
    if (Object.keys(options).length > 0) {
      payload.options = options;
    }

    // Call FastAPI LTX-2 endpoint
    try {
      const response = await fetch(`${this.fastApiUrl}/api/video/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FastAPI error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as VideoGenerationResponse;

      if (!result.success) {
        throw new Error(result.error || 'Video generation failed');
      }

      // Store video path (could be large file)
      const videoPath = result.video_path;
      const metadata = result.metadata || {};

      return {
        outputs: {
          video_path: videoPath,
          video_url: videoPath, // Alias for compatibility
          success: true,
        },
        metadata: {
          mode: mode,
          duration: duration,
          fps: fps,
          resolution: resolution,
          prompt: prompt,
          ...metadata,
        },
      };
    } catch (error: any) {
      console.error('[LightricksWorker] Video generation error:', error);
      throw new Error(`Video generation failed: ${error.message || String(error)}`);
    }
  }
}
