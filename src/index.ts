/**
 * Main Express.js Server for CtrlChecks Worker
 * Migrated from Supabase Edge Functions
 * Ollama-First AI Architecture
 * 
 * 🚨 CRITICAL: Environment variables MUST be loaded FIRST
 * The env-loader module loads dotenv synchronously before any other imports.
 * This ensures process.env is populated before config.ts and other modules read it.
 */

// ⚡ LOAD ENVIRONMENT VARIABLES FIRST - DO NOT MOVE THIS IMPORT
// This must be the very first import to ensure all environment variables are loaded
// before any other code (especially config.ts) tries to read process.env
import './core/env-loader';

// ✅ CRITICAL: Initialize NodeLibrary early to ensure schemas are loaded
// This ensures nodeLibrary is initialized before any validators try to use it
import { nodeLibrary } from './services/nodes/node-library';
import { NodeSchemaRegistry } from './core/contracts/node-schema-registry';

// ✅ ARCHITECTURAL REFACTOR: Initialize UnifiedNodeRegistry (Single Source of Truth)
import { unifiedNodeRegistry } from './core/registry/unified-node-registry';

// Initialize node registry on startup
console.log('[ServerStartup] 🔵 Initializing node registry...');
try {
  const registry = NodeSchemaRegistry.getInstance();
  console.log('[ServerStartup] ✅ Node registry initialized');
  
  // Initialize UnifiedNodeRegistry (permanent architecture fix)
  console.log('[ServerStartup] 🏗️  Initializing UnifiedNodeRegistry (permanent architecture fix)...');
  try {
    const unifiedRegistry = unifiedNodeRegistry; // This triggers initialization
    const nodeCount = unifiedRegistry.getAllTypes().length;
    console.log(`[ServerStartup] ✅ UnifiedNodeRegistry initialized with ${nodeCount} node definitions`);
    
    // Verify critical nodes are in unified registry
    const criticalNodes = ['google_sheets', 'ai_chat_model', 'google_gmail'];
    const missingInUnified: string[] = [];
    for (const nodeType of criticalNodes) {
      if (!unifiedRegistry.has(nodeType)) {
        missingInUnified.push(nodeType);
      }
    }
    if (missingInUnified.length > 0) {
      console.warn(`[ServerStartup] ⚠️  Missing in UnifiedNodeRegistry: ${missingInUnified.join(', ')}`);
    } else {
      console.log(`[ServerStartup] ✅ All critical nodes verified in UnifiedNodeRegistry`);
    }
  } catch (error: any) {
    console.error('[ServerStartup] ❌ Failed to initialize UnifiedNodeRegistry:', error.message);
  }
  
  // Verify critical nodes are registered
  // Use resolver to get canonical node types for critical nodes
  const { resolveNodeType } = require('./core/utils/node-type-resolver-util');
  const criticalNodes = [
    'ai_service',
    resolveNodeType('gmail', true), // Resolves 'gmail' → 'google_gmail'
    'google_gmail'
  ].filter((node, index, arr) => arr.indexOf(node) === index); // Remove duplicates
  const missingNodes: string[] = [];
  
  for (const nodeType of criticalNodes) {
    const schema = registry.get(nodeType);
    if (!schema) {
      missingNodes.push(nodeType);
      console.error(`[ServerStartup] ❌ Critical node missing from registry: ${nodeType}`);
    } else {
      console.log(`[ServerStartup] ✅ Critical node registered: ${nodeType}`);
    }
  }
  
  if (missingNodes.length > 0) {
    console.error(`[ServerStartup] ❌ Missing critical nodes: ${missingNodes.join(', ')}`);
  } else {
    console.log('[ServerStartup] ✅ All critical nodes verified in registry');
  }
} catch (error: any) {
  console.error('[ServerStartup] ❌ Failed to initialize node registry:', error.message);
}

import express, { Express, Request, Response } from 'express';
import { networkInterfaces } from 'os';
import { config } from './core/config';
import { corsMiddleware, getAllowedOrigins } from './core/middleware/cors';
import { errorHandler, asyncHandler } from './core/middleware/error-handler';

// Initialize Ollama AI Services
import { ollamaManager } from './services/ai/ollama-manager';
import { modelManager } from './services/ai/model-manager';
import { metricsTracker } from './services/ai/metrics-tracker';

// Import route handlers
import executeWorkflowRoute from './api/execute-workflow';
import webhookTriggerRoute from './api/webhook-trigger';
import chatApiRoute from './api/chat-api';
import adminTemplatesRoute from './api/admin-templates';
import copyTemplateRoute from './api/copy-template';
import formTriggerRoute from './api/form-trigger';
import chatTriggerRoute from './api/chat-trigger';
import generateWorkflowRoute from './api/generate-workflow';
import executeAgentRoute from './api/execute-agent';
import chatbotRoute from './api/chatbot';
import analyzeWorkflowRequirementsRoute from './api/analyze-workflow-requirements';
import processRoute from './api/process';
import executeNodeRoute from './api/execute-node';
import aiGateway from './api/ai-gateway';
import { generateHandler as smartPlannerGenerate, answerHandler as smartPlannerAnswer, getWorkflowHandler as smartPlannerGetWorkflow } from './api/smart-planner';
import * as trainingStats from './api/training-stats';
import getCredentialsRoute from './api/get-credentials';
import attachCredentialsRoute from './api/attach-credentials';
import attachInputsRoute from './api/attach-inputs';
import saveWorkflowRoute from './api/save-workflow';
import { confirmWorkflow, rejectWorkflow } from './api/workflow-confirm';
import { substituteTools, getAvailableSubstitutions } from './api/tool-substitute';
import { serveChatbotPage } from './api/chatbot-page';
import { handleChatbotMessage } from './api/chatbot-message';
import { serveChatbotChat } from './api/chatbot-chat';
import * as nodeContractRoutes from './api/node-contract';
import * as workflowVersioningRoutes from './api/workflow-versioning';
import memoryRoutes from './api/memory';
import distributedExecuteWorkflow, { getExecutionStatus } from './api/distributed-execute-workflow';
import nodeDefinitionsHandler from './api/node-definitions';
import { linkedinStatusHandler, linkedinTestHandler, linkedinRefreshNowHandler, linkedinDisconnectHandler } from './api/connections-linkedin';
import { githubStatusHandler, githubDisconnectHandler } from './api/connections-github';
import { zohoStatusHandler, zohoConnectHandler, zohoTestHandler, zohoDisconnectHandler } from './api/connections-zoho';
import { authStatusHandler } from './api/auth-status';
import saveSocialTokenRoute from './api/save-social-token';
import { notionAuthorizeHandler, notionCallbackHandler } from './api/oauth-notion';
import { twitterAuthorizeHandler, twitterCallbackHandler } from './api/oauth-twitter';



console.log('[ServerStartup] 🔵 Creating Express app...');
const app: Express = express();
console.log('[ServerStartup] ✅ Express app created');

// === ENHANCED LOGGING MIDDLEWARE ===
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const origin = req.headers.origin || 'no-origin';
    const logLevel = config.logLevel || 'INFO';
    
    // Only log in development or if log level allows
    if (!config.isProduction || logLevel === 'DEBUG' || logLevel === 'INFO') {
      if (res.statusCode >= 400) {
        console.error(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms [${origin}]`);
      } else if (logLevel === 'DEBUG' || !config.isProduction) {
        console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms [${origin}]`);
      }
    }
  });
  next();
});

// Middleware
console.log('[ServerStartup] 🔵 Registering middleware...');
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(corsMiddleware);
console.log('[ServerStartup] ✅ Middleware registered');

// Health check with Ollama status
// ✅ CRITICAL: Register health endpoint BEFORE server.listen() to ensure it's available immediately
// ✅ CRITICAL: Make health endpoint minimal and non-blocking for fast startup
console.log('[ServerStartup] 🔵 Registering /health endpoint...');
app.get('/health', asyncHandler(async (req: Request, res: Response) => {
  console.log('[HealthCheck] 🔵 Health check requested');
  
  // ✅ CRITICAL: Return immediately with basic status, don't block on Ollama
  // This ensures health endpoint is always fast and doesn't prevent server startup
  try {
    const ollamaHealth = await Promise.race([
      ollamaManager.healthCheck(),
      new Promise((resolve) => setTimeout(() => resolve({ healthy: false, endpoint: 'timeout' }), 1000))
    ]) as any;
    
    const stats = metricsTracker.getStats();
    
    res.json({
      status: ollamaHealth.healthy ? 'healthy' : 'degraded',
      backend: 'running',
      ollama: ollamaHealth.healthy ? 'connected' : 'disconnected',
      ollamaEndpoint: ollamaHealth.endpoint,
      models: ollamaHealth.models || [],
      aiMetrics: {
        totalRequests: stats.totalRequests,
        successRate: `${stats.successRate.toFixed(1)}%`,
        averageResponseTime: `${stats.averageResponseTime.toFixed(0)}ms`,
      },
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      port: config.port,
      endpoints: [
        '/api/execute-workflow',
        '/api/webhook-trigger',
        '/api/chat-api',
        '/api/form-trigger',
        '/api/generate-workflow',
        '/api/execute-agent',
        '/api/chatbot',
        '/api/analyze-workflow-requirements',
        '/api/ai/generate',
        '/api/ai/chat',
        '/api/ai/analyze-image',
        '/api/ai/models',
        '/api/ai/metrics',
        '/api/training/stats',
        '/api/training/categories',
        '/api/training/workflows',
        '/api/training/similar',
        '/api/training/examples',
        '/process',
        '/execute-node',
        '/api/execute-node',
        '/api/admin-templates',
        '/api/copy-template',
      ],
    });
  } catch (error) {
    // ✅ CRITICAL: Health endpoint should never fail - return degraded status
    console.error('[HealthCheck] ⚠️  Health check error (non-fatal):', error);
    res.json({
      status: 'degraded',
      backend: 'running',
      ollama: 'unknown',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      port: config.port,
    });
  }
}));
console.log('[ServerStartup] ✅ /health endpoint registered');

// Connection test endpoint (more detailed than health)
app.get('/api/test-connection', asyncHandler(async (req: Request, res: Response) => {
  const origins = getAllowedOrigins();
  res.json({
    success: true,
    message: 'Backend is running and reachable',
    timestamp: new Date().toISOString(),
    frontendUrl: req.headers.origin || 'unknown',
    backendUrl: `${req.protocol}://${req.get('host')}`,
    environment: process.env.NODE_ENV || 'development',
    port: config.port,
    publicBaseUrl: config.publicBaseUrl,
    corsOrigins: origins,
      endpoints: {
      health: '/health',
      chatbot: '/api/ai/chatbot/message',
      testConnection: '/api/test-connection',
      chatWebSocket: '/api/chat/health',
    },
  });
}));

// WebSocket health check endpoint
app.get('/api/chat/health', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { getChatServer } = require('./services/chat/chat-server');
    const chatServer = getChatServer();
    const activeSessions = chatServer.getActiveSessions();
    
    res.json({
      status: 'ok',
      websocket: {
        initialized: true,
        path: '/ws/chat',
        activeSessions: activeSessions.length,
        sessions: activeSessions,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      error: error?.message || 'Unknown error',
      websocket: {
        initialized: false,
      },
      timestamp: new Date().toISOString(),
    });
  }
}));

// API Routes
console.log('[ServerStartup] 🔵 Registering /api/execute-workflow endpoint...');
app.post('/api/execute-workflow', asyncHandler(executeWorkflowRoute));

// 🆕 Execution Queue API
app.get('/api/execution-queue/stats', asyncHandler(async (req: Request, res: Response) => {
  const { getExecutionQueue } = await import('./services/execution-queue');
  const queue = await getExecutionQueue();
  const stats = await queue.getStats();
  res.json(stats);
}));

app.get('/api/execution-queue/job/:jobId', asyncHandler(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const { getExecutionQueue } = await import('./services/execution-queue');
  const queue = await getExecutionQueue();
  const job = await queue.getJobStatus(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json(job);
}));

app.post('/api/execution-queue/job/:jobId/cancel', asyncHandler(async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const { getExecutionQueue } = await import('./services/execution-queue');
  const queue = await getExecutionQueue();
  const cancelled = await queue.cancelJob(jobId);
  
  if (!cancelled) {
    return res.status(400).json({ error: 'Job cannot be cancelled' });
  }
  
  res.json({ success: true, message: 'Job cancelled' });
}));

// 🆕 Workflow Logger API
app.get('/api/workflow-logs/:executionId', asyncHandler(async (req: Request, res: Response) => {
  const { executionId } = req.params;
  const { getWorkflowLogger } = await import('./services/workflow-logger');
  const logger = getWorkflowLogger();
  const logs = logger.getLogs(executionId);
  res.json({ executionId, logs, count: logs.length });
}));

app.get('/api/workflow-logs/workflow/:workflowId', asyncHandler(async (req: Request, res: Response) => {
  const { workflowId } = req.params;
  const { getWorkflowLogger } = await import('./services/workflow-logger');
  const logger = getWorkflowLogger();
  const logs = logger.getWorkflowLogs(workflowId);
  res.json({ workflowId, logs, count: logs.length });
}));

app.get('/api/workflow-logs/correlation/:correlationId', asyncHandler(async (req: Request, res: Response) => {
  const { correlationId } = req.params;
  const { getWorkflowLogger } = await import('./services/workflow-logger');
  const logger = getWorkflowLogger();
  const logs = logger.getLogsByCorrelationId(correlationId);
  res.json({ correlationId, logs, count: logs.length });
}));

// 🆕 Credential Vault API
app.post('/api/credentials/store', asyncHandler(async (req: Request, res: Response) => {
  const { userId, workflowId, key, value, type, metadata } = req.body;
  
  if (!userId || !key || !value || !type) {
    return res.status(400).json({ error: 'userId, key, value, and type are required' });
  }
  
  const { getCredentialVault } = await import('./services/credential-vault');
  const vault = getCredentialVault();
  
  const credential = await vault.store(
    { userId, workflowId },
    key,
    value,
    type,
    metadata
  );
  
  res.json({ success: true, credential: { ...credential, encryptedValue: '[REDACTED]' } });
}));

app.get('/api/credentials/retrieve/:key', asyncHandler(async (req: Request, res: Response) => {
  const { key } = req.params;
  const { userId, workflowId } = req.query;
  
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required and must be a string' });
  }
  
  const { getCredentialVault } = await import('./services/credential-vault');
  const vault = getCredentialVault();
  
  const value = await vault.retrieve(
    { 
      userId, 
      workflowId: (typeof workflowId === 'string' ? workflowId : undefined) 
    },
    key
  );
  
  if (!value) {
    return res.status(404).json({ error: 'Credential not found' });
  }
  
  res.json({ success: true, value: '[REDACTED]' }); // Never return actual value in API
}));

app.get('/api/credentials/list', asyncHandler(async (req: Request, res: Response) => {
  const { userId, workflowId } = req.query;
  
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required and must be a string' });
  }
  
  const { getCredentialVault } = await import('./services/credential-vault');
  const vault = getCredentialVault();
  
  const credentials = await vault.list({
    userId,
    workflowId: (typeof workflowId === 'string' ? workflowId : undefined),
  });
  
  res.json({ success: true, credentials });
}));

app.delete('/api/credentials/:key', asyncHandler(async (req: Request, res: Response) => {
  const { key } = req.params;
  const { userId, workflowId } = req.query;
  
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required and must be a string' });
  }
  
  const { getCredentialVault } = await import('./services/credential-vault');
  const vault = getCredentialVault();
  
  await vault.delete(
    { 
      userId, 
      workflowId: (typeof workflowId === 'string' ? workflowId : undefined) 
    },
    key
  );
  
  res.json({ success: true, message: 'Credential deleted' });
}));

// ✅ Node Definitions API - Backend is source of truth for node schemas
import './nodes/definitions'; // Register all node definitions
app.get('/api/node-definitions', asyncHandler(nodeDefinitionsHandler));

// Distributed Workflow Engine Routes
app.post('/api/distributed-execute-workflow', asyncHandler(distributedExecuteWorkflow));
app.get('/api/execution-status/:executionId', asyncHandler(getExecutionStatus));

// Auth status endpoint
app.get('/api/auth/status', asyncHandler(authStatusHandler));

// Social media token management endpoint
app.post('/api/social-tokens', asyncHandler(saveSocialTokenRoute));

// LinkedIn connection DX/debugging endpoints
app.get('/api/connections/linkedin/status', asyncHandler(linkedinStatusHandler));
app.post('/api/connections/linkedin/test', asyncHandler(linkedinTestHandler));

// GitHub connection endpoints
app.get('/api/connections/github/status', asyncHandler(githubStatusHandler));
app.post('/api/connections/github/disconnect', asyncHandler(githubDisconnectHandler));

// Zoho connection endpoints
app.get('/api/connections/zoho/status', asyncHandler(zohoStatusHandler));
app.post('/api/connections/zoho/connect', asyncHandler(zohoConnectHandler));
app.post('/api/connections/zoho/test', asyncHandler(zohoTestHandler));
app.delete('/api/connections/zoho', asyncHandler(zohoDisconnectHandler));

// Notion OAuth endpoints
app.get('/api/oauth/notion/authorize', asyncHandler(notionAuthorizeHandler));
app.post('/api/oauth/notion/callback', asyncHandler(notionCallbackHandler));

// Twitter OAuth endpoints
app.get('/api/oauth/twitter/authorize', asyncHandler(twitterAuthorizeHandler));
app.post('/api/oauth/twitter/callback', asyncHandler(twitterCallbackHandler));
app.post('/api/connections/linkedin/refresh-now', asyncHandler(linkedinRefreshNowHandler));
app.delete('/api/connections/linkedin', asyncHandler(linkedinDisconnectHandler));

app.post('/api/webhook-trigger/:workflowId', asyncHandler(webhookTriggerRoute));
app.get('/api/webhook-trigger/:workflowId', asyncHandler(webhookTriggerRoute));
app.post('/api/chat-api', asyncHandler(chatApiRoute));

// Admin templates routes (with /api prefix)
app.get('/api/admin-templates', asyncHandler(adminTemplatesRoute));
app.get('/api/admin-templates/:id', asyncHandler(adminTemplatesRoute));
app.post('/api/admin-templates', asyncHandler(adminTemplatesRoute));
app.put('/api/admin-templates/:id', asyncHandler(adminTemplatesRoute));
app.delete('/api/admin-templates/:id', asyncHandler(adminTemplatesRoute));

// Admin templates routes (without /api prefix for frontend compatibility)
app.get('/admin-templates', asyncHandler(adminTemplatesRoute));
app.get('/admin-templates/:id', asyncHandler(adminTemplatesRoute));
app.post('/admin-templates', asyncHandler(adminTemplatesRoute));
app.put('/admin-templates/:id', asyncHandler(adminTemplatesRoute));
app.delete('/admin-templates/:id', asyncHandler(adminTemplatesRoute));
app.patch('/admin-templates/:id', asyncHandler(adminTemplatesRoute));

// Copy template routes
app.post('/api/copy-template', asyncHandler(copyTemplateRoute));
app.post('/copy-template', asyncHandler(copyTemplateRoute));

// Form Trigger Routes - More specific route first
app.get('/api/form-trigger/:workflowId/:nodeId', asyncHandler(formTriggerRoute));
app.post('/api/form-trigger/:workflowId/:nodeId/submit', asyncHandler(formTriggerRoute));

// Chat Trigger Routes
app.get('/api/chat-trigger/:workflowId/:nodeId', asyncHandler(chatTriggerRoute));
app.post('/api/chat-trigger/:workflowId/:nodeId/message', asyncHandler(chatTriggerRoute));

// Workflow Generation
app.post('/api/generate-workflow', asyncHandler(generateWorkflowRoute));

// Smart Planner–Driven Workflow Orchestration (planner decides WHAT, system decides HOW)
app.post('/api/generate', asyncHandler(smartPlannerGenerate));
app.post('/api/answer', asyncHandler(smartPlannerAnswer));
app.get('/api/workflow/:sessionId', asyncHandler(smartPlannerGetWorkflow));

// Agent Routes
app.post('/api/execute-agent', asyncHandler(executeAgentRoute));

// Chatbot
app.post('/api/chatbot', asyncHandler(chatbotRoute));
app.post('/chatbot', asyncHandler(chatbotRoute)); // Alias for frontend compatibility


// Process Route - Direct proxy to FastAPI backend
app.post('/process', asyncHandler(processRoute));

// Workflow Analysis
app.post('/api/analyze-workflow-requirements', asyncHandler(analyzeWorkflowRequirementsRoute));

// Debug Node Execution (for Debug Panel)
app.post('/execute-node', asyncHandler(executeNodeRoute));
app.post('/api/execute-node', asyncHandler(executeNodeRoute)); // Also support /api prefix

// Debug Gmail Send (for testing Gmail credential resolution)
import debugGmailSendRoute from './api/debug/gmail-send';
app.post('/api/debug/gmail-send', asyncHandler(debugGmailSendRoute));
console.log('🧪 Debug Gmail Send API available at /api/debug/gmail-send');

// Get User Credentials
app.get('/api/credentials', asyncHandler(getCredentialsRoute));

// Attach Credentials to Workflow
app.post('/api/workflows/:workflowId/attach-credentials', asyncHandler(attachCredentialsRoute));
console.log('🔐 Attach Credentials API available at /api/workflows/:workflowId/attach-credentials');

// Attach Node Inputs to Workflow
app.post('/api/workflows/:workflowId/attach-inputs', asyncHandler(attachInputsRoute));
console.log('🔧 Attach Inputs API available at /api/workflows/:workflowId/attach-inputs');

// Save Workflow (with validation and normalization)
app.post('/api/save-workflow', asyncHandler(saveWorkflowRoute));
console.log('💾 Save Workflow API available at /api/save-workflow');

// Workflow Confirmation API
app.post('/api/workflow/confirm', asyncHandler(confirmWorkflow));
app.post('/api/workflow/reject', asyncHandler(rejectWorkflow));
console.log('✅ Workflow Confirmation API available at /api/workflow/confirm and /api/workflow/reject');

// Tool Substitution API
app.post('/api/workflow/tool-substitute', asyncHandler(substituteTools));
app.get('/api/workflow/tool-substitute/available/:nodeId', asyncHandler(getAvailableSubstitutions));
console.log('🔧 Tool Substitution API available at /api/workflow/tool-substitute');

// Node Contract API (Canonical Node Library)
app.get('/api/node-contract', asyncHandler(nodeContractRoutes.getNodeContract));
app.get('/api/node-contract/version', asyncHandler(nodeContractRoutes.getNodeContractVersion));
app.get('/api/node-contract/patterns', asyncHandler(nodeContractRoutes.getNodeContractPatterns));
app.get('/api/node-contract/:nodeType', asyncHandler(nodeContractRoutes.getNodeContractByType));
console.log('📚 Node Contract API available at /api/node-contract/*');

// Workflow Versioning API
app.post('/api/workflow/version', asyncHandler(workflowVersioningRoutes.versionWorkflow));
app.get('/api/workflow/version/:versionId', asyncHandler(workflowVersioningRoutes.getVersion));
app.get('/api/workflow/version/:versionId/metadata', asyncHandler(workflowVersioningRoutes.getVersionMetadata));
app.post('/api/workflow/version/diff', asyncHandler(workflowVersioningRoutes.diffVersions));
app.get('/api/workflow/versions', asyncHandler(workflowVersioningRoutes.listVersions));

// 🆕 Enhanced Workflow Versioning API
app.get('/api/workflows/:workflowId/versions', asyncHandler(async (req: Request, res: Response) => {
  const { workflowId } = req.params;
  const { limit } = req.query;
  
  const { getWorkflowVersionManager } = await import('./services/workflow-versioning');
  const versionManager = getWorkflowVersionManager();
  
  const versions = await versionManager.getVersionHistory(
    workflowId,
    limit ? parseInt(limit as string, 10) : 50
  );
  
  res.json({ workflowId, versions, count: versions.length });
}));

app.get('/api/workflows/:workflowId/versions/current', asyncHandler(async (req: Request, res: Response) => {
  const { workflowId } = req.params;
  
  const { getWorkflowVersionManager } = await import('./services/workflow-versioning');
  const versionManager = getWorkflowVersionManager();
  
  const version = await versionManager.getCurrentVersion(workflowId);
  
  if (!version) {
    return res.status(404).json({ error: 'No versions found for this workflow' });
  }
  
  res.json({ workflowId, version });
}));

app.get('/api/workflows/:workflowId/versions/:version', asyncHandler(async (req: Request, res: Response) => {
  const { workflowId, version } = req.params;
  
  const { getWorkflowVersionManager } = await import('./services/workflow-versioning');
  const versionManager = getWorkflowVersionManager();
  
  const versionData = await versionManager.getVersion(workflowId, parseInt(version, 10));
  
  if (!versionData) {
    return res.status(404).json({ error: 'Version not found' });
  }
  
  res.json({ workflowId, version: versionData });
}));

app.post('/api/workflows/:workflowId/versions/:version/rollback', asyncHandler(async (req: Request, res: Response) => {
  const { workflowId, version } = req.params;
  
  // Extract user ID from auth header
  let userId: string | undefined;
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      const { getSupabaseClient } = await import('./core/database/supabase-compat');
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }
  } catch (authError) {
    // Non-critical
  }
  
  const { getWorkflowVersionManager } = await import('./services/workflow-versioning');
  const versionManager = getWorkflowVersionManager();
  
  const result = await versionManager.rollbackToVersion(
    workflowId,
    parseInt(version, 10),
    userId
  );
  
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  
  res.json({ success: true, newVersion: result.newVersion });
}));

app.get('/api/workflows/:workflowId/versions/compare', asyncHandler(async (req: Request, res: Response) => {
  const { workflowId } = req.params;
  const { fromVersion, toVersion } = req.query;
  
  if (!fromVersion || !toVersion) {
    return res.status(400).json({ error: 'fromVersion and toVersion are required' });
  }
  
  const { getWorkflowVersionManager } = await import('./services/workflow-versioning');
  const versionManager = getWorkflowVersionManager();
  
  const comparison = await versionManager.compareVersions(
    workflowId,
    parseInt(fromVersion as string, 10),
    parseInt(toVersion as string, 10)
  );
  
  if (!comparison) {
    return res.status(404).json({ error: 'One or both versions not found' });
  }
  
  res.json({ workflowId, comparison });
}));

app.get('/api/workflows/:workflowId/versions/compatibility', asyncHandler(async (req: Request, res: Response) => {
  const { workflowId } = req.params;
  
  const { getWorkflowVersionManager } = await import('./services/workflow-versioning');
  const versionManager = getWorkflowVersionManager();
  
  const compatibility = await versionManager.checkExecutionCompatibility(workflowId);
  
  res.json({ workflowId, compatibility });
}));

console.log('📦 Workflow Versioning API available at /api/workflow/version/* and /api/workflows/:id/versions/*');

// Memory System API
app.use('/api/memory', memoryRoutes);
app.use('/api/analyze', memoryRoutes); // Also mount analyze endpoints
app.use('/api/execute', memoryRoutes); // Also mount execution endpoints
console.log('🧠 Memory System API available at /api/memory/*, /api/analyze/*, /api/execute/*');

// Chatbot Page Routes
app.get('/workflows/:workflowId/page', asyncHandler(serveChatbotPage));
app.get('/workflows/:workflowId/embed', asyncHandler(serveChatbotPage)); // Embed mode
app.get('/workflows/:workflowId/chat', asyncHandler(serveChatbotChat)); // N8N-style chat UI
app.post('/api/chatbot/:workflowId/message', asyncHandler(handleChatbotMessage));
console.log('💬 Chatbot page routes available at /workflows/:workflowId/page, /workflows/:workflowId/embed, /workflows/:workflowId/chat and /api/chatbot/:workflowId/message');

// AI Gateway - Unified AI Services
app.use('/api/ai', aiGateway);
console.log('🤖 AI Gateway available at /api/ai');

// Training Statistics API
app.get('/api/training/stats', asyncHandler(trainingStats.getTrainingStats));
app.get('/api/training/categories', asyncHandler(trainingStats.getTrainingCategories));
app.get('/api/training/workflows', asyncHandler(trainingStats.getTrainingWorkflows));
app.post('/api/training/similar', asyncHandler(trainingStats.findSimilarWorkflows));
app.get('/api/training/examples', asyncHandler(trainingStats.getTrainingExamples));
app.get('/api/training/usage', asyncHandler(trainingStats.getTrainingUsage));
app.post('/api/training/reload', asyncHandler(trainingStats.reloadTrainingDataset));
console.log('📚 Training API available at /api/training/*');

// AI Endpoints (Ollama-First)
app.post('/api/ai/generate', asyncHandler(async (req: Request, res: Response) => {
  const { prompt, model, system, temperature, max_tokens } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ success: false, error: 'Prompt is required' });
  }

  const result = await ollamaManager.generate(prompt, {
    model,
    system,
    temperature,
    max_tokens,
    stream: false,
  });

  res.json({ success: true, result });
}));

app.post('/api/ai/chat', asyncHandler(async (req: Request, res: Response) => {
  const { messages, model, temperature } = req.body;
  
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ success: false, error: 'Messages array is required' });
  }

  const result = await ollamaManager.chat(messages, {
    model,
    temperature,
    stream: false,
  });

  res.json({ success: true, result });
}));

app.post('/api/ai/analyze-image', asyncHandler(async (req: Request, res: Response) => {
  // Multimodal functionality has been removed
  res.status(501).json({ 
    success: false, 
    error: 'Image analysis functionality has been removed. Multimodal features are no longer supported.' 
  });
}));

app.get('/api/ai/models', asyncHandler(async (req: Request, res: Response) => {
  const models = await ollamaManager.getAvailableModels();
  const stats = modelManager.getUsageStats();
  
  res.json({
    success: true,
    models,
    recommended: modelManager.getRecommendedModels(),
    usageStats: stats,
  });
}));

app.get('/api/ai/metrics', asyncHandler(async (req: Request, res: Response) => {
  const stats = metricsTracker.getStats();
  res.json({ success: true, metrics: stats });
}));

// Error handler (must be last)
app.use(errorHandler);

// === NETWORK INTERFACE DISCOVERY ===
function getNetworkAddresses(port: number): string[] {
  const interfaces = networkInterfaces();
  const addresses: string[] = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(`http://${iface.address}:${port}`);
      }
    }
  }
  
  return addresses;
}

// === ENHANCED ERROR HANDLING ===
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  // Don't exit, try to keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize Ollama and start server
async function startServer() {
  // Check and apply database migrations on startup
  try {
    const { checkAllMigrations } = await import('./core/database/migration-checker');
    const migrationResults = await checkAllMigrations();
    
    for (const result of migrationResults) {
      if (result.applied) {
        console.log(`✅ [Migration] ${result.message}`);
      } else if (result.error) {
        console.warn(`⚠️  [Migration] ${result.message}: ${result.error}`);
      } else {
        console.log(`ℹ️  [Migration] ${result.message}`);
      }
    }
  } catch (error) {
    console.warn('[Migration] Failed to check migrations:', error);
    // Don't fail startup if migration check fails
  }
  console.log('[ServerStartup] 🔵 Starting server initialization...');
  
  try {
    // Initialize Ollama Manager
    console.log('[ServerStartup] 🤖 Initializing Ollama AI services...');
    await ollamaManager.initialize();
    
    // Initialize Model Manager
    await modelManager.initialize();
    
    console.log('[ServerStartup] ✅ Ollama AI services initialized');
    console.log(`[ServerStartup] 📦 Recommended models: ${modelManager.getRecommendedModels().join(', ')}`);
  } catch (error) {
    console.error('[ServerStartup] ⚠️  Ollama initialization failed:', error);
    console.log('[ServerStartup] ⚠️  Server will start but AI features may be unavailable');
    console.log('[ServerStartup] 💡 Make sure Ollama is running at:', config.ollamaHost);
  }

  // Start server
  const PORT = config.port;
  console.log(`[ServerStartup] 🔵 About to bind to port ${PORT}...`);
  
  try {
    console.log(`[ServerStartup] 🔵 Calling app.listen(${PORT}, '0.0.0.0')...`);
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[ServerStartup] ✅ app.listen() callback fired - server is listening on port ${PORT}`);
      // Initialize WebSocket server for real-time visualization
      try {
        const { getExecutionStateManager } = require('./services/workflow-executor/execution-state-manager');
        const { VisualizationService } = require('./services/workflow-executor/visualization-service');
        
        const stateManager = getExecutionStateManager();
        const visualizationService = new VisualizationService(stateManager);
        visualizationService.initialize(server);
        
        console.log('📡 WebSocket server initialized for real-time execution visualization');
        console.log(`   WebSocket endpoint: ws://localhost:${PORT}/ws/executions`);
      } catch (wsError: any) {
        console.warn('⚠️  WebSocket initialization failed:', wsError?.message || wsError);
        console.log('⚠️  Real-time visualization may be unavailable');
        console.log('💡 Make sure "ws" package is installed: npm install ws');
      }

      // Initialize Chat Server for chat trigger
      try {
        const { getChatServer } = require('./services/chat/chat-server');
        const chatServer = getChatServer();
        chatServer.initialize(server);
        
        console.log('💬 Chat WebSocket server initialized');
        console.log(`   Chat WebSocket endpoint: ws://localhost:${PORT}/ws/chat`);
        console.log('   ✅ Manual upgrade handling enabled');
      } catch (chatError: any) {
        console.warn('⚠️  Chat WebSocket initialization failed:', chatError?.message || chatError);
        console.log('⚠️  Chat trigger functionality may be unavailable');
      }
      const networkAddresses = getNetworkAddresses(PORT);
      
      console.log('\n' + '='.repeat(60));
      console.log('🚀 CtrlChecks Worker Backend');
      console.log('='.repeat(60));
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
      
      console.log('\n🌐 Available URLs:');
      if (!config.isProduction) {
        console.log(`   Local:    http://localhost:${PORT}`);
        console.log(`   Network:  http://127.0.0.1:${PORT}`);
      } else {
        console.log(`   Server:   ${config.publicBaseUrl || `http://localhost:${PORT}`}`);
      }
      if (networkAddresses.length > 0) {
        networkAddresses.forEach(addr => console.log(`   Network:  ${addr}`));
      }
      
      console.log('\n🛣️  API Endpoints:');
      if (!config.isProduction) {
        console.log(`   Health:   http://localhost:${PORT}/health`);
        console.log(`   Test:     http://localhost:${PORT}/api/test-connection`);
        console.log(`   Execute:  http://localhost:${PORT}/api/execute-workflow`);
        console.log(`   Chatbot:  http://localhost:${PORT}/api/chatbot`);
      }
      
      console.log('\n🔗 CORS Configuration:');
      if (!config.isProduction) {
        console.log(`   Allowed origins: http://localhost:5173, http://localhost:8080, http://127.0.0.1:5173`);
      } else {
        const origins = getAllowedOrigins();
        console.log(`   Allowed origins: ${origins.length > 0 ? origins.join(', ') : 'None configured!'}`);
      }
      if (config.corsOrigin) {
        console.log(`   Custom origin: ${config.corsOrigin}`);
      }
      
      console.log(`\n🤖 Ollama endpoint: ${config.ollamaHost}`);
      
      console.log('\n📋 All Available Endpoints:');
      console.log(`  POST /api/execute-workflow`);
      console.log(`  POST /api/distributed-execute-workflow - Distributed workflow engine`);
      console.log(`  GET  /api/execution-status/:executionId - Get execution status`);
      console.log(`  POST /api/webhook-trigger/:workflowId`);
      console.log(`  POST /api/chat-api`);
      console.log(`  GET  /api/form-trigger/:workflowId/:nodeId`);
      console.log(`  POST /api/form-trigger/:workflowId/:nodeId/submit`);
      console.log(`  POST /api/generate-workflow`);
      console.log(`  POST /api/execute-agent`);
      console.log(`  POST /api/chatbot`);
      console.log(`  POST /chatbot`);
      console.log(`  POST /api/analyze-workflow-requirements`);
      console.log(`  POST /process - Proxy to FastAPI backend`);
      console.log(`  POST /execute-node - Debug single node execution`);
      console.log(`  POST /api/execute-node - Debug single node execution`);
      console.log(`  GET  /api/admin-templates`);
      console.log(`  POST /api/copy-template`);
      console.log(`  POST /api/ai/generate - Text generation`);
      console.log(`  POST /api/ai/chat - Chat completion`);
      console.log(`  POST /api/ai/analyze-image - Image analysis`);
      console.log(`  GET  /api/ai/models - List available models`);
      console.log(`  GET  /api/ai/metrics - AI performance metrics`);
      console.log(`\n📚 Training API Endpoints:`);
      console.log(`  GET  /api/training/stats - Training dataset statistics`);
      console.log(`  GET  /api/training/categories - Available workflow categories`);
      console.log(`  GET  /api/training/workflows - Get workflows by category`);
      console.log(`  POST /api/training/similar - Find similar workflows`);
      console.log(`  GET  /api/training/examples - Get training examples for few-shot learning`);
      console.log(`  GET  /api/training/usage - Get training usage metrics`);
      console.log(`  POST /api/training/reload - Reload training dataset (hot reload)`);
      console.log(`\n🤖 AI Gateway Endpoints:`);
      console.log(`  POST /api/ai/chatbot/message - Chichu chatbot`);
      console.log(`  POST /api/ai/editor/suggest-improvements - Workflow node suggestions`);
      console.log(`  POST /api/ai/builder/generate-from-prompt - Generate workflow from prompt`);
      console.log(`  POST /api/ai/ollama/generate - Direct Ollama generation`);
      console.log(`  GET  /api/ai/metrics - Performance metrics`);
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ Backend ready to accept connections!');
      console.log('='.repeat(60) + '\n');
      
      // Start scheduler service
      if (process.env.ENABLE_SCHEDULER !== 'false') {
        console.log('[ServerStartup] 🔵 Starting scheduler services...');
        // ✅ CRITICAL: Start timeout watchdog for stuck runs
        import('./services/execution/timeout-watchdog').then(({ startTimeoutWatchdog }) => {
          console.log('[ServerStartup] 🔵 Timeout watchdog module loaded, starting...');
          startTimeoutWatchdog(5 * 60 * 1000); // Check every 5 minutes
          console.log('[ServerStartup] ✅ Timeout watchdog started (checks every 5 minutes)');
        }).catch(err => {
          console.error('[ServerStartup] ⚠️  Failed to start timeout watchdog:', err);
          console.error('[ServerStartup] ⚠️  Error details:', err?.stack || err);
        });

        import('./services/scheduler').then(({ schedulerService }) => {
          console.log('[ServerStartup] 🔵 Scheduler module loaded, starting...');
          schedulerService.start().catch((err: any) => {
            console.error('[ServerStartup] ⚠️  Scheduler start failed:', err);
          });
        }).catch(err => {
          console.error('[ServerStartup] ⚠️  Failed to load scheduler module:', err);
          console.error('[ServerStartup] ⚠️  Error details:', err?.stack || err);
        });
      } else {
        console.log('[ServerStartup] ⏭️  Scheduler services disabled (ENABLE_SCHEDULER=false)');
      }
    });
    
    // Handle server errors
    server.on('error', (error: any) => {
      console.error('[ServerStartup] ❌ Server error event fired:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`[ServerStartup] ❌ Port ${PORT} is already in use.`);
        console.error('[ServerStartup]    Try one of these solutions:');
        console.error(`[ServerStartup]    Windows: netstat -ano | findstr :${PORT}`);
        console.error(`[ServerStartup]    Then: taskkill /PID <PID> /F`);
        console.error(`[ServerStartup]    Or change PORT in .env file`);
      } else {
        console.error('[ServerStartup] ❌ Server error:', error);
        console.error('[ServerStartup] ❌ Error code:', error.code);
        console.error('[ServerStartup] ❌ Error message:', error.message);
        console.error('[ServerStartup] ❌ Error stack:', error.stack);
      }
      process.exit(1);
    });
    
    console.log(`[ServerStartup] ✅ Server object created, listening should start soon...`);
    
  } catch (error) {
    console.error('[ServerStartup] 💥 Failed to start server (caught in try block):', error);
    console.error('[ServerStartup] 💥 Error details:', error instanceof Error ? error.stack : String(error));
    process.exit(1);
  }
}

// Start the server
console.log('[ServerStartup] 🔵 Calling startServer()...');
startServer().catch((error) => {
  console.error('[ServerStartup] ❌ Failed to start server (caught in catch):', error);
  console.error('[ServerStartup] ❌ Error details:', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});

export default app;
