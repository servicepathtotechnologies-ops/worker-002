// AI Gateway - Unified API for all AI services
// RESTful endpoints for all AI functions
// WebSocket support for real-time AI interactions (future)
// Streaming responses for long AI processes

import { Router, Request, Response } from 'express';
import { ollamaOrchestrator } from '../services/ai/ollama-orchestrator';
import { chichuChatbot } from '../services/ai/chichu-chatbot';
import { aiWorkflowEditor } from '../services/ai/workflow-editor';
// ✅ MIGRATION: Legacy builder import removed - workflow improvement feature not yet available in production pipeline
import { aiPerformanceMonitor } from '../services/ai/performance-monitor';
import { ollamaManager } from '../services/ai/ollama-manager';

const router = Router();

// Initialize AI services on module load
let initialized = false;

async function initializeAIServices() {
  if (initialized) return;
  
  try {
    console.log('🤖 Initializing AI Gateway services...');
    await ollamaOrchestrator.initialize();
    console.log('✅ AI Gateway initialized');
    initialized = true;
  } catch (error) {
    console.error('⚠️  AI Gateway initialization failed:', error);
    console.log('⚠️  AI features may be unavailable');
  }
}

// Initialize on startup
initializeAIServices().catch(console.error);

// ==================== CHICHU CHATBOT ====================
router.post('/chatbot/message', async (req: Request, res: Response) => {
  try {
    const { sessionId, message, context } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const session = sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const response = await chichuChatbot.handleMessage(session, message, context);
    
    res.json({
      success: true,
      ...response,
      sessionId: session,
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/chatbot/session/:sessionId/history', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const history = chichuChatbot.getConversationHistory(sessionId);
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.delete('/chatbot/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    chichuChatbot.clearConversation(sessionId);
    res.json({ success: true, message: 'Conversation cleared' });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Text-specific endpoints - Multimodal processors removed
router.post('/text/analyze', async (req: Request, res: Response) => {
  res.status(501).json({ 
    success: false,
    error: 'Text analysis functionality has been removed. Multimodal features are no longer supported.' 
  });
});

router.post('/text/summarize', async (req: Request, res: Response) => {
  res.status(501).json({ 
    success: false,
    error: 'Text summarization functionality has been removed. Multimodal features are no longer supported.' 
  });
});

router.post('/text/extract-entities', async (req: Request, res: Response) => {
  res.status(501).json({ 
    success: false,
    error: 'Entity extraction functionality has been removed. Multimodal features are no longer supported.' 
  });
});

// Image-specific endpoints - Multimodal processors removed
router.post('/image/describe', async (req: Request, res: Response) => {
  res.status(501).json({ 
    success: false,
    error: 'Image description functionality has been removed. Multimodal features are no longer supported.' 
  });
});

router.post('/image/compare', async (req: Request, res: Response) => {
  res.status(501).json({ 
    success: false,
    error: 'Image comparison functionality has been removed. Multimodal features are no longer supported.' 
  });
});

// Audio-specific endpoints - Multimodal processors removed
router.post('/audio/transcribe', async (req: Request, res: Response) => {
  res.status(501).json({ 
    success: false,
    error: 'Audio transcription functionality has been removed. Multimodal features are no longer supported.' 
  });
});

// ==================== AI WORKFLOW EDITOR ====================
router.post('/editor/suggest-improvements', async (req: Request, res: Response) => {
  try {
    const { workflow, nodeId } = req.body;
    
    if (!workflow || !nodeId) {
      return res.status(400).json({ error: 'Workflow and nodeId are required' });
    }
    
    const node = workflow.nodes?.find((n: any) => n.id === nodeId);
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    const suggestions = await aiWorkflowEditor.suggestNodeImprovements(workflow, node);
    res.json({ success: true, suggestions });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/editor/replace-node', async (req: Request, res: Response) => {
  try {
    const { workflow, nodeId, replacementType } = req.body;
    
    if (!workflow || !nodeId || !replacementType) {
      return res.status(400).json({ error: 'Workflow, nodeId, and replacementType are required' });
    }
    
    const result = await aiWorkflowEditor.replaceNode(workflow, nodeId, replacementType);
    res.json({ ...result });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/editor/code-assist', async (req: Request, res: Response) => {
  try {
    const { node, code, language } = req.body;
    
    if (!node || !code || !language) {
      return res.status(400).json({ error: 'Node, code, and language are required' });
    }
    
    const assistance = await aiWorkflowEditor.realTimeCodeAssist(node, code, language);
    res.json({ success: true, assistance });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== WORKFLOW BUILDER (MIGRATED TO NEW PIPELINE) ====================
// ✅ MIGRATION: Endpoint migrated to use new deterministic pipeline
router.post('/builder/generate-from-prompt', async (req: Request, res: Response) => {
  try {
    const { prompt, constraints, options } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    // ✅ MIGRATION: Use new pipeline instead of legacy builder
    const { workflowLifecycleManager } = await import('../services/workflow-lifecycle-manager');
    
    // Stream progress if requested
    if (options?.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Generate workflow using new pipeline
      const lifecycleResult = await workflowLifecycleManager.generateWorkflowGraph(prompt, {
        ...constraints,
        onProgress: (step: number, stepName: string, progress: number, details?: any) => {
          res.write(`data: ${JSON.stringify({ step, stepName, progress, details })}\n\n`);
        },
      });
      
      // Send final workflow
      res.write(`data: ${JSON.stringify({ type: 'complete', workflow: lifecycleResult.workflow })}\n\n`);
      res.end();
    } else {
      const lifecycleResult = await workflowLifecycleManager.generateWorkflowGraph(prompt, constraints);
      res.json({ 
        success: true, 
        workflow: lifecycleResult.workflow,
        requirements: (lifecycleResult as any).requirements || {},
        documentation: lifecycleResult.documentation,
        requiredCredentials: lifecycleResult.requiredCredentials || [],
      });
    }
  } catch (error) {
    console.error('Workflow generation error:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ✅ MIGRATION: Legacy workflow improvement endpoint deprecated
// This feature is not yet available in the production pipeline architecture
// Use /editor/suggest-improvements for node-level improvements instead
router.post('/builder/improve-workflow', async (req: Request, res: Response) => {
  res.status(501).json({ 
    success: false,
    error: 'Workflow improvement functionality has been deprecated. The legacy builder has been replaced with the production pipeline architecture. Use /editor/suggest-improvements for node-level improvements instead.',
    deprecated: true,
    alternative: '/editor/suggest-improvements',
  });
});

// ==================== DIRECT OLLAMA ACCESS ====================
router.post('/ollama/generate', async (req: Request, res: Response) => {
  try {
    const { model, prompt, options } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    const result = await ollamaManager.generate(prompt, {
      model,
      ...options,
    });
    
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/ollama/chat', async (req: Request, res: Response) => {
  try {
    const { model, messages, options } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }
    
    const result = await ollamaManager.chat(messages, {
      model,
      ...options,
    });
    
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/ollama/models', async (req: Request, res: Response) => {
  try {
    const models = await ollamaOrchestrator.listModels();
    res.json({ success: true, models });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/ollama/load-model', async (req: Request, res: Response) => {
  try {
    const { model } = req.body;
    
    if (!model) {
      return res.status(400).json({ error: 'Model name is required' });
    }
    
    await ollamaOrchestrator.loadModel(model);
    res.json({ success: true, message: `Model ${model} loaded` });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==================== PERFORMANCE & METRICS ====================
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const stats = aiPerformanceMonitor.getStats();
    const suggestions = aiPerformanceMonitor.getOptimizationSuggestions();
    
    res.json({
      success: true,
      metrics: stats,
      suggestions,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/metrics/optimization-suggestions', async (req: Request, res: Response) => {
  try {
    const suggestions = aiPerformanceMonitor.getOptimizationSuggestions();
    res.json({ success: true, suggestions });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
