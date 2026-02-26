// Generate Workflow Route
// Migrated from Supabase Edge Function
// Handles workflow generation and analysis

import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { agenticWorkflowBuilder } from '../services/ai/workflow-builder';
import { workflowAnalyzer } from '../services/ai/workflow-analyzer';
import { enhancedWorkflowAnalyzer } from '../services/ai/enhanced-workflow-analyzer';
import { requirementsExtractor } from '../services/ai/requirements-extractor';
import { workflowValidator, ValidationResult } from '../services/ai/workflow-validator';
import { ExtractedRequirements } from '../services/ai/requirements-extractor';
import { chatbotPageGenerator } from '../services/chatbot-page-generator';
import { RobustEdgeGenerator } from '../services/ai/robust-edge-generator';
import { nodeLibrary } from '../services/nodes/node-library';
import { WorkflowNode } from '../core/types/ai-types';
import { config } from '../core/config';
import { normalizeNodeType } from '../core/utils/node-type-normalizer';
import { getMemoryManager, getReferenceBuilder } from '../memory';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { ComprehensiveCredentialScanner } from '../services/ai/comprehensive-credential-scanner';
import { CredentialResolver } from '../services/ai/credential-resolver';
import { workflowLifecycleManager } from '../services/workflow-lifecycle-manager';
import { generateComprehensiveNodeQuestions } from '../services/ai/comprehensive-node-questions-generator';

/**
 * Identify required credentials from requirements and answers
 * This is used in the refine step to determine which credentials will be needed
 */
function identifyRequiredCredentialsFromRequirements(
  requirements: ExtractedRequirements,
  userPrompt: string,
  answers?: Record<string, string>
): string[] {
  let credentials: string[] = [];
  const promptLower = userPrompt.toLowerCase();
  // Properly serialize answer values to avoid [object object]
  const answerValues = answers ? Object.values(answers).map(v => {
    if (typeof v === 'object' && v !== null) {
      return JSON.stringify(v).toLowerCase();
    }
    return String(v).toLowerCase();
  }) : [];
  const answerTexts = answers ? Object.values(answers).map(v => {
    if (typeof v === 'object' && v !== null) {
      return JSON.stringify(v);
    }
    return String(v);
  }).join(' ').toLowerCase() : '';
  
  console.log('🔍 [Backend] Identifying credentials:', { 
    promptLower: promptLower.substring(0, 100), 
    answerValues: answerValues.slice(0, 5), // Limit to first 5 to avoid huge logs
    answerTexts: answerTexts.substring(0, 200) 
  });
  
  // Check if AI Agent/LLM functionality is needed
  const hasAIFunctionality = 
    promptLower.includes('ai agent') ||
    promptLower.includes('ai assistant') ||
    promptLower.includes('chatbot') ||
    promptLower.includes('chat bot') ||
    promptLower.includes('llm') ||
    promptLower.includes('language model') ||
    promptLower.includes('generate') ||
    promptLower.includes('analyze') ||
    promptLower.includes('summarize') ||
    promptLower.includes('classify') ||
    promptLower.includes('sentiment') ||
    promptLower.includes('intent') ||
    promptLower.includes('natural language') ||
    promptLower.includes('nlp') ||
    promptLower.includes('text analysis') ||
    promptLower.includes('content generation') ||
    promptLower.includes('ai-powered') ||
    promptLower.includes('ai powered') ||
    promptLower.includes('using ai') ||
    promptLower.includes('with ai') ||
    promptLower.includes('ai model') ||
    answerTexts.includes('ai agent') ||
    answerTexts.includes('ai assistant') ||
    answerTexts.includes('chatbot') ||
    answerTexts.includes('ai-generated') ||
    answerTexts.includes('ai generated') ||
    answerTexts.includes('ai-generated content') ||
    answerTexts.includes('ai content') ||
    answerValues.some(v => v.includes('ai-generated') || v.includes('ai generated'));
  
  console.log('🤖 [Backend] AI Functionality detected:', hasAIFunctionality);
  
  // REMOVED: All external AI provider detection - we only use Ollama
  // AI functionality uses Ollama - no API keys needed
  if (hasAIFunctionality) {
    console.log('✅ [Backend] AI functionality detected - using Ollama (no API key required)');
  }
  
  // Normalize credential names to avoid duplicates (e.g., SLACK_TOKEN vs SLACK_BOT_TOKEN)
  const normalizeCredentialName = (name: string): string => {
    const upper = name.toUpperCase();
    // Normalize Slack token variations to SLACK_BOT_TOKEN
    if (upper.includes('SLACK') && upper.includes('TOKEN') && !upper.includes('WEBHOOK')) {
      return 'SLACK_BOT_TOKEN';
    }
    // Normalize Slack webhook variations
    if (upper.includes('SLACK') && upper.includes('WEBHOOK')) {
      return 'SLACK_WEBHOOK_URL';
    }
    return upper;
  };
  
  // CRITICAL FIX: Only extract credentials that are explicitly mentioned in requirements
  // Don't add credentials that are just guessed or inferred
  // Check requirements.credentials array
  if (requirements.credentials && Array.isArray(requirements.credentials)) {
    requirements.credentials.forEach((cred: any) => {
      const credName = typeof cred === 'string' ? cred : (cred.name || cred.type || '');
      if (credName) {
        const credUpper = credName.toUpperCase();
        // Only add if it's a specific, known credential type (not generic)
        const isSpecificCredential = 
          credUpper.includes('API_KEY') || 
          credUpper.includes('TOKEN') || 
          credUpper.includes('SECRET') ||
          credUpper.includes('CREDENTIAL');
        
        if (isSpecificCredential) {
          const normalized = normalizeCredentialName(credName);
          // Check if normalized version already exists
          if (!credentials.some(c => normalizeCredentialName(c) === normalized)) {
            credentials.push(normalized);
          }
        }
      }
    });
  }
  
  // CRITICAL FIX: Only add API credentials if the API is explicitly mentioned
  // Check requirements.apis array - but only for APIs that are actually selected/mentioned
  if (requirements.apis && Array.isArray(requirements.apis)) {
    requirements.apis.forEach((api: any) => {
      const apiName = typeof api === 'string' ? api : (api.name || api.endpoint || '');
      const apiLower = apiName.toLowerCase();
      
      // REMOVED: All external AI API credential detection - we only use Ollama
      // Ollama doesn't require API keys, so we skip AI API credential detection
      // Only add credentials if the API is explicitly mentioned in the prompt or answers
      const isExplicitlyMentioned = 
        promptLower.includes(apiLower.split(' ')[0]) || // Check if first word of API name is in prompt
        answerTexts.includes(apiLower.split(' ')[0]) ||
        answerValues.some(v => v.includes(apiLower.split(' ')[0]));
      
      if (isExplicitlyMentioned && (apiLower.includes('openai') || apiLower.includes('gpt') || apiLower.includes('claude') || apiLower.includes('anthropic') || apiLower.includes('gemini'))) {
        console.log(`✅ [Backend] AI API ${apiName} detected - using Ollama instead (no API key required)`);
      }
      // Google Sheets/Gmail APIs don't require Gemini API Key - they use OAuth
    });
  }
  
  // Check for platforms that might need credentials
  // CRITICAL FIX: Only add credentials if the platform is EXPLICITLY mentioned in the prompt or answers
  if (requirements.platforms && Array.isArray(requirements.platforms)) {
    requirements.platforms.forEach((platform: any) => {
      const platformName = typeof platform === 'string' ? platform : (platform.name || platform.type || '');
      const platformLower = platformName.toLowerCase();
      
      // Only add Slack credentials if Slack is explicitly mentioned as a service/platform
      // Check if Slack is actually mentioned in the prompt or answers (not just inferred)
      if (platformLower.includes('slack')) {
        const slackMentioned = 
          promptLower.includes('slack') || 
          answerTexts.includes('slack') ||
          answerValues.some(v => v.includes('slack'));
        
        // Additional check: ensure it's not just a false positive (e.g., "slack off", "slack time")
        const explicitSlackPatterns = [
          'slack integration', 'slack bot', 'slack channel', 'slack notification',
          'slack message', 'send to slack', 'post to slack', 'slack api',
          'slack service', 'use slack', 'slack platform', 'slack workflow'
        ];
        const isExplicitSlack = explicitSlackPatterns.some(pattern => 
          promptLower.includes(pattern) || answerTexts.includes(pattern)
        );
        
        if (slackMentioned && isExplicitSlack && !credentials.includes('SLACK_WEBHOOK_URL')) {
          credentials.push('SLACK_WEBHOOK_URL');
        }
      } else if (platformLower.includes('discord')) {
        const discordMentioned = 
          promptLower.includes('discord') || 
          answerTexts.includes('discord') ||
          answerValues.some(v => v.includes('discord'));
        
        if (discordMentioned && !credentials.includes('DISCORD_WEBHOOK_URL')) {
          credentials.push('DISCORD_WEBHOOK_URL');
        }
      } else if (platformLower.includes('google') && (platformLower.includes('sheet') || platformLower.includes('gmail') || platformLower.includes('drive'))) {
        // Google OAuth is handled via navbar credentials button - already integrated with Supabase
        // if (!credentials.includes('GOOGLE_OAUTH_CLIENT_ID')) credentials.push('GOOGLE_OAUTH_CLIENT_ID');
        // if (!credentials.includes('GOOGLE_OAUTH_CLIENT_SECRET')) credentials.push('GOOGLE_OAUTH_CLIENT_SECRET');
      }
      // Google services (Sheets, Gmail, Drive) are pre-connected via OAuth
      // Do NOT ask for Google OAuth credentials - they are already configured
      // For Gmail, only ask for sender account selection (handled in UI, not as credential)
    });
  }
  
  // CRITICAL FIX: Filter out false positives for chatbot workflows
  // If this is a chatbot workflow and Slack wasn't explicitly mentioned, remove Slack credentials
  const isChatbotWorkflow = 
    promptLower.includes('chatbot') ||
    promptLower.includes('chat bot') ||
    promptLower.includes('ai assistant') ||
    answerTexts.includes('chatbot') ||
    answerTexts.includes('chat bot') ||
    answerValues.some(v => v.includes('chatbot') || v.includes('chat bot'));
  
  if (isChatbotWorkflow) {
    // Only keep Slack credentials if Slack was explicitly mentioned as a service
    const explicitSlackMention = 
      promptLower.includes('slack integration') ||
      promptLower.includes('slack bot') ||
      promptLower.includes('slack channel') ||
      promptLower.includes('slack notification') ||
      promptLower.includes('send to slack') ||
      promptLower.includes('post to slack') ||
      answerTexts.includes('slack integration') ||
      answerTexts.includes('slack bot') ||
      answerTexts.includes('slack channel') ||
      answerValues.some(v => 
        v.includes('slack integration') || 
        v.includes('slack bot') || 
        v.includes('slack channel')
      );
    
    if (!explicitSlackMention) {
      // Remove Slack credentials if not explicitly mentioned
      credentials = credentials.filter(cred => 
        !cred.includes('SLACK') && !cred.includes('slack')
      );
    } else {
      // If Slack is explicitly mentioned, ensure we're asking for webhook URL, not token
      credentials = credentials.filter(cred => 
        cred !== 'SLACK_TOKEN' && cred !== 'SLACK_BOT_TOKEN'
      );
      if (!credentials.includes('SLACK_WEBHOOK_URL')) {
        credentials.push('SLACK_WEBHOOK_URL');
      }
    }
  }
  
  // CRITICAL: Filter out credentials that are handled via OAuth/UI buttons
  // Google OAuth is handled via navbar credentials button - don't ask for API credentials
  credentials = credentials.filter(cred => {
    const credUpper = cred.toUpperCase();
    // Remove Google API credentials (OAuth is handled via button)
    if (credUpper.includes('GOOGLE') && (credUpper.includes('API') || credUpper.includes('CREDENTIAL') || credUpper.includes('OAUTH'))) {
      return false;
    }
    // Remove SLACK_BOT_TOKEN (we only need SLACK_WEBHOOK_URL)
    if (credUpper === 'SLACK_BOT_TOKEN' || credUpper === 'SLACK_TOKEN') {
      return false;
    }
    return true;
  });
  
  // Final deduplication with normalization
  const normalizedCreds = new Map<string, string>();
  credentials.forEach(cred => {
    const normalized = normalizeCredentialName(cred);
    if (!normalizedCreds.has(normalized)) {
      normalizedCreds.set(normalized, normalized); // Use normalized name
    }
  });
  
  const finalCredentials = Array.from(normalizedCreds.values());
  console.log('🎯 [Backend] Final identified credentials (deduplicated & normalized):', finalCredentials);
  return finalCredentials;
}

/**
 * Generate chatbot workflow without LLM (fallback when Ollama is unavailable)
 */
async function generateChatbotWorkflowFallback(prompt: string): Promise<{
  workflow: { nodes: any[]; edges: any[] };
  documentation: string;
  suggestions: any[];
  estimatedComplexity: string;
  requirements?: any;
  requiredCredentials?: string[];
}> {
  console.log('🤖 [Fallback] Generating chatbot workflow without LLM');
  
  // Generate simple chatbot workflow: chat_trigger -> ai_agent
  const nodeId1 = `chat_trigger_${Date.now()}`;
  const nodeId2 = `ai_agent_${Date.now()}`;
  
  // Use proper node types (not 'custom') and correct configurations based on node library schemas
  const nodes = [
    {
      id: nodeId1,
      type: 'chat_trigger', // Use actual node type, not 'custom'
      data: {
        type: 'chat_trigger',
        label: 'Chat Trigger',
        category: 'triggers',
        config: {
          // chat_trigger has no required fields, message is optional
          message: '{{inputData}}', // Use expression to get input data
        },
      },
      position: { x: 250, y: 100 },
    },
    {
      id: nodeId2,
      type: 'ai_agent', // Use actual node type, not 'custom'
      data: {
        type: 'ai_agent',
        label: 'AI Agent',
        category: 'ai',
        config: {
          // ai_agent requires: userInput, chat_model
          // userInput will receive the 'message' field from chat_trigger via the edge connection
          userInput: '{{message}}', // Get message from chat trigger output
          chat_model: {
            model: 'llama3.1:8b',
            temperature: 0.7,
            systemPrompt: 'You are a helpful and friendly chatbot assistant. Your role is to have natural conversations with users.\n\n' +
              'CRITICAL RULES:\n' +
              '1. When a user sends you a message, respond DIRECTLY to that message in a conversational way.\n' +
              '2. Do NOT explain how workflows work, do NOT describe workflow structures, and do NOT provide technical explanations about automation.\n' +
              '3. Keep responses concise, friendly, and helpful.\n' +
              '4. If you don\'t know something, admit it honestly.',
          },
        },
      },
      position: { x: 500, y: 100 },
    },
  ];
  
  // Use correct edge handles based on node contracts
  // chat_trigger outputs 'message' field, ai_agent receives on 'userInput' handle
  const edges = [
    {
      id: `edge_${Date.now()}`,
      source: nodeId1,
      target: nodeId2,
      sourceHandle: 'message', // chat_trigger outputs 'message' field
      targetHandle: 'userInput', // ai_agent receives on userInput handle
    },
  ];
  
  return {
    workflow: { nodes, edges },
    documentation: 'A simple chatbot workflow that responds to user messages using an AI agent.',
    suggestions: [],
    estimatedComplexity: 'simple',
    requirements: {
      trigger: 'chat_trigger',
      actions: ['ai_agent'],
    },
    requiredCredentials: [],
  };
}

/**
 * Handle phased refine approach - NEW credential-aware workflow generation
 */
async function handlePhasedRefine(
  req: Request,
  res: Response,
  finalPrompt: string,
  answers?: Record<string, string>
) {
  try {
    // Initialize services (skip credential-related services for local dev)
    const edgeGenerator = new RobustEdgeGenerator();

    // Skip authentication check for local development
    console.log('[PhasedRefine] Skipping auth check - local development mode');

    // STEP 1: Analyze prompt and generate clarifying questions if no answers
    if (!answers || Object.keys(answers).length === 0) {
      console.log('[PhasedRefine] No answers provided - checking if questions are needed...');
      
      // ⚡ FAST CHECK: Use fast analysis first to see if questions are needed
      const fastAnalysis = enhancedWorkflowAnalyzer.fastAnalyzePromptWithNodeOptions(finalPrompt, {});
      
      // If no questions are needed (e.g., chatbot workflows), skip question generation and continue directly
      if (!fastAnalysis.questions || fastAnalysis.questions.length === 0) {
        console.log('[PhasedRefine] ⚡ No questions needed - auto-continuing to workflow generation');
        // Continue to workflow generation with empty answers
        // Fall through to STEP 2 with empty answers object
        answers = {};
      } else {
        // Questions are needed - do full analysis and return questions
        console.log('[PhasedRefine] Questions needed - generating full analysis...');
        const analysis = await enhancedWorkflowAnalyzer.analyzePromptWithNodeOptions(finalPrompt, {});
        
        // Build a comprehensive final prompt from analysis
        const enhancedPrompt = buildFinalPromptFromAnalysis(finalPrompt, analysis);
        
        // Filter out credential questions at this stage (credentials asked later)
        const nonCredentialQuestions = analysis.questions.filter(
          (q: any) => !q.category || (q.category !== 'credential' && !q.id?.includes('credential'))
        );

        console.log('[PhasedRefine] Generated enhanced prompt from analysis:', enhancedPrompt.substring(0, 200));

        return res.json({
          phase: 'clarification',
          questions: nonCredentialQuestions,
          analysis: {
            detectedWorkflowType: analysis.summary,
            estimatedNodeCount: analysis.nodeOptionsDetected?.length || 0,
            complexity: 'medium',
            enhancedPrompt: enhancedPrompt, // Send enhanced prompt to frontend
          },
          prompt: finalPrompt,
          enhancedPrompt: enhancedPrompt, // Also include at top level
        });
      }
    }

    // STEP 2: Check if this is a credential submission (workflow already built)
    const isCredentialSubmission = answers && Object.keys(answers).some(key => 
      key.toLowerCase().includes('credential') || 
      key.toLowerCase().includes('webhook') ||
      key.toLowerCase().includes('token') ||
      key.toLowerCase().includes('api_key') ||
      key.toLowerCase().includes('secret')
    );
    
    const partialWorkflowFromRequest = (req.body as any).partialWorkflow || (req.body as any).workflow;
    
    if (isCredentialSubmission && partialWorkflowFromRequest) {
      // STEP 2a: Credential submission - inject credentials and return final workflow
      console.log('[PHASE] CREDENTIALS_SUBMITTED - Injecting credentials into workflow...');
      
      // Perform credential discovery on the workflow before processing
      const { credentialDiscoveryPhase } = await import('../services/ai/credential-discovery-phase');
      const credentialDiscovery = await credentialDiscoveryPhase.discoverCredentials(partialWorkflowFromRequest);
      
      // ✅ PRODUCTION FLOW: Use lifecycle manager for credential injection
      const { workflowLifecycleManager } = await import('../services/workflow-lifecycle-manager');
      const injectionResult = await workflowLifecycleManager.injectCredentials(
        partialWorkflowFromRequest,
        answers
      );
      if (!injectionResult.success) {
        throw new Error(`Credential injection failed: ${injectionResult.errors?.join(', ')}`);
      }
      const workflowWithCredentials = injectionResult.workflow;
      
      // Re-validate workflow after credential injection
      const validation = await workflowValidator.validateAndFix(workflowWithCredentials);
      let finalWorkflow = validation.fixedWorkflow || workflowWithCredentials;
      
      // ✅ MASK LAYER: Apply Data Flow Contract Layer AFTER credentials/inputs are provided
      // This executes nodes to get REAL JSON, then intelligently maps properties based on user intent
      try {
        console.log('[PHASE] DATA_FLOW_CONTRACT - Applying mask layer with real JSON execution...');
        const { DataFlowContractLayer } = await import('../services/data-flow-contract-layer');
        const dataFlowLayer = new DataFlowContractLayer();
        
        // Get user ID from request if available
        const supabase = getSupabaseClient();
        let userId: string | undefined;
        try {
          const { data: { user } } = await supabase.auth.getUser();
          userId = user?.id;
        } catch (error) {
          console.warn('[DataFlowContractLayer] Could not get user ID:', error);
        }
        
        const contractResult = await dataFlowLayer.applyDataFlowContract(
          finalWorkflow,
          finalPrompt,
          userId
        );
        
        finalWorkflow = contractResult.workflow;
        console.log(`[PHASE] DATA_FLOW_CONTRACT - ✅ Applied ${contractResult.mappings.length} property mappings`);
        console.log(`[PHASE] DATA_FLOW_CONTRACT - Mappings:`, contractResult.mappings.map(m => 
          `${m.targetNodeId}.${m.targetField} = ${m.templateExpression}`
        ).join(', '));
      } catch (error: any) {
        console.error('[PHASE] DATA_FLOW_CONTRACT - ⚠️  Failed to apply mask layer:', error.message);
        console.error('[PHASE] DATA_FLOW_CONTRACT - Continuing with workflow as-is (schema-based fallback)');
        // Don't fail the entire workflow - continue with existing configs
      }
      
      // Extract final credentials list
      const finalCredentialsFromNodes = extractCredentialsFromNodes(finalWorkflow);
      const allFinalCredentials = Array.from(new Set(finalCredentialsFromNodes));
      
      console.log('[PHASE] READY - Workflow complete with credentials and data flow contracts');
      
      // 🔒 STRUCTURAL FIX: Include discovered credentials in response
      // Frontend MUST show blocking modal for ALL credentials before allowing Run
      const discoveredCredentialNames = credentialDiscovery.requiredCredentials.map(c => c.vaultKey);
      const allRequiredCredentials = Array.from(new Set([...allFinalCredentials, ...discoveredCredentialNames]));
      
      return res.json({
        phase: 'ready',
        success: true,
        workflow: finalWorkflow,
        nodes: finalWorkflow.nodes,
        edges: finalWorkflow.edges,
        systemPrompt: (req.body as any).systemPrompt || finalPrompt,
        documentation: (req.body as any).documentation || '',
        suggestions: [],
        estimatedComplexity: 'medium',
        requirements: (req.body as any).requirements || {},
        requiredCredentials: allRequiredCredentials,
        discoveredCredentials: credentialDiscovery.requiredCredentials, // 🔒 NEW: Complete credential discovery result
        validation: {
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
          fixesApplied: validation.fixesApplied,
        },
      });
    }
    
    // STEP 2: Build final prompt from answers (if answers provided)
    // CRITICAL FIX: Properly extract answer text to avoid [object Object]
    console.log('[PHASE] FINAL_PROMPT_MERGE - Merging answers into prompt...');
    
    const filteredAnswers = answers ? Object.fromEntries(
      Object.entries(answers).filter(([key, value]) => {
        // Exclude credential answers (they're handled separately)
        if (key.toLowerCase().includes('credential') || 
            key.toLowerCase().includes('webhook') ||
            key.toLowerCase().includes('token') ||
            key.toLowerCase().includes('api_key') ||
            key.toLowerCase().includes('secret')) {
          return false;
        }
        return true;
      })
    ) : {};
    
    const finalEnhancedPrompt = Object.keys(filteredAnswers).length > 0
      ? buildFinalPromptFromAnswers(finalPrompt, filteredAnswers)
      : finalPrompt;
    
    // STEP 3: Generate workflow SILENTLY (don't return it yet)
    console.log('[PHASE] WORKFLOW_BUILT - Generating workflow structure...');
    
    let workflowResult;
    try {
      workflowResult = await agenticWorkflowBuilder.generateFromPrompt(finalEnhancedPrompt, {
        answers: filteredAnswers, // Only pass non-credential answers
      });
    } catch (error) {
      // CRITICAL: If Ollama connection fails, use pattern-based fallback for simple workflows
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCause = (error as any)?.cause;
      const useChatbotFallback = (error as any)?.useChatbotFallback;
      const isConnectionError = errorMessage.includes('ECONNREFUSED') || 
                                errorMessage.includes('fetch failed') ||
                                errorMessage.includes('Connection refused') ||
                                errorMessage.includes('Ollama unavailable') ||
                                (errorCause && (errorCause.code === 'ECONNREFUSED' || errorCause.message?.includes('ECONNREFUSED')));
      
      if (isConnectionError || useChatbotFallback) {
        console.warn('⚠️  [PhasedRefine] Ollama connection failed, using pattern-based fallback');
        
        // Check if this is a chatbot workflow (common case)
        const promptLower = finalEnhancedPrompt.toLowerCase();
        if (useChatbotFallback || promptLower.includes('chat') || promptLower.includes('bot') || promptLower.includes('assistant')) {
          console.log('✅ [PhasedRefine] Detected chatbot workflow - generating without LLM');
          workflowResult = await generateChatbotWorkflowFallback(finalEnhancedPrompt);
        } else {
          // For other workflows, return error with helpful message
          // Use config.ollamaHost which reads from environment variables
          const ollamaHost = config.ollamaHost || 'http://localhost:11434';
          throw new Error(`Ollama service is not available. Please ensure Ollama is running on ${ollamaHost}. For chatbot workflows, the system can generate them automatically.`);
        }
      } else {
        // Re-throw if it's a different error
        throw error;
      }
    }
    
    console.log('[PhasedRefine] Final enhanced prompt from answers:', finalEnhancedPrompt.substring(0, 200));

    // STEP 2.5: Identify required credentials BEFORE generating workflow
    // NOTE: These credentials are for LATER use - we don't block workflow generation
    console.log('[PhasedRefine] Identifying required credentials from prompt (for later use)...');
    const requirements = await requirementsExtractor.extractRequirements(
      finalPrompt,
      finalEnhancedPrompt,
      answers
    );
    
    const requiredCredentials = identifyRequiredCredentialsFromRequirements(
      requirements,
      finalEnhancedPrompt,
      answers
    );
    
    console.log(`[PhasedRefine] Identified ${requiredCredentials.length} required credential(s) (will be asked AFTER workflow is built)`);
    
    // Check if credentials are already provided in answers
    const credentialAnswers = answers ? Object.entries(answers).filter(([key]) => 
      key.toLowerCase().includes('credential') || 
      key.toLowerCase().includes('api_key') || 
      key.toLowerCase().includes('token') ||
      key.toLowerCase().includes('secret') ||
      requiredCredentials.some(cred => key.toUpperCase().includes(cred))
    ) : [];
    
    const providedCredentials = credentialAnswers.map(([key]) => key);
    const missingCredentialsFromAnswers = requiredCredentials.filter(cred => 
      !providedCredentials.some(provided => provided.toUpperCase().includes(cred))
    );

    let workflowStructure = {
      nodes: workflowResult.workflow.nodes,
      edges: workflowResult.workflow.edges,
    };

    // STEP 3.5: Apply configuration answers to workflow structure if provided
    // Answers with format req_<nodeId>_<fieldName> are node configuration answers
    // Also handle credential answers (credential_<credName> or direct credential names)
    if (answers && Object.keys(answers).length > 0) {
      const configAnswers = Object.entries(answers).filter(([key]) => key.startsWith('req_'));
      const credentialAnswers = Object.entries(answers).filter(([key]) => 
        key.toLowerCase().includes('credential') || 
        key.toLowerCase().includes('webhook') ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('api_key')
      );
      
      if (configAnswers.length > 0 || credentialAnswers.length > 0) {
        console.log(`[PhasedRefine] Applying ${configAnswers.length} configuration answers and ${credentialAnswers.length} credential answers to workflow structure...`);
        workflowStructure.nodes = workflowStructure.nodes.map((node: any) => {
          const nodeConfig = { ...(node.data?.config || {}) };
          let updated = false;
          
          // Apply node configuration answers (req_<nodeId>_<fieldName>)
          configAnswers.forEach(([key, value]) => {
            const expectedPrefix = `req_${node.id}_`;
            if (key.startsWith(expectedPrefix)) {
              const fieldName = key.substring(expectedPrefix.length);
              if (fieldName) {
                nodeConfig[fieldName] = value;
                updated = true;
                console.log(`[PhasedRefine] Applied ${fieldName} = ${value} to node ${node.id} (${node.data?.label || node.type})`);
              }
            }
          });
          
          // Apply credential answers to relevant nodes
          credentialAnswers.forEach(([key, value]) => {
            const credKey = key.toLowerCase();
            const nodeType = (node.type || node.data?.type || '').toLowerCase();
            
            // Apply Slack webhook URL to slack_message nodes
            if ((credKey.includes('slack_webhook_url') || credKey.includes('slack') && credKey.includes('webhook')) && 
                nodeType === 'slack_message') {
              nodeConfig.webhookUrl = value;
              updated = true;
              console.log(`[PhasedRefine] Applied Slack webhook URL to node ${node.id}`);
            }
            
            // Apply Google Sheets URL/ID to google_sheets nodes
            if ((credKey.includes('google_sheet') || credKey.includes('sheet') || credKey.includes('spreadsheet')) && 
                nodeType === 'google_sheets') {
              try {
                const { extractSpreadsheetId } = require('../shared/google-api-utils');
                const extractedId = extractSpreadsheetId(String(value));
                nodeConfig.spreadsheetId = extractedId;
                updated = true;
                console.log(`[PhasedRefine] Applied Google Sheets ID "${extractedId}" to node ${node.id} (extracted from: ${String(value).substring(0, 50)})`);
              } catch (error) {
                // Fallback: use value as-is
                nodeConfig.spreadsheetId = String(value);
                updated = true;
                console.log(`[PhasedRefine] Applied Google Sheets value to node ${node.id} (extraction failed)`);
              }
            }
            
            // Apply Google Docs URL/ID to google_doc nodes
            if ((credKey.includes('google_doc') || credKey.includes('document')) && 
                nodeType === 'google_doc') {
              try {
                const { extractDocumentId } = require('../shared/google-api-utils');
                const extractedId = extractDocumentId(String(value));
                nodeConfig.documentId = extractedId;
                updated = true;
                console.log(`[PhasedRefine] Applied Google Docs ID "${extractedId}" to node ${node.id} (extracted from: ${String(value).substring(0, 50)})`);
              } catch (error) {
                // Fallback: use value as-is
                nodeConfig.documentId = String(value);
                updated = true;
                console.log(`[PhasedRefine] Applied Google Docs value to node ${node.id} (extraction failed)`);
              }
            }
            
            // ✅ PRODUCTION: Use connector registry - no Gmail-specific hacks
            // Gmail "from" field is configuration, not credential injection
            // This should be handled by node schema, not special-case logic
          });
          
          if (updated) {
            return {
              ...node,
              data: {
                ...node.data,
                config: nodeConfig,
              },
            };
          }
          return node;
        });
        console.log('[PhasedRefine] Configuration and credential answers applied, re-checking for missing fields...');
      }
    }

    // STEP 4: Validate and auto-repair workflow
    console.log('[PHASE] WORKFLOW_VALIDATION - Validating and auto-repairing workflow...');
    const validation = await workflowValidator.validateAndFix(workflowStructure);
    let validatedWorkflow = validation.fixedWorkflow || workflowStructure;
    
    // 🚨 STRUCTURAL FIX: Validate all nodes have schemas BEFORE proceeding
    // No node is allowed into the graph unless its schema exists
    const schemaValidationErrors: string[] = [];
    for (const node of validatedWorkflow.nodes) {
      const nodeType = normalizeNodeType(node);
      const schema = nodeLibrary.getSchema(nodeType);
      if (!schema) {
        const error = `Node ${node.id} (type: ${nodeType}) has no schema in node library. Cannot proceed.`;
        schemaValidationErrors.push(error);
        console.error(`[PHASE] SCHEMA_VALIDATION_FAILED: ${error}`);
      }
    }
    
    if (schemaValidationErrors.length > 0) {
      return res.status(400).json({
        error: 'Schema validation failed',
        message: `${schemaValidationErrors.length} node(s) have missing schemas`,
        details: schemaValidationErrors,
        phase: 'error',
        success: false,
      });
    }
    
    // 🔒 NODE RESOLUTION: Deterministic node resolution BEFORE integrity check
    // This replaces heuristic LLM guessing with capability-based resolution
    const { NodeResolver } = await import('../services/ai/node-resolver');
    const nodeResolver = new NodeResolver(nodeLibrary);
    
    // Resolve nodes from prompt
    const resolution = nodeResolver.resolvePrompt(finalPrompt);
    
    if (!resolution.success && resolution.errors.length > 0) {
      console.error('[PHASE] NODE_RESOLUTION_FAILED:', resolution.errors);
      return res.status(400).json({
        error: 'Node resolution failed',
        message: 'Failed to resolve required nodes from prompt',
        details: resolution.errors.map(e => e.message),
        suggestions: resolution.errors.flatMap(e => e.suggestions),
        phase: 'error',
        success: false,
      });
    }
    
    // Ensure resolved nodes are in workflow
    const resolvedNodeTypes = resolution.nodeIds;
    const existingNodeTypes = validatedWorkflow.nodes.map((node: any) => 
      node.data?.type || node.type
    );
    
    // Add missing resolved nodes
    for (const nodeType of resolvedNodeTypes) {
      if (!existingNodeTypes.includes(nodeType)) {
        console.log(`[PHASE] NODE_RESOLUTION: Adding required node ${nodeType} from prompt resolution`);
        const schema = nodeLibrary.getSchema(nodeType);
        if (schema) {
          const { randomUUID } = require('crypto');
          const newNode = {
            id: randomUUID(),
            type: 'custom',
            position: { x: 0, y: 0 },
            data: {
              type: nodeType,
              label: schema.label,
              category: schema.category,
              config: {},
            },
          };
          validatedWorkflow = {
            ...validatedWorkflow,
            nodes: [...validatedWorkflow.nodes, newNode],
          };
        }
      }
    }
    
    // 🚨 CRITICAL ASSERTION: Gmail integrity check (now in NodeResolver)
    // NodeResolver.assertGmailIntegrity is called in resolvePrompt, but we verify here too
    try {
      nodeResolver.assertGmailIntegrity(finalPrompt, validatedWorkflow.nodes.map((node: any) => 
        node.data?.type || node.type
      ));
    } catch (error: any) {
      console.error('[PHASE] GMAIL_INTEGRITY_FAILED:', error.message);
      return res.status(400).json({
        error: 'Gmail integrity check failed',
        message: error.message,
        details: 'Gmail mentioned in prompt but google_gmail node not resolved',
        phase: 'error',
        success: false,
      });
    }
    
    // STEP 5: 🔒 CREDENTIAL DISCOVERY PHASE - MANDATORY ARCHITECTURAL PHASE
    // This phase discovers ALL credentials required for the entire workflow DAG
    // BEFORE execution. This ensures deterministic workflow generation.
    console.log('[PHASE] CREDENTIAL_DISCOVERY - Discovering all required credentials for workflow...');
    
    const { credentialDiscoveryPhase } = await import('../services/ai/credential-discovery-phase');
    const credentialDiscovery = await credentialDiscoveryPhase.discoverCredentials(validatedWorkflow);
    
    if (!credentialDiscovery.allDiscovered) {
      console.error('[PHASE] CREDENTIAL_DISCOVERY_FAILED:', credentialDiscovery.errors);
      return res.status(400).json({
        error: 'Credential discovery failed',
        message: 'Failed to discover all required credentials',
        details: credentialDiscovery.errors,
        warnings: credentialDiscovery.warnings,
        phase: 'error',
        success: false,
      });
    }
    
    console.log(`[PHASE] CREDENTIAL_DISCOVERY - Discovered ${credentialDiscovery.requiredCredentials.length} required credential(s)`);
    credentialDiscovery.requiredCredentials.forEach(cred => {
      console.log(`  - ${cred.displayName} (${cred.provider}/${cred.type}) - Required by: ${cred.nodeTypes.join(', ')}`);
    });
    
    // STEP 6: 🎯 CENTRALIZED CREDENTIAL RESOLUTION - AFTER workflow is fully generated
    // This is the SINGLE AUTHORITATIVE credential detection pass
    console.log('[PHASE] CREDENTIALS_DETECTION - Running centralized credential resolution on complete workflow...');
    
    // Create credential resolver instance
    const credentialResolver = new CredentialResolver(nodeLibrary);
    
    // Get user ID for vault lookup
    let userId: string | undefined;
    try {
      const supabase = getSupabaseClient();
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '').trim();
        if (token) {
          const { data: { user }, error: authError } = await supabase.auth.getUser(token);
          if (!authError && user) {
            userId = user.id;
          }
        }
      }
    } catch (error) {
      console.warn('[PHASE] CREDENTIALS_DETECTION - Could not get user ID for vault lookup:', error instanceof Error ? error.message : String(error));
    }
    
    // Run centralized credential resolution
    const credentialResolution = await credentialResolver.resolve(validatedWorkflow, userId);
    
    // 🚨 CRITICAL ASSERTION: Gmail credential check
    try {
      credentialResolver.assertGmailCredentials(credentialResolution, validatedWorkflow);
    } catch (error) {
      console.error('🚨 [PHASE] GMAIL_CREDENTIAL_FAILED:', error instanceof Error ? error.message : String(error));
      return res.status(400).json({
        error: 'Credential resolution error',
        message: error instanceof Error ? error.message : String(error),
        phase: 'error',
        success: false,
      });
    }
    
    // Keep legacy scanner for backward compatibility (but use resolver as source of truth)
    const credentialScanner = new ComprehensiveCredentialScanner(nodeLibrary);
    const credentialScanResult = credentialScanner.scanWorkflowForCredentials(validatedWorkflow);
    
    // 🔧 STEP 4.5: INTELLIGENT CONFIGURATION FILLING
    // Before checking for missing fields, use AI to intelligently fill in configuration
    // based on prompt analysis. This prevents asking users for things the AI can infer.
    console.log('[PHASE] INTELLIGENT_CONFIG_FILLING - Analyzing prompt to fill configuration intelligently...');
    
    try {
      // Use AI to analyze prompt and fill in intelligent defaults for node configurations
      const { intelligentConfigFiller } = await import('../services/ai/intelligent-config-filler');
      validatedWorkflow = await intelligentConfigFiller.fillConfigurationsFromPrompt(
        validatedWorkflow,
        finalEnhancedPrompt,
        finalPrompt
      );
      console.log('[PHASE] INTELLIGENT_CONFIG_FILLING - Configuration filled intelligently from prompt analysis');
    } catch (error) {
      console.warn('[PHASE] INTELLIGENT_CONFIG_FILLING - Failed to fill configurations intelligently, continuing with defaults:', error instanceof Error ? error.message : String(error));
      // Continue - we'll check for missing fields and ask if needed
    }
    
    // Also run legacy check for backward compatibility (but use scanner result as source of truth)
    const missingFieldsCheck = checkMissingRequiredFields(validatedWorkflow);
    
    // Separate credential questions from configuration questions
    const configQuestions = missingFieldsCheck.questions.filter(q => q.category === 'configuration');
    
    // 🎯 USE CREDENTIAL RESOLVER AS SINGLE SOURCE OF TRUTH
    // The resolver has already identified ALL required credentials from ALL nodes
    // and checked the vault for stored credentials
    const allRequiredCredentials = credentialResolution.required.map((c: any) => c.credentialId);
    const missingCredentialsFromResolver = credentialResolution.missing;
    
    console.log(`[PHASE] CREDENTIALS_DETECTION - Resolver found ${credentialResolution.summary.totalCredentials} total credential(s)`);
    console.log(`[PHASE] CREDENTIALS_DETECTION - Missing: ${credentialResolution.summary.missingCount}, Satisfied: ${credentialResolution.summary.satisfiedCount}`);
    console.log(`[PHASE] CREDENTIALS_DETECTION - Providers: [${credentialResolution.providers.join(', ')}]`);
    
    // Legacy scanner result (for backward compatibility)
    const missingCredentialsFromScanner = credentialScanResult.missingCredentials;
    
    // Check if user already has credentials stored in Supabase
    let storedCredentials: string[] = [];
    try {
      const supabase = getSupabaseClient();
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '').trim();
        if (token) {
          const { data: { user }, error: authError } = await supabase.auth.getUser(token);
          if (!authError && user) {
            // Check for stored credentials in user_credentials table
            const { data: credentialsData, error: credError } = await supabase
              .from('user_credentials')
              .select('service, credentials')
              .eq('user_id', user.id);
            
            if (!credError && credentialsData) {
              // Map stored services to credential names
              credentialsData.forEach((cred: any) => {
                const service = cred.service?.toLowerCase();
                const creds = cred.credentials || {};
                
                // Check for Google OAuth (stored as 'google' service)
                if (service === 'google' && (creds.access_token || creds.refresh_token)) {
                  // Google OAuth is stored - remove Google credential requests
                  storedCredentials.push('GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_SHEETS_URL_OR_ID');
                }
                
                // Check for Slack webhook (might be stored in credentials)
                if (creds.slack_webhook_url || creds.SLACK_WEBHOOK_URL) {
                  storedCredentials.push('SLACK_WEBHOOK_URL');
                }
                
                // Check for other stored credentials
                Object.keys(creds).forEach(key => {
                  const upperKey = key.toUpperCase();
                  if (allRequiredCredentials.some((cred: string) => upperKey.includes(cred) || cred.includes(upperKey))) {
                    storedCredentials.push(upperKey);
                  }
                });
              });
              
              console.log(`[PHASE] CREDENTIALS_DETECTION - Found ${storedCredentials.length} stored credential(s) for user:`, storedCredentials);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[PHASE] CREDENTIALS_DETECTION - Could not check stored credentials:`, error instanceof Error ? error.message : String(error));
    }
    
    // 🎯 USE RESOLVER RESULT AS SOURCE OF TRUTH
    // The resolver has already:
    // 1. Read all node credential contracts
    // 2. Checked vault for stored credentials
    // 3. Marked credentials as resolved/satisfied
    // 4. Filtered out OAuth credentials (handled via UI)
    // 5. Ensured Gmail uses OAuth (not SMTP)
    const missingCredentials = missingCredentialsFromResolver.map((cred: any) => ({
      credentialName: cred.credentialId,
      displayName: cred.displayName,
      nodeId: cred.nodeId,
      nodeType: cred.nodeType,
      nodeLabel: cred.nodeLabel,
      fieldName: cred.credentialId, // Use credentialId as fieldName
      description: cred.displayName,
      type: cred.type,
      required: cred.required,
      isMissing: true,
    }));
    
    console.log(`[PHASE] CREDENTIALS_REQUIRED - Found ${credentialResolution.summary.totalCredentials} required credential(s), ${credentialResolution.summary.satisfiedCount} already satisfied, ${credentialResolution.summary.missingCount} need to be provided`);
    
    // 🚨 CRITICAL: BLOCK EXECUTION if resolver says workflow is invalid
    if (credentialResolution.summary.missingCount > 0) {
      console.error(`🚨 [PHASE] WORKFLOW_BLOCKED - Resolver detected ${credentialResolution.summary.missingCount} missing required credential(s). Execution blocked.`);
    }
    
    // ✅ REMOVED: CONFIGURATION_REQUIRED phase
    // Configuration questions are now handled via discoveredInputs in phase: 'ready'
    // This prevents premature configuration prompts and phase re-entry loops

    // STEP 6: 🚨 VALIDATION CHECK - Block if scanner says invalid
    if (!credentialScanResult.isValid) {
      console.error(`🚨 [PHASE] WORKFLOW_BLOCKED - Comprehensive scanner detected missing credentials. Cannot proceed.`);
      console.error(`🚨 [PHASE] Missing credentials:`, missingCredentials.map((c: any) => `${c.credentialName} (${c.nodeType}.${c.fieldName})`));
    }
    
    // ✅ PRODUCTION FLOW: Always return phase: 'ready' with discovered inputs and credentials
    // Frontend will show unified modal for both inputs and credentials AFTER generation
    console.log('[PHASE] READY - Workflow generation complete, returning discovered inputs and credentials');
    console.log(`[PHASE] READY_RESPONSE - Returning workflow with ${validatedWorkflow.nodes.length} nodes, ${validatedWorkflow.edges.length} edges`);
    
    // Discover node inputs (separate from credentials) - AFTER generation completes
    const { workflowLifecycleManager } = await import('../services/workflow-lifecycle-manager');
    const nodeInputs = workflowLifecycleManager.discoverNodeInputs(validatedWorkflow);
    console.log(`[PHASE] READY_RESPONSE - Node inputs: ${nodeInputs.inputs.length}, Credentials: ${credentialResolution.summary.missingCount}`);
    
    // Format node inputs for frontend
    const formattedInputs = nodeInputs.inputs.map((input: any) => ({
      id: `input_${input.nodeId}_${input.fieldName}`,
      nodeId: input.nodeId,
      nodeType: input.nodeType,
      nodeLabel: input.nodeLabel,
      fieldName: input.fieldName,
      fieldType: input.fieldType,
      label: `${input.nodeLabel} - ${input.fieldName}`,
      description: input.description,
      required: input.required,
      defaultValue: input.defaultValue,
      examples: input.examples,
      type: input.fieldType === 'textarea' ? 'textarea' : 'text',
      category: 'configuration',
    }));

    // ✅ COMPREHENSIVE: Generate per-node questions (cred/resource/op/config) for step-by-step wizard
    const comprehensiveQuestions = generateComprehensiveNodeQuestions(validatedWorkflow, {}).questions;
  
    return res.json({
      phase: 'ready', // ✅ CRITICAL: Must be "ready" for frontend to show unified modal
      success: true,
      workflow: validatedWorkflow,
      nodes: validatedWorkflow.nodes,
      edges: validatedWorkflow.edges,
      systemPrompt: finalEnhancedPrompt,
      prompt: finalPrompt,
      enhancedPrompt: finalEnhancedPrompt,
      refinedPrompt: finalEnhancedPrompt,
      documentation: workflowResult?.documentation || '',
      suggestions: workflowResult?.suggestions || [],
      estimatedComplexity: workflowResult?.estimatedComplexity || 'medium',
      requirements: workflowResult?.requirements || {},
      // ✅ Discovered node inputs (separate from credentials)
      discoveredInputs: formattedInputs,
      requiredInputs: formattedInputs.filter((i: any) => i.required),
      comprehensiveQuestions,
      // ✅ Discovered credentials (separate from inputs)
      // ✅ CRITICAL: Only return MISSING credentials - exclude already resolved OAuth
      // ✅ STRICT: NEVER ask for Google OAuth in configuration - user connects via header bar
      // OAuth credentials that are already connected (via header bar) should NOT appear here
      // Google OAuth should NEVER appear in configuration modal - workflow will error if not connected
      discoveredCredentials: credentialResolution.missing
        .filter((c: any) => {
          // ✅ STRICT FILTER: Exclude ALL Google OAuth credentials from configuration modal
          const isGoogleOAuth = (c.provider?.toLowerCase() === 'google' && c.type === 'oauth') ||
                                (c.vaultKey?.toLowerCase() === 'google' && c.type === 'oauth') ||
                                (c.credentialId?.toLowerCase().includes('google') && c.type === 'oauth');
          if (isGoogleOAuth) {
            console.log(`[GenerateWorkflow] ✅ Filtering out Google OAuth from configuration: ${c.displayName || c.credentialId}`);
            return false; // Exclude Google OAuth
          }
          return true; // Include all other credentials
        })
        .map((c: any) => ({
          credentialId: c.credentialId,
          displayName: c.displayName,
          provider: c.provider,
          type: c.type,
          resolved: false, // All missing credentials are unresolved
          required: c.required,
          vaultKey: c.vaultKey,
          nodeIds: c.nodeIds || [],
        })),
      requiredCredentials: credentialResolution.missing.map((c: any) => ({
        credentialId: c.credentialId,
        displayName: c.displayName,
        provider: c.provider,
        type: c.type,
        vaultKey: c.vaultKey,
      })),
      credentialResolution: {
        required: credentialResolution.required.map((c: any) => ({
          credentialId: c.credentialId,
          displayName: c.displayName,
          provider: c.provider,
          type: c.type,
          resolved: c.resolved,
        })),
        missing: credentialResolution.missing.map((c: any) => ({
          credentialId: c.credentialId,
          displayName: c.displayName,
          provider: c.provider,
          type: c.type,
        })),
        satisfied: credentialResolution.satisfied.map((c: any) => ({
          credentialId: c.credentialId,
          displayName: c.displayName,
          provider: c.provider,
          type: c.type,
        })),
        providers: credentialResolution.providers,
        summary: credentialResolution.summary,
      },
      validation: {
        valid: validation.valid,
        errors: validation.errors.map(e => e.message),
        warnings: validation.warnings.map(w => w.message),
        fixesApplied: validation.fixesApplied,
      },
      summary: {
        nodes: validatedWorkflow.nodes.length,
        edges: validatedWorkflow.edges.length,
        inputsRequired: formattedInputs.length,
        credentialsRequired: credentialResolution.summary.missingCount,
      },
    });

    // ✅ REMOVED: No separate credentials phase - everything returned above in phase: 'ready'
    // Both inputs and credentials are discovered and returned together after generation completes
    // This code path should never be reached - if it is, it's a bug
    console.error('[PHASE] ERROR - Reached unreachable code path. All responses should be in phase: ready above.');
    return res.status(500).json({
      error: 'Internal error - workflow generation flow issue',
      phase: 'error',
    });
  } catch (error) {
    console.error('[PhasedRefine] Error:', error);
    
    // Check if this is a chatbot workflow that should use fallback
    const errorMessage = error instanceof Error ? error.message : String(error);
    const useChatbotFallback = (error as any)?.useChatbotFallback;
    const isConnectionError = errorMessage.includes('ECONNREFUSED') || 
                              errorMessage.includes('fetch failed') ||
                              errorMessage.includes('Connection refused') ||
                              errorMessage.includes('Ollama unavailable');
    const promptLower = finalPrompt.toLowerCase();
    const isChatbotWorkflow = promptLower.includes('chat') || 
                              promptLower.includes('bot') || 
                              promptLower.includes('assistant');
    
    // If chatbot workflow and Ollama unavailable, use fallback directly
    if ((useChatbotFallback || isConnectionError) && isChatbotWorkflow) {
      console.log('✅ [PhasedRefine] Using chatbot fallback due to Ollama unavailability');
      try {
        const fallbackWorkflow = await generateChatbotWorkflowFallback(finalPrompt);
        return res.json({
          phase: 'complete',
          workflow: fallbackWorkflow.workflow,
          summary: {
            nodes: fallbackWorkflow.workflow.nodes.length,
            edges: fallbackWorkflow.workflow.edges.length,
            credentialsConfigured: 0,
            autoConfigured: 0,
          },
          requirements: fallbackWorkflow.requirements || {},
          documentation: fallbackWorkflow.documentation || 'Workflow generated with fallback method (Ollama unavailable)',
          prompt: finalPrompt,
          requiredCredentials: [],
          warning: 'Ollama service unavailable - workflow generated using pattern-based fallback',
        });
      } catch (fallbackError) {
        console.error('[PhasedRefine] Fallback generation failed:', fallbackError);
      }
    }
    
    // PERMANENT FIX: Try to return a basic workflow even on error, don't fail completely
    try {
      // Attempt to generate a minimal workflow as fallback
      const fallbackWorkflow = await agenticWorkflowBuilder.generateFromPrompt(finalPrompt, {
        answers: answers || {},
      });
      
      return res.json({
        phase: 'complete',
        workflow: fallbackWorkflow.workflow,
        summary: {
          nodes: fallbackWorkflow.workflow.nodes.length,
          edges: fallbackWorkflow.workflow.edges.length,
          credentialsConfigured: 0,
          autoConfigured: 0,
        },
        requirements: fallbackWorkflow.requirements || {},
        documentation: fallbackWorkflow.documentation || 'Workflow generated with fallback method',
        prompt: finalPrompt,
        requiredCredentials: [],
        warning: error instanceof Error ? error.message : String(error),
      });
    } catch (fallbackError) {
      // If fallback also fails, return error
      return res.status(500).json({
        error: 'Phased workflow generation failed',
        details: error instanceof Error ? error.message : String(error),
        phase: 'error',
      });
    }
  }
}

/**
 * Build final analyzed prompt (3-5 sentences) from analysis results
 */
function buildFinalPromptFromAnalysis(originalPrompt: string, analysis: any): string {
  const sentences: string[] = [];
  
  // Start with the core workflow goal
  if (analysis.summary) {
    sentences.push(analysis.summary);
  } else {
    sentences.push(`This workflow will ${originalPrompt.toLowerCase()}.`);
  }
  
  // Add trigger information
  if (analysis.trigger) {
    const triggerDesc = analysis.trigger === 'manual_trigger' ? 'manually triggered' :
                        analysis.trigger === 'schedule' ? 'scheduled to run automatically' :
                        analysis.trigger === 'webhook' ? 'triggered by webhook events' :
                        analysis.trigger === 'form' ? 'triggered by form submissions' :
                        'triggered automatically';
    sentences.push(`The workflow will be ${triggerDesc}.`);
  }
  
  // Add key steps
  if (analysis.keySteps && analysis.keySteps.length > 0) {
    const stepsText = analysis.keySteps.length === 1 
      ? analysis.keySteps[0].toLowerCase()
      : analysis.keySteps.slice(0, 2).map((s: string) => s.toLowerCase()).join(', ') + 
        (analysis.keySteps.length > 2 ? `, and ${analysis.keySteps.length - 2} more step${analysis.keySteps.length - 2 > 1 ? 's' : ''}` : '');
    sentences.push(`It will ${stepsText}.`);
  }
  
  // Add output/destination
  if (analysis.outputs && analysis.outputs.length > 0) {
    const outputText = analysis.outputs.length === 1
      ? analysis.outputs[0].toLowerCase()
      : analysis.outputs.map((o: string) => o.toLowerCase()).join(' and ');
    sentences.push(`The final output will be sent to ${outputText}.`);
  } else if (analysis.platforms && analysis.platforms.length > 0) {
    const platformText = analysis.platforms.join(' and ');
    sentences.push(`Data will be processed and sent to ${platformText}.`);
  }
  
  // Add any special requirements
  if (analysis.requirements && Object.keys(analysis.requirements).length > 0) {
    const reqs: string[] = [];
    if (analysis.requirements.schedules && analysis.requirements.schedules.length > 0) {
      reqs.push(`scheduled for ${analysis.requirements.schedules[0]}`);
    }
    if (analysis.requirements.urls && analysis.requirements.urls.length > 0) {
      reqs.push(`using webhook URL`);
    }
    if (reqs.length > 0) {
      sentences.push(`The workflow includes ${reqs.join(' and ')}.`);
    }
  }
  
  // Ensure we have 3-5 sentences
  if (sentences.length < 3) {
    sentences.push(`This workflow is designed to automate the specified task efficiently.`);
  }
  if (sentences.length > 5) {
    return sentences.slice(0, 5).join(' ');
  }
  
  return sentences.join(' ');
}

/**
 * Build final prompt from user answers
 */
/**
 * Build final prompt from user answers (clean version without question responses)
 * FIX: Properly extract answer text from objects to avoid [object Object]
 */
function buildFinalPromptFromAnswers(originalPrompt: string, answers: Record<string, string | object>): string {
  console.log('[PHASE] FINAL_PROMPT_MERGE - Starting prompt merge');
  
  // CRITICAL FIX: Extract answer text properly from objects/strings
  const extractAnswerText = (value: string | object): string | null => {
    // If it's already a string, return it
    if (typeof value === 'string') {
      // Check if it's a JSON string that needs parsing
      if (value.trim().startsWith('{') && value.includes('"answer"')) {
        try {
          const parsed = JSON.parse(value);
          if (parsed.answer && typeof parsed.answer === 'string') {
            return parsed.answer;
          }
        } catch (e) {
          // Not valid JSON, return as-is
        }
      }
      // Exclude question response format strings
      if (value.includes('{"question":') || value.includes('"answer":')) {
        try {
          const parsed = JSON.parse(value);
          if (parsed.answer && typeof parsed.answer === 'string') {
            return parsed.answer;
          }
        } catch (e) {
          // Not valid JSON, skip it
          return null;
        }
      }
      return value;
    }
    
    // If it's an object, extract the answer field
    if (typeof value === 'object' && value !== null) {
      const obj = value as any;
      // Try common answer field names
      if (obj.answer && typeof obj.answer === 'string') {
        return obj.answer;
      }
      if (obj.value && typeof obj.value === 'string') {
        return obj.value;
      }
      if (obj.text && typeof obj.text === 'string') {
        return obj.text;
      }
      // If no answer field, skip this entry
      console.warn('[PHASE] FINAL_PROMPT_MERGE - Object without answer field:', Object.keys(obj));
      return null;
    }
    
    return null;
  };
  
  // Filter and extract meaningful answers
  const meaningfulAnswers = Object.entries(answers)
    .filter(([key, value]) => {
      // Exclude credentials (handled separately)
      if (key.toLowerCase().includes('credential') || 
          key.toLowerCase().includes('webhook') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('api_key') ||
          key.toLowerCase().includes('secret')) {
        return false;
      }
      
      // Extract answer text
      const answerText = extractAnswerText(value);
      return answerText !== null && answerText.trim() !== '';
    })
    .map(([key, value]) => {
      const answerText = extractAnswerText(value);
      if (!answerText) return null;
      
      // Convert meaningful answers to natural language
      const keyLower = key.toLowerCase();
      if (keyLower.includes('channel')) {
        return `Slack channel: ${answerText}`;
      }
      if (keyLower.includes('format')) {
        return `Format: ${answerText}`;
      }
      if (keyLower.includes('trigger')) {
        return `Trigger: ${answerText}`;
      }
      if (keyLower.includes('schedule')) {
        return `Schedule: ${answerText}`;
      }
      if (keyLower.includes('destination') || keyLower.includes('output')) {
        return `Output: ${answerText}`;
      }
      // Default: use the answer text directly
      return answerText;
    })
    .filter((text): text is string => text !== null);
  
  // Build clean prompt
  let finalPrompt = originalPrompt;
  if (meaningfulAnswers.length > 0) {
    const answersText = meaningfulAnswers.join('. ');
    finalPrompt = `${originalPrompt}. ${answersText}.`;
    console.log('[PHASE] FINAL_PROMPT_MERGE - Merged answers:', answersText.substring(0, 100));
  } else {
    console.log('[PHASE] FINAL_PROMPT_MERGE - No meaningful answers to merge');
  }
  
  console.log('[PHASE] FINAL_PROMPT_READY - Final prompt:', finalPrompt.substring(0, 200));
  return finalPrompt;
}

/**
 * Generate credential instructions for user
 */
function generateCredentialInstructions(analysis: any): string {
  const instructions: string[] = [];

  if (analysis.existingAuthCoverage && analysis.existingAuthCoverage.length > 0) {
    instructions.push(`✅ ${analysis.existingAuthCoverage.length} credential(s) will use your existing authentication.`);
  }

  if (analysis.autoResolvable && analysis.autoResolvable.length > 0) {
    instructions.push(`⚙️  ${analysis.autoResolvable.length} credential(s) will be auto-configured from environment variables.`);
  }

  if (analysis.requiredCredentials && analysis.requiredCredentials.length > 0) {
    instructions.push(`🔑 Please provide ${analysis.requiredCredentials.length} required credential(s) to complete the workflow.`);
  }

  return instructions.join(' ');
}

/**
 * @deprecated Use workflowLifecycleManager.injectCredentials instead
 * This function is kept for backward compatibility but should not be used.
 * All credential injection should go through the lifecycle manager which uses connector registry.
 * 
 * NOTE: This function should be removed once all callers are migrated to lifecycle manager.
 */
async function injectCredentialsIntoWorkflow(
  workflow: { nodes: WorkflowNode[]; edges: any[] },
  credentials: Record<string, string | object>
): Promise<{ nodes: WorkflowNode[]; edges: any[] }> {
  console.warn('[DEPRECATED] injectCredentialsIntoWorkflow is deprecated. Use workflowLifecycleManager.injectCredentials instead.');
  // Delegate to lifecycle manager
  const { workflowLifecycleManager } = await import('../services/workflow-lifecycle-manager');
  const result = await workflowLifecycleManager.injectCredentials(workflow, credentials);
  return result.workflow;
}

/**
 * Check if a field name indicates it's a credential field
 */
function isCredentialField(fieldName: string): boolean {
  const fieldLower = fieldName.toLowerCase();
  const credentialPatterns = [
    'apikey', 'api_key', 'api-key',
    'token', 'access_token', 'auth_token',
    'secret', 'client_secret', 'secret_key',
    'webhook', 'webhookurl', 'webhook_url',
    'password', 'passwd',
    'credential', 'credentials',
    'auth', 'authorization',
    'key', 'private_key', 'public_key',
    'bearer', 'oauth',
  ];
  
  return credentialPatterns.some(pattern => fieldLower.includes(pattern));
}

/**
 * Extract credentials from generated nodes by checking their required fields
 * This ensures we identify ALL credentials needed, not just those from requirements analysis
 * ENHANCED: Uses comprehensive node credential requirements mapping
 */
function extractCredentialsFromNodes(workflow: { nodes: WorkflowNode[] }): string[] {
  const credentials: string[] = [];
  const credentialMap = new Map<string, string>(); // Map to normalize and deduplicate
  
  // Import node credential requirements
  let nodeCredentialRequirements: any = null;
  try {
    nodeCredentialRequirements = require('../services/ai/node-credential-requirements');
  } catch (error) {
    console.warn('⚠️  Node credential requirements module not available, using fallback');
  }
  
  for (const node of workflow.nodes || []) {
    // CRITICAL FIX: Use normalizeNodeType to get actual node type (handles 'custom' type)
    const nodeType = normalizeNodeType(node);
    const config = node.data?.config || {};
    
    if (!nodeType) {
      console.warn(`⚠️  [Credential Extraction] Node ${node.id} has no type, skipping`);
      continue;
    }
    
    // ENHANCED: Use comprehensive credential requirements mapping
    if (nodeCredentialRequirements) {
      const requirements = nodeCredentialRequirements.getNodeCredentialRequirements(nodeType);
      if (requirements && requirements.requiredCredentials) {
        for (const credField of requirements.requiredCredentials) {
          const fieldName = credField.fieldName;
          const fieldValue = config[fieldName];
          
          // Check if credential is missing or empty
          // Type guard: ensure fieldValue is a string before calling string methods
          const isStringValue = typeof fieldValue === 'string';
          const isEmpty = !fieldValue || 
                         (isStringValue && (
                           fieldValue.trim() === '' || 
                           (fieldValue.startsWith('{{') && fieldValue.endsWith('}}'))
                         ));
          
          if (isEmpty) {
            // Normalize credential name
            const normalizedName = credField.displayName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
            if (!credentialMap.has(normalizedName)) {
              credentialMap.set(normalizedName, normalizedName);
              credentials.push(normalizedName);
              console.log(`🔑 [Credential Extraction] Node ${nodeType} requires: ${normalizedName} (field: ${fieldName})`);
            }
          }
        }
        continue; // Skip fallback logic if we found requirements
      }
    }
    
    // FALLBACK: Get node schema from library
    const schema = nodeLibrary.getSchema(nodeType);
    if (!schema || !schema.configSchema) {
      continue;
    }
    
    const requiredFields = schema.configSchema.required || [];
    
    // CRITICAL: For Google services, check for identifier fields (spreadsheetId, documentId, from)
    // These are NOT OAuth credentials but are required identifiers
    if (nodeType === 'google_sheets' && requiredFields.includes('spreadsheetId')) {
      const spreadsheetId = config['spreadsheetId'];
      const isEmpty = !spreadsheetId || 
                     (typeof spreadsheetId === 'string' && (
                       spreadsheetId.trim() === '' || 
                       (spreadsheetId.startsWith('{{') && spreadsheetId.endsWith('}}'))
                     ));
      if (isEmpty) {
        const normalizedName = 'GOOGLE_SHEETS_URL_OR_ID';
        if (!credentialMap.has(normalizedName)) {
          credentialMap.set(normalizedName, normalizedName);
          credentials.push(normalizedName);
          console.log(`🔑 [Credential Extraction] Node ${nodeType} requires: ${normalizedName} (field: spreadsheetId)`);
        }
      }
    }
    
    if (nodeType === 'google_doc' && requiredFields.includes('documentId')) {
      const documentId = config['documentId'];
      const isEmpty = !documentId || 
                     (typeof documentId === 'string' && (
                       documentId.trim() === '' || 
                       (documentId.startsWith('{{') && documentId.endsWith('}}'))
                     ));
      if (isEmpty) {
        const normalizedName = 'GOOGLE_DOCS_URL_OR_ID';
        if (!credentialMap.has(normalizedName)) {
          credentialMap.set(normalizedName, normalizedName);
          credentials.push(normalizedName);
          console.log(`🔑 [Credential Extraction] Node ${nodeType} requires: ${normalizedName} (field: documentId)`);
        }
      }
    }
    
    // ✅ PRODUCTION: Use connector registry to determine if "from" field is credential-related
    // Gmail "from" field is a configuration field, not a credential (OAuth handles auth)
    // This is handled by connector registry - no special case needed
    
    // ✅ PRODUCTION: Use connector registry instead of hardcoded logic
    // Credential extraction should be done via credential discovery phase, not here
    // This function is kept for backward compatibility but should use connector registry
    const { connectorRegistry } = require('../services/connectors/connector-registry');
    const connector = connectorRegistry.getConnectorByNodeType(nodeType);
    
    // Check each required field to see if it's a credential
    for (const fieldName of requiredFields) {
      // ✅ PRODUCTION: Use connector to determine if field is credential-related
      // If connector exists, only extract credentials that match the connector's contract
      if (connector) {
        const credentialContract = connector.credentialContract;
        // Skip fields that don't match the connector's credential type
        // This ensures strict isolation (e.g., SMTP fields won't be extracted for Gmail)
        const fieldLower = fieldName.toLowerCase();
        if (credentialContract.type === 'oauth' && 
            (fieldLower.includes('smtp') || fieldLower.includes('host') || 
             fieldLower.includes('username') || fieldLower.includes('password'))) {
          // OAuth connector should not have SMTP fields
          continue;
        }
        if (credentialContract.type === 'api_key' && 
            (fieldLower.includes('oauth') || fieldLower.includes('client_id') || 
             fieldLower.includes('access_token'))) {
          // API key connector should not have OAuth fields
          continue;
        }
      }
      
      if (isCredentialField(fieldName)) {
        const value = config[fieldName];
        
        // Check if field is empty or has invalid ENV placeholder
        const isEmpty = value === undefined || 
                       value === null || 
                       (typeof value === 'string' && (
                         value.trim() === '' || 
                         (value.includes('{{ENV.') && !value.includes('{{$json') && !value.includes('{{input') && !value.includes('{{trigger'))
                       ));
        
        if (isEmpty) {
          // Normalize credential name
          let credName = fieldName.toUpperCase();
          
          // Map common field names to standard credential names
          if (credName.includes('WEBHOOK') || credName.includes('WEBHOOKURL')) {
            if (nodeType.includes('slack')) {
              credName = 'SLACK_WEBHOOK_URL';
            } else if (nodeType.includes('discord')) {
              credName = 'DISCORD_WEBHOOK_URL';
            } else {
              credName = 'WEBHOOK_URL';
            }
          } else if (credName.includes('SLACK') && credName.includes('TOKEN')) {
            credName = 'SLACK_BOT_TOKEN';
          } else if (credName.includes('API') && credName.includes('KEY')) {
            // Try to infer service from node type
            if (nodeType.includes('slack')) {
              credName = 'SLACK_API_KEY';
            } else {
              credName = 'API_KEY';
            }
          }
          
          // ✅ PRODUCTION: Use connector to validate credential type
          // This ensures Gmail credentials don't satisfy SMTP requirements and vice versa
          if (connector) {
            const credentialContract = connector.credentialContract;
            const credNameLower = credName.toLowerCase();
            // Reject credentials that don't match connector type
            if (credentialContract.type === 'oauth' && 
                (credNameLower.includes('smtp') || credNameLower.includes('host') || 
                 credNameLower.includes('username') || credNameLower.includes('password'))) {
              console.log(`🔑 [Credential Extraction] Skipping SMTP credential "${credName}" for ${nodeType} (connector uses ${credentialContract.type})`);
              continue;
            }
          }
          
          // Store normalized credential
          if (!credentialMap.has(credName)) {
            credentialMap.set(credName, credName);
          }
        }
      }
    }
  }
  
  return Array.from(credentialMap.values());
}

/**
 * UNIVERSAL: Check for missing required fields in workflow nodes using node library schemas
 * Works for ALL node types automatically - no hardcoded rules
 * ENHANCED: Separates credential fields from regular configuration fields
 */
function checkMissingRequiredFields(workflow: { nodes: WorkflowNode[] }): {
  hasMissingFields: boolean;
  questions: Array<{ id: string; text: string; type: string; nodeId: string; nodeLabel: string; fieldName: string; category: string; options?: Array<{ label: string; value: string }> }>;
  credentialFields: string[]; // NEW: List of credential field names found
} {
  const questions: Array<{ id: string; text: string; type: string; nodeId: string; nodeLabel: string; fieldName: string; category: string; options?: Array<{ label: string; value: string }> }> = [];
  const credentialFields: string[] = [];
  
  for (const node of workflow.nodes || []) {
    // CRITICAL FIX: Use normalizeNodeType to get actual node type
    const nodeType = normalizeNodeType(node);
    const nodeLabel = node.data?.label || nodeType;
    const nodeId = node.id;
    const config = node.data?.config || {};
    
    // Get node schema from library (UNIVERSAL - works for all nodes)
    const schema = nodeLibrary.getSchema(nodeType);
    if (!schema || !schema.configSchema) {
      console.warn(`⚠️  No schema found for node type: ${nodeType} (node.type="${node.type}", node.data.type="${node.data?.type || 'undefined'}") - skipping required field check`);
      continue; // Skip if no schema found
    }
    
    const requiredFields = schema.configSchema.required || [];
    
    // Check each required field using schema information (UNIVERSAL)
    for (const fieldName of requiredFields) {
      const value = config[fieldName];
      
      // Check if field is empty or has invalid ENV placeholder
      // CRITICAL: Also check for common placeholder patterns that indicate missing values
      const isEmpty = value === undefined || 
                     value === null || 
                     (typeof value === 'string' && (
                       value.trim() === '' || 
                       // Check for ENV placeholders that aren't resolved
                       (value.includes('{{ENV.') && !value.includes('{{$json') && !value.includes('{{input') && !value.includes('{{trigger')) ||
                       // Check for common placeholder patterns
                       value.toLowerCase().includes('placeholder') ||
                       value.toLowerCase().includes('enter ') ||
                       value.toLowerCase().includes('your ') ||
                       value.toLowerCase().includes('example') ||
                       value.toLowerCase().startsWith('https://example') ||
                       value.toLowerCase().startsWith('http://example') ||
                       // Check for empty template variables
                       (value.startsWith('{{') && value.endsWith('}}') && value.includes('ENV.'))
                     ));
      
      if (isEmpty) {
        // ✅ PRODUCTION: Use connector registry to determine if field should be skipped
        // This ensures strict connector isolation (no SMTP fields for OAuth connectors, etc.)
        const { connectorRegistry } = require('../services/connectors/connector-registry');
        const connector = connectorRegistry.getConnectorByNodeType(nodeType);
        if (connector) {
          const credentialContract = connector.credentialContract;
          const fieldNameLower = fieldName.toLowerCase();
          // Skip fields that don't match connector type
          if (credentialContract.type === 'oauth' && 
              (fieldNameLower.includes('smtp') || fieldNameLower.includes('host') || 
               fieldNameLower.includes('username') || fieldNameLower.includes('password'))) {
            console.log(`🔑 [Question Filter] Skipping SMTP field "${fieldName}" for ${nodeType} (connector uses ${credentialContract.type})`);
            continue;
          }
        }
        
        // Check if this is a credential field
        const isCredential = isCredentialField(fieldName);
        
        if (isCredential) {
          // Track credential fields separately
          credentialFields.push(fieldName);
        }
        
        // Get field information from schema (UNIVERSAL - uses schema data)
        const fieldInfo = schema.configSchema.optional?.[fieldName];
        const fieldDescription = fieldInfo?.description || fieldName;
        const fieldType = fieldInfo?.type || 'string';
        const fieldExamples = fieldInfo?.examples || [];
        
        // Generate question text from schema (UNIVERSAL)
        const questionText = generateQuestionTextFromSchema(
          nodeLabel,
          fieldName,
          fieldDescription,
          fieldType,
          fieldExamples,
          schema.label
        );
        
        // Determine input type from schema (UNIVERSAL)
        // Use password type for credential fields
        const inputType = isCredential ? 'password' : determineInputTypeFromSchema(fieldName, fieldType, fieldInfo);
        
        // Get options if it's a select field (UNIVERSAL)
        const options = getFieldOptions(fieldInfo, fieldExamples);
        
        questions.push({
          id: `req_${nodeId}_${fieldName}`,
          text: questionText,
          type: inputType,
          nodeId,
          nodeLabel,
          fieldName,
          category: isCredential ? 'credential' : 'configuration',
          options: options.length > 0 ? options : undefined,
        });
      }
    }
  }
  
  return {
    hasMissingFields: questions.length > 0,
    questions,
    credentialFields,
  };
}

/**
 * UNIVERSAL: Generate question text from schema information
 */
function generateQuestionTextFromSchema(
  nodeLabel: string,
  fieldName: string,
  fieldDescription: string,
  fieldType: string,
  fieldExamples: any[],
  nodeTypeLabel: string
): string {
  // Use field description from schema, or create a friendly one
  const friendlyFieldName = fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  let questionText = `Please provide the ${friendlyFieldName}`;
  
  // Add description if available
  if (fieldDescription && fieldDescription !== fieldName) {
    questionText += ` (${fieldDescription})`;
  }
  
  questionText += ` for "${nodeLabel}"`;
  
  // Add examples if available
  if (fieldExamples && fieldExamples.length > 0) {
    const exampleText = fieldExamples.slice(0, 2).map(ex => 
      typeof ex === 'string' ? ex : JSON.stringify(ex)
    ).join(', ');
    questionText += `. Examples: ${exampleText}`;
  }
  
  // Add type-specific hints
  if (fieldType === 'number') {
    questionText += ' (enter a number)';
  } else if (fieldType === 'boolean') {
    questionText += ' (true or false)';
  } else if (fieldType === 'array') {
    questionText += ' (enter as JSON array)';
  } else if (fieldType === 'object') {
    questionText += ' (enter as JSON object)';
  }
  
  return questionText;
}

/**
 * UNIVERSAL: Determine input type from schema field information
 */
function determineInputTypeFromSchema(
  fieldName: string,
  fieldType: string,
  fieldInfo?: any
): string {
  // Check if field has options (select field)
  if (fieldInfo?.options || (Array.isArray(fieldInfo?.examples) && fieldInfo.examples.length > 0 && fieldInfo.examples.length <= 10)) {
    return 'select';
  }
  
  // Check field name patterns
  const fieldNameLower = fieldName.toLowerCase();
  if (fieldNameLower.includes('url') || fieldNameLower.includes('endpoint') || fieldNameLower.includes('id')) {
    return 'text';
  }
  if (fieldNameLower.includes('email') || fieldNameLower.includes('to') || fieldNameLower.includes('from')) {
    return 'text';
  }
  if (fieldNameLower.includes('message') || fieldNameLower.includes('text') || fieldNameLower.includes('body') || fieldNameLower.includes('content') || fieldNameLower.includes('description')) {
    return 'textarea';
  }
  if (fieldNameLower.includes('code') || fieldNameLower.includes('script') || fieldNameLower.includes('query')) {
    return 'textarea';
  }
  if (fieldNameLower.includes('subject') || fieldNameLower.includes('title')) {
    return 'text';
  }
  
  // Check field type
  if (fieldType === 'number') {
    return 'number';
  }
  if (fieldType === 'boolean') {
    return 'select'; // Will show true/false options
  }
  if (fieldType === 'array' || fieldType === 'object') {
    return 'textarea'; // JSON input
  }
  
  // Default to text
  return 'text';
}

/**
 * UNIVERSAL: Get field options for select inputs
 */
function getFieldOptions(fieldInfo?: any, examples?: any[]): Array<{ label: string; value: string }> {
  const options: Array<{ label: string; value: string }> = [];
  
  // Check if fieldInfo has options array
  if (fieldInfo?.options && Array.isArray(fieldInfo.options)) {
    fieldInfo.options.forEach((opt: any) => {
      if (typeof opt === 'string') {
        options.push({ label: opt, value: opt });
      } else if (opt && typeof opt === 'object' && opt.value) {
        options.push({ label: opt.label || opt.value, value: opt.value });
      }
    });
  }
  
  // Use examples as options if available and limited
  if (options.length === 0 && examples && examples.length > 0 && examples.length <= 10) {
    examples.forEach((ex: any) => {
      const value = typeof ex === 'string' ? ex : JSON.stringify(ex);
      options.push({ label: value, value });
    });
  }
  
  // Add boolean options if type is boolean
  if (options.length === 0 && fieldInfo?.type === 'boolean') {
    options.push({ label: 'True', value: 'true' });
    options.push({ label: 'False', value: 'false' });
  }
  
  return options;
}

export default async function generateWorkflow(req: Request, res: Response) {
  try {
    const { prompt, refinedPrompt, mode = 'create', currentWorkflow, executionHistory, answers } = req.body;

    // Use refinedPrompt if prompt is not provided (for create mode from frontend)
    const finalPrompt = prompt || refinedPrompt;

    if (!finalPrompt || typeof finalPrompt !== 'string' || !finalPrompt.trim()) {
      return res.status(400).json({ 
        error: 'Prompt is required',
        details: 'Please provide a description of the workflow you want to generate.'
      });
    }

    // Handle analyze mode - Step 2: Questions for confirming
    if (mode === 'analyze') {
      try {
        // ⚡ FAST MODE: Use pattern matching for instant question generation
        // Full LLM analysis happens AFTER questions are answered (in refine/create mode)
        console.log('⚡ Using FAST question generation (pattern matching) for instant response');
        const analysis = enhancedWorkflowAnalyzer.fastAnalyzePromptWithNodeOptions(finalPrompt, {
          existingWorkflow: currentWorkflow,
        });

        // ⚡ AUTO-CONTINUE FLAG: If no questions, signal frontend to auto-continue
        const hasNoQuestions = !analysis.questions || analysis.questions.length === 0;
        
        return res.json({
          summary: analysis.summary,
          questions: analysis.questions,
          prompt: prompt,
          nodeOptionsDetected: analysis.nodeOptionsDetected,
          hasNodeChoices: analysis.hasNodeChoices,
          autoContinue: hasNoQuestions, // Signal frontend to auto-continue
        });
      } catch (error) {
        console.error('Analysis error:', error);
        // Return fallback questions on error - use a simple fallback
        return res.json({
          summary: `Build an automated workflow to accomplish: ${finalPrompt.substring(0, 100)}`,
          questions: [
            {
              id: 'q1',
              text: 'When should this workflow run?',
              options: ['Fixed Schedule', 'Regular Intervals', 'Event Trigger', 'Manual Run'],
              category: 'schedule',
            },
          ],
          prompt: finalPrompt,
        });
      }
    }

    // Handle refine mode - Step 3 & 4: Generate system prompt and extract requirements
    // NEW: Support phased credential-aware approach
    if (mode === 'refine') {
      try {
        const usePhasedApproach = req.body.usePhasedApproach !== false; // Default to true
        
        if (usePhasedApproach) {
          return await handlePhasedRefine(req, res, finalPrompt, answers);
        }

        // Legacy refine mode (backward compatibility)
        // Combine prompt with answers
        const refinedPrompt = answers && Object.keys(answers).length > 0
          ? `${finalPrompt}\n\nUser answers: ${JSON.stringify(answers)}`
          : finalPrompt;

        // Step 3: Generate system prompt (20-30 words) - handled by workflow builder
        // Step 4: Extract requirements using RequirementsExtractor
        const requirements = await requirementsExtractor.extractRequirements(
          finalPrompt,
          refinedPrompt,
          answers
        );

        // Generate system prompt from refined prompt
        const systemPromptWords = refinedPrompt.split(/\s+/).slice(0, 30);
        const systemPrompt = systemPromptWords.length >= 20
          ? systemPromptWords.join(' ')
          : `${systemPromptWords.join(' ')}. Build an automated workflow to accomplish this task.`;

        // Identify required credentials based on requirements and answers
        const requiredCredentials = identifyRequiredCredentialsFromRequirements(requirements, finalPrompt, answers);
        
        console.log('🔑 [Backend] Refine mode - Identified required credentials:', requiredCredentials);
        console.log('📋 [Backend] Requirements:', JSON.stringify(requirements, null, 2));
        console.log('💬 [Backend] Answers:', JSON.stringify(answers, null, 2));
        console.log('📝 [Backend] Prompt:', finalPrompt.substring(0, 200));

        return res.json({
          refinedPrompt: refinedPrompt,
          systemPrompt: systemPrompt,
          requirements: requirements,
          requiredCredentials: requiredCredentials, // Add required credentials to response
          prompt: finalPrompt,
        });
      } catch (error) {
        console.error('Refinement error:', error);
        return res.json({
          refinedPrompt: finalPrompt,
          systemPrompt: `Build an automated workflow to accomplish: ${finalPrompt.substring(0, 100)}`,
          requirements: {
            urls: [],
            apis: [],
            credentials: [],
            schedules: [],
            platforms: [],
            dataFormats: [],
            errorHandling: [],
            notifications: [],
          },
          prompt: prompt,
        });
      }
    }

    // Handle create mode - Step 5-7: Build, Validate, Output
    const streamProgress = req.headers['x-stream-progress'] === 'true';
    
    // ✅ Declare variables in outer scope for fallback detection (accessible in both streaming and non-streaming modes)
    let lifecycleResult: any;
    let pipelineResultFromError: any = null;
    
    try {
      if (streamProgress) {
        // Enable streaming progress updates
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendProgress = (progress: { step: number; stepName: string; progress: number; details?: any }) => {
          res.write(JSON.stringify({
            current_phase: progress.stepName.toLowerCase(),
            step: progress.step,
            step_name: progress.stepName,
            progress_percentage: progress.progress,
            details: progress.details
          }) + '\n');
        };

        // ✅ Declare variables in outer scope for fallback detection
        let lifecycleResult: any;
        let pipelineResultFromError: any = null;
        
        try {
          // 🧠 MEMORY INTEGRATION: Get context from memory system before generation
          let memoryContext = null;
          let enhancedPrompt = finalPrompt;
          try {
            const referenceBuilder = getReferenceBuilder();
            memoryContext = await referenceBuilder.buildContext(
              currentWorkflow?.id || null,
              currentWorkflow ? 'modification' : 'creation',
              finalPrompt
            );

            // Enhance prompt with similar workflows if available
            if (memoryContext.similarPatterns && memoryContext.similarPatterns.length > 0) {
              const similarWorkflows = memoryContext.similarPatterns
                .slice(0, 3) // Use top 3 similar workflows
                .map((pattern: any) => `- ${pattern.name} (similarity: ${(pattern.similarity * 100).toFixed(0)}%)`)
                .join('\n');
              
              enhancedPrompt = `${finalPrompt}\n\nSimilar workflows found:\n${similarWorkflows}\n\nUse these as reference patterns but adapt to the current request.`;
              console.log(`🧠 [Memory] Found ${memoryContext.similarPatterns.length} similar workflows`);
            }
          } catch (memoryError) {
            // Graceful degradation: continue without memory if it fails
            console.warn('⚠️  [Memory] Failed to get memory context, continuing without it:', memoryError instanceof Error ? memoryError.message : String(memoryError));
          }

          // ✅ PRODUCTION FLOW: Use WorkflowLifecycleManager
          // Step 1: Generate workflow graph (DAG only)
          sendProgress({ step: 5, stepName: 'Generating Workflow Graph', progress: 60, details: { message: 'Creating workflow structure...' } });
          
          try {
            lifecycleResult = await workflowLifecycleManager.generateWorkflowGraph(
              enhancedPrompt,
              {
                currentWorkflow,
                executionHistory,
                answers,
                memoryContext,
                ...req.body.config,
              }
            );
          } catch (lifecycleError: any) {
            // ✅ Preserve pipeline result from error for fallback detection
            if (lifecycleError?.pipelineResult) {
              pipelineResultFromError = lifecycleError.pipelineResult;
            }
            throw lifecycleError; // Re-throw to be caught by outer catch
          }

          const finalWorkflow = lifecycleResult.workflow;
          const validation = lifecycleResult.validation;
          
          // Step 2: Credential discovery (already done in generateWorkflowGraph, AFTER graph creation)
          sendProgress({ step: 6, stepName: 'Discovering Credentials', progress: 90, details: { message: 'Identifying required credentials...' } });
          
          // Get user ID for credential vault checks
          let userId: string | undefined;
          try {
            const supabase = getSupabaseClient();
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
              const token = authHeader.replace('Bearer ', '').trim();
              if (token) {
                const { data: { user }, error: authError } = await supabase.auth.getUser(token);
                if (!authError && user) {
                  userId = user.id;
                }
              }
            }
          } catch (error) {
            console.warn('[GenerateWorkflow] Could not get user ID:', error);
          }
          
          // ✅ PRODUCTION FLOW: Return workflow graph + discovered credentials
          // NO credential questions before generation - credentials are discovered AFTER graph creation
          sendProgress({ step: 7, stepName: 'Complete', progress: 100, details: { message: 'Workflow generated successfully' } });
          
          // ✅ CRITICAL: Only return MISSING credentials - satisfied OAuth won't appear
          // ✅ STRICT: NEVER ask for Google OAuth in configuration - user connects via header bar
          const missingCredentials = (lifecycleResult.requiredCredentials.missingCredentials || [])
            .filter((cred: any) => {
              // ✅ STRICT FILTER: Exclude ALL Google OAuth credentials from configuration modal
              const isGoogleOAuth = (cred.provider?.toLowerCase() === 'google' && cred.type === 'oauth') ||
                                    (cred.vaultKey?.toLowerCase() === 'google' && cred.type === 'oauth');
              if (isGoogleOAuth) {
                console.log(`[GenerateWorkflow] ✅ Filtering out Google OAuth from configuration: ${cred.displayName || cred.vaultKey}`);
                return false; // Exclude Google OAuth
              }
              return true; // Include all other credentials
            });
          const discoveredInputs = lifecycleResult.requiredInputs.inputs || [];
          
          // Format discovered credentials for frontend (only missing, no Google OAuth)
          const discoveredCredentials = missingCredentials.map((cred: any) => ({
            provider: cred.provider,
            type: cred.type,
            scopes: cred.scopes,
            vaultKey: cred.vaultKey,
            displayName: cred.displayName,
            required: cred.required,
            satisfied: false, // All are missing
            nodeTypes: cred.nodeTypes,
            nodeIds: cred.nodeIds,
          }));
          
          // Format discovered inputs for frontend
          const formattedInputs = discoveredInputs.map((input: any) => ({
            id: `input_${input.nodeId}_${input.fieldName}`,
            nodeId: input.nodeId,
            nodeType: input.nodeType,
            nodeLabel: input.nodeLabel,
            fieldName: input.fieldName,
            fieldType: input.fieldType,
            label: `${input.nodeLabel} - ${input.fieldName}`,
            description: input.description,
            required: input.required,
            defaultValue: input.defaultValue,
            examples: input.examples,
            type: input.fieldType === 'textarea' ? 'textarea' : 'text',
            category: 'configuration',
          }));
          
          // ✅ PRODUCTION FLOW: Return workflow graph + discovered inputs + missing credentials
          // Frontend will show credential modal ONLY when phase === "ready"
          const comprehensiveQuestions = generateComprehensiveNodeQuestions(finalWorkflow, {}).questions;
          res.write(JSON.stringify({
            success: true,
            status: 'completed',
            phase: 'ready', // ✅ CRITICAL: Must be "ready" for frontend to show credentials
            workflow: finalWorkflow,
            nodes: finalWorkflow.nodes,
            edges: finalWorkflow.edges,
            discoveredInputs: formattedInputs, // Node inputs (to, subject, body, etc.)
            discoveredCredentials: discoveredCredentials, // ✅ Only MISSING credentials
            requiredCredentials: discoveredCredentials.map((c: any) => c.vaultKey), // Legacy format
            comprehensiveQuestions,
            documentation: lifecycleResult.documentation,
            suggestions: lifecycleResult.suggestions || [],
            estimatedComplexity: lifecycleResult.estimatedComplexity,
            validation: {
              valid: validation.valid,
              errors: validation.errors.map((e: any) => e.message),
              warnings: validation.warnings.map((w: any) => w.message),
            },
          }) + '\n');
          res.end();
          return;
        } catch (buildError) {
          res.write(JSON.stringify({
            status: 'error',
            error: buildError instanceof Error ? buildError.message : 'Workflow generation failed'
          }) + '\n');
          res.end();
        }
      } else {
        // Non-streaming mode
        // 🧠 MEMORY INTEGRATION: Get context from memory system before generation
        let memoryContext = null;
        let enhancedPrompt = finalPrompt;
        try {
          const referenceBuilder = getReferenceBuilder();
          memoryContext = await referenceBuilder.buildContext(
            currentWorkflow?.id || null,
            currentWorkflow ? 'modification' : 'creation',
            finalPrompt
          );

          // Enhance prompt with similar workflows if available
          if (memoryContext.similarPatterns && memoryContext.similarPatterns.length > 0) {
            const similarWorkflows = memoryContext.similarPatterns
              .slice(0, 3) // Use top 3 similar workflows
              .map((pattern: any) => `- ${pattern.name} (similarity: ${(pattern.similarity * 100).toFixed(0)}%)`)
              .join('\n');
            
            enhancedPrompt = `${finalPrompt}\n\nSimilar workflows found:\n${similarWorkflows}\n\nUse these as reference patterns but adapt to the current request.`;
            console.log(`🧠 [Memory] Found ${memoryContext.similarPatterns.length} similar workflows`);
          }
        } catch (memoryError) {
          // Graceful degradation: continue without memory if it fails
          console.warn('⚠️  [Memory] Failed to get memory context, continuing without it:', memoryError instanceof Error ? memoryError.message : String(memoryError));
        }

        // ✅ PRODUCTION FLOW: Use WorkflowLifecycleManager
        try {
          lifecycleResult = await workflowLifecycleManager.generateWorkflowGraph(
            enhancedPrompt,
            {
              currentWorkflow,
              executionHistory,
              answers,
              memoryContext,
              ...req.body.config,
            }
          );
        } catch (lifecycleError: any) {
          // ✅ Preserve pipeline result from error for fallback detection
          if (lifecycleError?.pipelineResult) {
            pipelineResultFromError = lifecycleError.pipelineResult;
          }
          throw lifecycleError; // Re-throw to be caught by outer catch
        }

        const finalWorkflow = lifecycleResult.workflow;
        const validation = lifecycleResult.validation;
        
        // ✅ CRITICAL: Only return MISSING credentials - satisfied OAuth won't appear
        const missingCredentials = lifecycleResult.requiredCredentials.missingCredentials || [];
        const discoveredInputs = lifecycleResult.requiredInputs.inputs || [];
        
        // Format discovered inputs for frontend
        const formattedInputs = discoveredInputs.map((input: any) => ({
          id: `input_${input.nodeId}_${input.fieldName}`,
          nodeId: input.nodeId,
          nodeType: input.nodeType,
          nodeLabel: input.nodeLabel,
          fieldName: input.fieldName,
          fieldType: input.fieldType,
          label: `${input.nodeLabel} - ${input.fieldName}`,
          description: input.description,
          required: input.required,
          defaultValue: input.defaultValue,
          examples: input.examples,
          type: input.fieldType === 'textarea' ? 'textarea' : 'text',
          category: 'configuration',
        }));
        
        // Format discovered credentials for frontend (only missing)
        // ✅ STRICT: NEVER ask for Google OAuth in configuration - user connects via header bar
        const discoveredCredentials = missingCredentials
          .filter((cred: any) => {
            // ✅ STRICT FILTER: Exclude ALL Google OAuth credentials from configuration modal
            const isGoogleOAuth = (cred.provider?.toLowerCase() === 'google' && cred.type === 'oauth') ||
                                  (cred.vaultKey?.toLowerCase() === 'google' && cred.type === 'oauth');
            if (isGoogleOAuth) {
              console.log(`[GenerateWorkflow] ✅ Filtering out Google OAuth from configuration: ${cred.displayName || cred.vaultKey}`);
              return false; // Exclude Google OAuth
            }
            return true; // Include all other credentials
          })
          .map((cred: any) => ({
            provider: cred.provider,
            type: cred.type,
            scopes: cred.scopes,
            vaultKey: cred.vaultKey,
            displayName: cred.displayName,
            required: cred.required,
            satisfied: false, // All are missing
            nodeTypes: cred.nodeTypes,
            nodeIds: cred.nodeIds,
          }));
        
        // ✅ PRODUCTION FLOW: Return workflow graph + discovered inputs + missing credentials
        // NO credential questions before generation - credentials are discovered AFTER graph creation

        // Check if this is a chatbot workflow and generate page info
        const isChatbot = chatbotPageGenerator.isChatbotWorkflow(finalWorkflow);
        const baseUrl = process.env.PUBLIC_BASE_URL || `http://${req.get('host')}`;
        
        // Check if memory is enabled (has memory node)
        const hasMemoryNode = (finalWorkflow.nodes || []).some((node: any) => {
          const nodeType = node.type || node.data?.type || '';
          return nodeType.toLowerCase().includes('memory');
        });
        
        const chatbotPageInfo = isChatbot ? {
          hasChatbotPage: true,
          pageUrl: chatbotPageGenerator.getChatbotPageUrl('', baseUrl).replace('/workflows//page', `/workflows/{workflowId}/page`),
          embedUrl: chatbotPageGenerator.getChatbotEmbedUrl('', baseUrl).replace('/workflows//embed', `/workflows/{workflowId}/embed`),
          endpointUrl: chatbotPageGenerator.getChatbotEndpointUrl('', baseUrl).replace('/api/chatbot//message', `/api/chatbot/{workflowId}/message`),
          memoryEnabled: hasMemoryNode || true, // Default to true for chatbot workflows
          authEnabled: false, // Default to public, can be enabled per workflow
        } : null;

        // Credentials are already discovered via lifecycle manager (only missing ones)
        const allFinalCredentialsArray = discoveredCredentials.map((c: any) => c.vaultKey);
        
        // 🧠 MEMORY INTEGRATION: Store workflow in memory system after successful generation
        let storedWorkflowId: string | null = null;
        try {
          const memoryManager = getMemoryManager();
          // Extract workflow name from prompt or use default
          const workflowName = lifecycleResult.documentation 
            ? lifecycleResult.documentation.substring(0, 100)
            : finalPrompt.substring(0, 100);
          
          // Extract tags from prompt (simple keyword extraction)
          const tags = finalPrompt
            .toLowerCase()
            .split(/\s+/)
            .filter((word: string) => word.length > 4)
            .slice(0, 5);

          storedWorkflowId = await memoryManager.storeWorkflow({
            name: workflowName,
            definition: {
              id: randomUUID(),
              name: workflowName,
              nodes: finalWorkflow.nodes || [],
              edges: finalWorkflow.edges || [],
              settings: finalWorkflow.metadata,
              tags: tags,
            },
            tags: tags,
            settings: {
              complexity: lifecycleResult.estimatedComplexity,
              nodeCount: finalWorkflow.nodes?.length || 0,
              edgeCount: finalWorkflow.edges?.length || 0,
            },
          });
          console.log(`✅ [Memory] Stored workflow in memory system: ${storedWorkflowId}`);
        } catch (memoryError: unknown) {
          // Graceful degradation: continue even if storage fails
          console.warn('⚠️  [Memory] Failed to store workflow in memory system:', memoryError instanceof Error ? memoryError.message : String(memoryError));
        }
        
        return res.json({
          success: true,
          phase: 'ready', // ✅ CRITICAL: Must be "ready" for frontend
          workflow: finalWorkflow,
          nodes: finalWorkflow.nodes,
          edges: finalWorkflow.edges,
          documentation: lifecycleResult.documentation,
          suggestions: [...(lifecycleResult.suggestions || []), ...validation.warnings.map((w: any) => ({ type: 'warning', message: w.message }))],
          estimatedComplexity: lifecycleResult.estimatedComplexity,
          discoveredInputs: formattedInputs, // ✅ Node inputs (to, subject, body, etc.)
          discoveredCredentials: discoveredCredentials, // ✅ Only MISSING credentials
          requiredCredentials: allFinalCredentialsArray, // Legacy format for compatibility
          comprehensiveQuestions: generateComprehensiveNodeQuestions(finalWorkflow, {}).questions,
          validation: {
            valid: validation.valid,
            errors: validation.errors.map((e: any) => e.message),
            warnings: validation.warnings.map((w: any) => w.message),
            fixesApplied: validation.fixesApplied,
          },
          chatbotPage: chatbotPageInfo,
          memoryWorkflowId: storedWorkflowId, // Include memory system workflow ID
        });
      }
    } catch (error: any) {
      console.error('Workflow generation error:', error);
      
      // ✅ NEW BEHAVIOR: Only create fallback if expansion + generation both failed
      // Check if we have pipeline result with expansion info (from error or lifecycleResult)
      const pipelineResult = error?.pipelineResult || pipelineResultFromError || (lifecycleResult as any)?.analysis || null;
      const hasExpansionAttempted = pipelineResult?.expandedIntent !== undefined;
      const hasExpansionFailed = hasExpansionAttempted && pipelineResult?.expandedIntent?.requires_confirmation === true;
      const hasGenerationFailed = !lifecycleResult?.workflow || lifecycleResult.workflow.nodes.length === 0;
      
      // Only create fallback if BOTH expansion and generation failed
      const shouldCreateFallback = hasExpansionFailed && hasGenerationFailed;
      
      if (shouldCreateFallback) {
        console.warn('⚠️  [Fallback] Both expansion and generation failed - creating minimal fallback workflow');
        console.warn('⚠️  [Fallback] This is a last-resort fallback and may not match the intended workflow');
        console.warn('⚠️  [Fallback] Expansion attempted:', hasExpansionAttempted);
        console.warn('⚠️  [Fallback] Expansion failed:', hasExpansionFailed);
        console.warn('⚠️  [Fallback] Generation failed:', hasGenerationFailed);
        
        // Fallback: return basic workflow structure
        const basicWorkflow = {
          name: "Generated Workflow (Fallback)",
          summary: prompt.substring(0, 200),
          nodes: [
            {
              id: "trigger_1",
              type: "manual_trigger",
              position: { x: 250, y: 100 },
              data: {
                type: "manual_trigger",
                label: "Start",
                config: {}
              }
            },
            {
              id: "node_1",
              type: "set_variable",
              position: { x: 550, y: 100 },
              data: {
                type: "set_variable",
                label: "Process Data",
                config: {
                  variables: []
                }
              }
            }
          ],
          edges: [
            {
              id: "e1",
              source: "trigger_1",
              target: "node_1"
            }
          ]
        };

        return res.json({
          success: true,
          workflow: basicWorkflow,
          message: "⚠️  Workflow generation failed. This is a minimal fallback workflow that may not match your intended workflow. Please try again or provide more details.",
          isFallback: true, // ✅ Flag to indicate this is a fallback
          errors: lifecycleResult?.validation?.errors || [],
          warnings: [
            ...(lifecycleResult?.validation?.warnings || []),
            'This workflow was generated as a fallback due to generation failure. It may not match your intended workflow.'
          ],
          expandedIntent: (lifecycleResult as any)?.analysis?.expandedIntent || (lifecycleResult as any)?.expandedIntent,
        });
      } else {
        // Do not silently replace intended workflow
        // Return error instead of fallback
        console.error('❌ [Error] Workflow generation failed but fallback conditions not met');
        console.error('   Expansion attempted:', hasExpansionAttempted);
        console.error('   Expansion failed:', hasExpansionFailed);
        console.error('   Generation failed:', hasGenerationFailed);
        console.error('   Lifecycle result:', lifecycleResult ? 'exists' : 'missing');
        
        return res.status(500).json({
          success: false,
          error: 'Workflow generation failed',
          message: 'Failed to generate workflow. Please try again or provide more details.',
          details: error instanceof Error ? error.message : String(error),
          errors: lifecycleResult?.validation?.errors || [],
          warnings: lifecycleResult?.validation?.warnings || [],
          expandedIntent: (lifecycleResult as any)?.analysis?.expandedIntent || (lifecycleResult as any)?.expandedIntent,
        });
      }
    }
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[GenerateWorkflowError]', errorMsg);
    if (errorStack) console.error('[GenerateWorkflowError] Stack:', errorStack);
    console.error('[GenerateWorkflowError] Full error:', error);
    
    return res.status(500).json({
      error: errorMsg,
      details: 'Failed to generate workflow. Please try again or check the logs.',
      stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
    });
  }
}
