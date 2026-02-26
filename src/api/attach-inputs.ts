/**
 * Attach Node Inputs API Endpoint
 * 
 * This endpoint is called AFTER workflow generation to inject node configuration inputs
 * (templates, channels, recipients, prompts, etc.) into nodes.
 * 
 * Flow:
 * 1. User submits prompt
 * 2. Backend generates workflow graph
 * 3. Backend returns graph + required inputs + required credentials
 * 4. Frontend shows unified configuration modal
 * 5. User submits inputs → THIS ENDPOINT
 * 6. Backend injects inputs into nodes
 * 7. Frontend calls attach-credentials
 * 8. Auto-run workflow
 */

import { Request, Response } from 'express';
import { getSupabaseClient } from '../core/database/supabase-compat';
import { workflowLifecycleManager } from '../services/workflow-lifecycle-manager';
import { workflowValidator } from '../services/ai/workflow-validator';
import { nodeLibrary } from '../services/nodes/node-library';
import { normalizeNodeType } from '../core/utils/node-type-normalizer';
import { connectorRegistry } from '../services/connectors/connector-registry';
import { normalizeWorkflowGraph, validateNormalizedGraph } from '../core/utils/workflow-graph-normalizer';
import { ErrorCode, createError } from '../core/utils/error-codes';

export default async function attachInputsHandler(req: Request, res: Response) {
  try {
    // ✅ CRITICAL: Get workflowId from URL params (not body)
    const workflowId = req.params.workflowId || req.body.workflowId;
    const { inputs } = req.body;

    // ✅ CRITICAL: Log request for debugging
    console.log('[AttachInputs] Request received:', {
      workflowId,
      inputsKeys: inputs ? Object.keys(inputs) : [],
      inputsCount: inputs ? Object.keys(inputs).length : 0,
    });

    if (!workflowId) {
      console.error('[AttachInputs] Missing workflowId in params and body');
      return res.status(400).json({
        error: 'workflowId is required',
        details: 'workflowId must be provided in URL path or request body',
      });
    }

    if (!inputs || typeof inputs !== 'object') {
      console.error('[AttachInputs] Invalid inputs:', typeof inputs, inputs);
      return res.status(400).json(
        createError(
          ErrorCode.INVALID_INPUT_FORMAT,
          'inputs object is required',
          { 
            received: typeof inputs,
            expected: 'object',
            workflowId,
          }
        )
      );
    }

    // ✅ CRITICAL: Strip any credential fields from inputs
    // ✅ COMPREHENSIVE: BUT allow question IDs that wrap nodeId + fieldName
    // Supported prefixes:
    // - input_ (current unified wizard format)
    // - cred_ / op_ / config_ / resource_ (comprehensive question IDs)
    const sanitizedInputs: Record<string, any> = {};
    for (const [key, value] of Object.entries(inputs)) {
      // ✅ COMPREHENSIVE: Allow comprehensive question IDs - these are handled specially
      const isComprehensiveQuestionId = 
        key.startsWith('input_') ||
        key.startsWith('cred_') ||
        key.startsWith('op_') ||
        key.startsWith('config_') ||
        key.startsWith('resource_');
      
      if (isComprehensiveQuestionId) {
        // Allow comprehensive question IDs - they will be processed correctly later
        sanitizedInputs[key] = value;
        continue;
      }
      
      // Reject credential-shaped keys (but NOT comprehensive question IDs)
      const keyLower = key.toLowerCase();
      const isTokenButNotCredentialConfig =
        // Allow common non-credential config fields like maxTokens / tokenLimit
        keyLower.includes('maxtokens') ||
        keyLower.includes('tokenlimit') ||
        keyLower.includes('token_limit') ||
        keyLower.endsWith('_maxtokens') ||
        keyLower.endsWith('_tokenlimit') ||
        keyLower.endsWith('_token_limit');

      const isCredentialKey = 
        keyLower.includes('oauth') ||
        keyLower.includes('client_id') ||
        keyLower.includes('client_secret') ||
        (keyLower.includes('token') && !isTokenButNotCredentialConfig) ||
        keyLower.includes('secret') ||
        keyLower.includes('credential');
      
      if (isCredentialKey) {
        console.warn(`[AttachInputs] Rejected credential key "${key}" from inputs`);
        continue;
      }
      
      sanitizedInputs[key] = value;
    }
    
    // Use sanitized inputs
    const cleanInputs = Object.keys(sanitizedInputs).length > 0 ? sanitizedInputs : inputs;

    // Get current user
    const supabase = getSupabaseClient();
    const authHeader = req.headers.authorization;
    let userId: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      if (token) {
        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser(token);
          if (!authError && user) {
            userId = user.id;
          }
        } catch (authErr) {
          console.warn('[AttachInputs] Auth error (non-fatal):', authErr);
        }
      }
    }

    // Fetch workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      return res.status(404).json(
        createError(
          ErrorCode.WORKFLOW_NOT_FOUND,
          'Workflow not found',
          { workflowId, error: workflowError?.message }
        )
      );
    }

    // ✅ CRITICAL: Phase locking - prevent duplicate attach calls
    // Check phase field first (for execution phases), then fall back to status (for lifecycle)
    const currentPhase = workflow.phase || workflow.status || 'draft';
    const allowedPhases = ['draft', 'active', 'ready', 'configuring_inputs', 'configuring_credentials', 'discover_inputs', 'discover_credentials', 'ready_for_execution', 'complete', 'completed'];
    
    // Allow 'ready_for_execution' to be reset to 'configuring_inputs' when re-attaching inputs
    // This allows users to update inputs even after workflow is ready
    if (!allowedPhases.includes(currentPhase)) {
      if (currentPhase === 'executing') {
        return res.status(409).json(
          createError(
            ErrorCode.PHASE_LOCKED,
            'Workflow not in input configuration phase',
            { 
              currentPhase,
              workflowId,
              message: 'Workflow is currently executing. Cannot attach inputs.',
            },
            true // Recoverable - user can refresh
          )
        );
      } else {
        return res.status(400).json(
          createError(
            ErrorCode.INVALID_PHASE,
            'Workflow not in valid phase for input attachment',
            { 
              currentPhase,
              workflowId,
              allowedPhases,
              workflowStatus: workflow.status,
              workflowPhase: workflow.phase,
            }
          )
        );
      }
    }

    // Update phase to configuring_inputs (idempotent)
    // Keep status as 'active' but set phase to 'configuring_inputs'
    await supabase
      .from('workflows')
      .update({
        status: 'active', // Keep status as active (valid enum)
        phase: 'configuring_inputs', // Set phase for execution flow
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId);

    // ✅ CRITICAL: Use centralized graph normalizer
    // Handle both workflow.graph format and direct nodes/edges format
    let normalizedGraph: ReturnType<typeof normalizeWorkflowGraph>;
    try {
      // ✅ CRITICAL: Parse nodes/edges if they are JSON strings
      // Supabase JSON columns can be returned as strings or objects
      let parsedNodes = workflow.nodes;
      let parsedEdges = workflow.edges;
      
      if (typeof parsedNodes === 'string') {
        try {
          parsedNodes = JSON.parse(parsedNodes);
        } catch (parseError) {
          console.error('[AttachInputs] Failed to parse nodes JSON string:', parseError);
          parsedNodes = [];
        }
      }
      
      if (typeof parsedEdges === 'string') {
        try {
          parsedEdges = JSON.parse(parsedEdges);
        } catch (parseError) {
          console.error('[AttachInputs] Failed to parse edges JSON string:', parseError);
          parsedEdges = [];
        }
      }
      
      // ✅ CRITICAL: Workflow might have graph as object OR nodes/edges as separate fields
      // ✅ CRITICAL: Workflow might have graph as object OR nodes/edges as separate fields
      // Safe fallback: use graph if available, otherwise construct from nodes/edges
      const graphToNormalize = (workflow.graph && typeof workflow.graph === 'object' && Object.keys(workflow.graph).length > 0) 
        ? workflow.graph 
        : { 
            nodes: parsedNodes || [], 
            edges: parsedEdges || [] 
          };
      
      // ✅ DEBUG: Log node IDs BEFORE any normalization
      const nodeIdsBeforeAnyNormalization = (graphToNormalize.nodes || []).map((n: any) => n.id);
      const duplicatesBeforeAny = nodeIdsBeforeAnyNormalization.filter((id: string, idx: number) => 
        nodeIdsBeforeAnyNormalization.indexOf(id) !== idx
      );
      if (duplicatesBeforeAny.length > 0) {
        console.error('[AttachInputs] 🚨 BEFORE any normalization - Duplicate node IDs from DB/frontend:', {
          workflowId,
          duplicateIds: [...new Set(duplicatesBeforeAny)],
          allNodeIds: nodeIdsBeforeAnyNormalization,
          nodeCount: (graphToNormalize.nodes || []).length,
          uniqueNodeCount: new Set(nodeIdsBeforeAnyNormalization).size,
        });
      }
      
      // ✅ CRITICAL: Normalize with canonical normalizer FIRST to deduplicate nodes/triggers
      // This ensures duplicates are removed before any validation
      const { normalizeWorkflowForSave: normalizeEarly } = await import('../core/validation/workflow-save-validator');
      const earlyNormalized = normalizeEarly(
        graphToNormalize.nodes || [],
        graphToNormalize.edges || []
      );
      
      if (earlyNormalized.migrationsApplied.length > 0) {
        console.log('[AttachInputs] 🔄 Early normalization applied (before graph normalizer):', earlyNormalized.migrationsApplied);
      }
      
      // Now normalize graph structure (normalizeWorkflowGraph also deduplicates as safety)
      normalizedGraph = normalizeWorkflowGraph({
        nodes: earlyNormalized.nodes,
        edges: earlyNormalized.edges,
      });
      
      // ✅ DEBUG: Log node IDs AFTER normalization
      const nodeIdsAfterNormalization = normalizedGraph.nodes.map(n => n.id);
      const duplicatesAfter = nodeIdsAfterNormalization.filter((id, idx) => 
        nodeIdsAfterNormalization.indexOf(id) !== idx
      );
      if (duplicatesAfter.length > 0) {
        console.error('[AttachInputs] 🚨 AFTER normalization - STILL has duplicate node IDs:', {
          workflowId,
          duplicateIds: [...new Set(duplicatesAfter)],
        });
      } else {
        console.log('[AttachInputs] ✅ After normalization - No duplicate node IDs');
      }
      
      // Validate normalized graph (should pass now since duplicates are removed)
      const validation = validateNormalizedGraph(normalizedGraph);
      if (!validation.valid) {
        console.error('[AttachInputs] Graph validation failed after normalization:', validation.errors);
        return res.status(400).json(
          createError(
            ErrorCode.GRAPH_INVALID_STRUCTURE,
            'Workflow graph validation failed',
            {
              errors: validation.errors,
              warnings: validation.warnings,
              workflowId,
            }
          )
        );
      }
    } catch (error) {
      console.error('[AttachInputs] Graph normalization failed:', error);
      console.error('[AttachInputs] Workflow structure:', {
        hasGraph: !!workflow.graph,
        hasNodes: !!workflow.nodes,
        hasEdges: !!workflow.edges,
        graphType: typeof workflow.graph,
        nodesType: typeof workflow.nodes,
        edgesType: typeof workflow.edges,
        nodesIsArray: Array.isArray(workflow.nodes),
        edgesIsArray: Array.isArray(workflow.edges),
        nodesLength: Array.isArray(workflow.nodes) ? workflow.nodes.length : 'N/A',
        edgesLength: Array.isArray(workflow.edges) ? workflow.edges.length : 'N/A',
      });
      return res.status(400).json(
        createError(
          ErrorCode.GRAPH_PARSE_ERROR,
          'Failed to normalize workflow graph',
          {
            error: error instanceof Error ? error.message : String(error),
            workflowId,
            hint: 'Workflow graph format may be invalid. Ensure workflow has nodes and edges.',
            details: {
              hasGraph: !!workflow.graph,
              hasNodes: !!workflow.nodes,
              hasEdges: !!workflow.edges,
              nodesType: typeof workflow.nodes,
              edgesType: typeof workflow.edges,
            }
          }
        )
      );
    }

    const workflowGraph = normalizedGraph;

    // ✅ DEBUG: Log node IDs BEFORE normalization to detect duplicates from frontend
    const nodeIdsBefore = workflowGraph.nodes.map(n => n.id);
    const duplicateIdsBefore = nodeIdsBefore.filter((id, index) => nodeIdsBefore.indexOf(id) !== index);
    if (duplicateIdsBefore.length > 0) {
      console.error('[AttachInputs] 🚨 BEFORE normalize - Duplicate node IDs detected:', {
        workflowId,
        duplicateIds: [...new Set(duplicateIdsBefore)],
        allNodeIds: nodeIdsBefore,
        nodeCount: workflowGraph.nodes.length,
        uniqueNodeCount: new Set(nodeIdsBefore).size,
      });
    } else {
      console.log('[AttachInputs] ✅ BEFORE normalize - No duplicate node IDs detected:', {
        workflowId,
        nodeCount: workflowGraph.nodes.length,
        nodeIds: nodeIdsBefore,
      });
    }

    // ✅ CRITICAL: Normalize workflow FIRST to remove duplicate triggers and fix structure
    const { normalizeWorkflowForSave: normalizeWorkflow } = await import('../core/validation/workflow-save-validator');
    const normalizedBeforeClone = normalizeWorkflow(
      workflowGraph.nodes,
      workflowGraph.edges
    );
    
    // ✅ DEBUG: Log node IDs AFTER normalization to verify deduplication
    const nodeIdsAfter = normalizedBeforeClone.nodes.map(n => n.id);
    const duplicateIdsAfter = nodeIdsAfter.filter((id, index) => nodeIdsAfter.indexOf(id) !== index);
    if (duplicateIdsAfter.length > 0) {
      console.error('[AttachInputs] 🚨 AFTER normalize - STILL has duplicate node IDs:', {
        workflowId,
        duplicateIds: [...new Set(duplicateIdsAfter)],
        allNodeIds: nodeIdsAfter,
      });
    } else {
      console.log('[AttachInputs] ✅ AFTER normalize - Duplicates removed:', {
        workflowId,
        originalNodeCount: workflowGraph.nodes.length,
        normalizedNodeCount: normalizedBeforeClone.nodes.length,
        removedCount: workflowGraph.nodes.length - normalizedBeforeClone.nodes.length,
      });
    }
    
    if (normalizedBeforeClone.migrationsApplied.length > 0) {
      console.log('[AttachInputs] 🔄 Applied normalizations before input injection:', normalizedBeforeClone.migrationsApplied);
      console.log('[AttachInputs] 📊 Normalization stats:', {
        originalNodes: workflowGraph.nodes.length,
        normalizedNodes: normalizedBeforeClone.nodes.length,
        originalEdges: workflowGraph.edges.length,
        normalizedEdges: normalizedBeforeClone.edges.length,
      });
    }
    
    // ✅ CRITICAL: Clone workflow before mutation to ensure immutability
    // This prevents any accidental mutations of the original workflow definition
    const { cloneWorkflowDefinition } = await import('../core/utils/workflow-cloner');
    const clonedWorkflow = cloneWorkflowDefinition(
      normalizedBeforeClone.nodes,
      normalizedBeforeClone.edges,
      workflowId
    );
    
    console.log('[AttachInputs] ✅ Workflow normalized and cloned before input injection (immutable operation)');

    // Inject inputs into nodes (operating on clone, not original)
    let updatedNodes: any[];
    try {
      updatedNodes = clonedWorkflow.nodes.map((node: any) => {
      const nodeType = normalizeNodeType(node);
      const schema = nodeLibrary.getSchema(nodeType);
      
      if (!schema) {
        return node; // Skip nodes without schema
      }

      // ✅ CRITICAL: Idempotent input merging - merge with existing config
      const existingConfig = node.data?.config || {};
      const config = { ...existingConfig };
      let updated = false;

      // ✅ CRITICAL: Validate inputs are NOT credentials
      // OAuth connectors must NEVER accept credential fields via attach-inputs
      const connector = connectorRegistry.getConnectorByNodeType(nodeType);
      if (connector && connector.credentialContract.type === 'oauth') {
        // OAuth connectors should never receive credential fields as inputs
        // They are handled via OAuth button flow
      }

      // ✅ CRITICAL: Idempotent input application
      // Input format: { "nodeId_fieldName": "value" } or { "nodeId": { "fieldName": "value" } }
      // ✅ COMPREHENSIVE: Also handle question IDs: { "cred_nodeId_fieldName": "value", "op_nodeId_fieldName": "value", "config_nodeId_fieldName": "value", "resource_nodeId_fieldName": "value" }
      for (const [key, rawValue] of Object.entries(cleanInputs)) {
        let fieldName: string | null = null;
        
      // ✅ COMPREHENSIVE: Handle question ID formats (input_*, cred_*, op_*, config_*, resource_*)
      // Format: {prefix}_{nodeId}_{fieldName}
      // Example: cred_step_hubspot_1771317308025_authType -> fieldName: authType
      // ✅ CRITICAL: Also handle cases where nodeId in question doesn't match node.id exactly
      let isFromComprehensiveQuestion = false;
      let prefix = '';
      
      if (key.startsWith('input_')) {
        prefix = 'input_';
        isFromComprehensiveQuestion = true;
      } else if (key.startsWith('cred_')) {
        prefix = 'cred_';
        isFromComprehensiveQuestion = true;
      } else if (key.startsWith('op_')) {
        prefix = 'op_';
        isFromComprehensiveQuestion = true;
      } else if (key.startsWith('config_')) {
        prefix = 'config_';
        isFromComprehensiveQuestion = true;
      } else if (key.startsWith('resource_')) {
        prefix = 'resource_';
        isFromComprehensiveQuestion = true;
      }
      
      if (isFromComprehensiveQuestion && prefix) {
        // Remove prefix to get "<nodeId>_<fieldName>"
        const afterPrefix = key.substring(prefix.length);
        
        // Try exact nodeId match first
        const nodeIdPrefix = `${node.id}_`;
        if (afterPrefix.startsWith(nodeIdPrefix)) {
          fieldName = afterPrefix.substring(nodeIdPrefix.length);
          console.log(`[AttachInputs] Detected comprehensive question ID: ${key} -> fieldName: ${fieldName} (exact nodeId match)`);
        } else {
          // ✅ SECURITY/INTEGRITY:
          // Always require exact nodeId match for prefixed keys.
          // Flexible field extraction can leak values across nodes (e.g., spreadsheetId applied to gmail).
          fieldName = null;
        }
      }
      // ✅ LEGACY: Handle nodeId_fieldName format
      else if (key.startsWith(`${node.id}_`)) {
        fieldName = key.substring(node.id.length + 1);
      }
        
        // Check if this input is for this node
        if (fieldName) {
          if (fieldName && schema.configSchema) {
            // ✅ CRITICAL: Handle authType selection - don't apply it to config, it's just a selection
            const fieldNameLower = fieldName.toLowerCase();
            if (fieldNameLower === 'authtype' || fieldName === 'authType') {
              // Store authType selection but don't apply it directly to config
              // The actual credential value will be applied based on the selected type
              console.log(`[AttachInputs] AuthType selected: ${rawValue} for node ${node.id} (${nodeType})`);
              // Don't apply authType to config - it's just a selection indicator
              continue;
            }
            
            // ✅ CRITICAL: For credential fields (apiKey, accessToken, credentialId), allow them if from comprehensive questions
            // Otherwise, reject credential fields (they should use attach-credentials endpoint)
            // Note: isFromComprehensiveQuestion is already set above when extracting fieldName
            const isCredentialValueField = 
              (fieldNameLower === 'apikey' || fieldNameLower === 'api_key') ||
              (fieldNameLower === 'accesstoken' || fieldNameLower === 'access_token') ||
              (fieldNameLower === 'credentialid' || fieldNameLower === 'credential_id');
            
            if (isCredentialValueField && !isFromComprehensiveQuestion) {
              console.warn(`[AttachInputs] Rejected credential field "${fieldName}" for node ${node.id} (${nodeType}) - use attach-credentials endpoint`);
              continue; // Skip credential fields that aren't from comprehensive questions
            }
            
            // ✅ ALLOW: Credential value fields from comprehensive questions (apiKey, accessToken, credentialId)
            // These are user-provided values that should be applied to node config
            // Also allow non-credential fields (resource, operation, properties, etc.)

            // SPECIAL CASE: For Google resource IDs, extract from full URLs
            let value = rawValue;
            if (typeof rawValue === 'string') {
              try {
                const { extractSpreadsheetId, extractDocumentId, extractFileId } = require('../shared/google-api-utils');

                if (nodeType === 'google_sheets' && fieldName === 'spreadsheetId') {
                  const extracted = extractSpreadsheetId(rawValue);
                  if (extracted && extracted !== rawValue) {
                    console.log(`[AttachInputs] Normalized Google Sheets URL to ID for node ${node.id}`);
                    value = extracted;
                  }
                }

                if (nodeType === 'google_doc' && fieldName === 'documentId') {
                  const extractedDocId = extractDocumentId(rawValue);
                  if (extractedDocId && extractedDocId !== rawValue) {
                    console.log(`[AttachInputs] Normalized Google Docs URL to ID for node ${node.id}`);
                    value = extractedDocId;
                  }
                }

                if (fieldName === 'fileId') {
                  const extractedFileId = extractFileId(rawValue);
                  if (extractedFileId && extractedFileId !== rawValue) {
                    console.log(`[AttachInputs] Normalized Google File URL to ID for node ${node.id}`);
                    value = extractedFileId;
                  }
                }
              } catch (extractErr) {
                console.warn('[AttachInputs] Failed to normalize Google URL to ID:', extractErr);
              }
            }
            
            // ✅ CRITICAL: Validate field exists in schema
            // ✅ RELAXED: Accept optional fields even if not in schema (for flexibility)
            const isRequired = schema.configSchema.required?.includes(fieldName);
            const isOptional = schema.configSchema.optional?.[fieldName];
            
            // ✅ CRITICAL: For Gmail, validate based on operation type
            if (nodeType === 'google_gmail') {
              const operation = config.operation || 'send';
              // messageId is only required for 'get' operation, not 'send'
              if (fieldName === 'messageId' && operation !== 'get') {
                console.log(`[AttachInputs] Skipping messageId for ${operation} operation`);
                continue; // Skip messageId for non-get operations
              }
              // from is optional - OAuth account will be used if not provided
              if (fieldName === 'from' && !value) {
                console.log(`[AttachInputs] from field empty - will use OAuth account`);
                // Still allow empty from - it's optional
              }
            }
            
            // ✅ CRITICAL: For Slack, handle both 'message' and 'text' field names
            // The schema may say 'text' but code uses 'message', so accept both
            if (nodeType === 'slack_message') {
              if (fieldName === 'text' && !config.message) {
                // Map 'text' input to 'message' field
                config.message = value;
                updated = true;
                console.log(`[AttachInputs] Mapped 'text' to 'message' for node ${node.id} (${nodeType})`);
                continue;
              }
              // Always accept 'message' field for Slack nodes (it's required)
              if (fieldName === 'message') {
                config[fieldName] = value;
                updated = true;
                console.log(`[AttachInputs] Applied ${fieldName} to node ${node.id} (${nodeType})`);
                continue;
              }
            }
            
            if (isRequired || isOptional || nodeType === 'google_gmail') {
              // ✅ Idempotent: Merge with existing value (overwrite if provided)
              const existingValue = config[fieldName];
              if (existingValue !== value) {
                config[fieldName] = value;
                updated = true;
                console.log(`[AttachInputs] Applied ${fieldName} to node ${node.id} (${nodeType}) - ${existingValue ? 'updated' : 'set'}`);
              } else {
                console.log(`[AttachInputs] Field ${fieldName} unchanged for node ${node.id} (${nodeType})`);
              }
            } else {
              console.warn(`[AttachInputs] Field ${fieldName} not in schema for ${nodeType}, skipping`);
            }
          }
        } else if (key === node.id && typeof rawValue === 'object') {
          // Nested format: { "nodeId": { "fieldName": "value" } }
          for (const [fieldName, fieldValueRaw] of Object.entries(rawValue as Record<string, any>)) {
            if (schema.configSchema) {
              // ✅ CRITICAL: Reject ALL credential fields (comprehensive check)
              // This ensures credentials are only handled via attach-credentials endpoint
              // Note: webhookUrl is a configuration field, not a credential, so it's allowed here
              const fieldNameLower = fieldName.toLowerCase();
              
              // ✅ CRITICAL: Exclude configuration fields that are NOT credentials
              const isConfigurationField = 
                fieldNameLower === 'webhookurl' || fieldNameLower === 'webhook_url' || // Webhook URL is configuration, not credential
                fieldNameLower === 'callbackurl' || fieldNameLower === 'callback_url' || // OAuth callback URL is configuration
                fieldNameLower === 'redirecturl' || fieldNameLower === 'redirect_url' || // OAuth redirect URL is configuration
                fieldNameLower.includes('message') || // Message fields are not credentials
                fieldNameLower.includes('channel') || // Channel fields are not credentials
                fieldNameLower.includes('text') || // Text fields are not credentials
                fieldNameLower.includes('subject') || // Subject fields are not credentials
                fieldNameLower.includes('body') || // Body fields are not credentials
                fieldNameLower.includes('to') || // To fields are not credentials
                fieldNameLower.includes('from'); // From fields are not credentials
              
              // If it's a configuration field, allow it (don't reject)
              if (!isConfigurationField) {
                // ✅ STRICT: Only reject ACTUAL credential fields
                const credentialPatterns = [
                  'api_key', 'apikey', 'apiKey', 'api-key',
                  'apitoken', 'api_token', 'api-token', 'apiToken',
                  'apisecret', 'api_secret', 'api-secret', 'apiSecret',
                  'token', 'access_token', 'refresh_token', 'accessToken', 'refreshToken',
                  'secret', 'password', 'client_secret', 'clientSecret',
                  'oauth', 'client_id', 'clientId',
                  'credential', 'credentials', 'credentialId', 'credential_id',
                  'bearer', 'authorization', 'auth_token', 'authToken',
                  'private_key', 'privateKey', 'public_key', 'publicKey',
                  'bottoken', 'bot_token',
                  'secrettoken', 'secret_token',
                ];
                
                const isCredentialField = credentialPatterns.some(pattern => fieldNameLower.includes(pattern)) ||
                  (connector && connector.credentialContract.type === 'oauth' && 
                   (fieldNameLower.includes(connector.credentialContract.vaultKey?.toLowerCase() || '') ||
                    fieldNameLower.includes(connector.credentialContract.provider?.toLowerCase() || '')));
                
                if (isCredentialField) {
                  console.warn(`[AttachInputs] ✅ Rejected credential field "${fieldName}" for node ${node.id} (${nodeType}) - use attach-credentials endpoint`);
                  continue; // Skip credential fields - they must use attach-credentials endpoint
                }
              }
              // If isConfigurationField is true, we allow it to continue (not rejected)
              
              // ✅ CRITICAL: Validate field exists in schema
              // ✅ RELAXED: Accept optional fields even if not in schema (for flexibility)
              const isRequired = schema.configSchema.required?.includes(fieldName);
              const isOptional = schema.configSchema.optional?.[fieldName];
              
              // SPECIAL CASE: For Google resource IDs in nested format, extract from URLs
              let fieldValue: any = fieldValueRaw;
              if (typeof fieldValueRaw === 'string') {
                try {
                  const { extractSpreadsheetId, extractDocumentId, extractFileId } = require('../shared/google-api-utils');

                  if (nodeType === 'google_sheets' && fieldName === 'spreadsheetId') {
                    const extracted = extractSpreadsheetId(fieldValueRaw);
                    if (extracted && extracted !== fieldValueRaw) {
                      console.log(`[AttachInputs] Normalized Google Sheets URL to ID for node ${node.id}`);
                      fieldValue = extracted;
                    }
                  }

                  if (nodeType === 'google_doc' && fieldName === 'documentId') {
                    const extractedDocId = extractDocumentId(fieldValueRaw);
                    if (extractedDocId && extractedDocId !== fieldValueRaw) {
                      console.log(`[AttachInputs] Normalized Google Docs URL to ID for node ${node.id}`);
                      fieldValue = extractedDocId;
                    }
                  }

                  if (fieldName === 'fileId') {
                    const extractedFileId = extractFileId(fieldValueRaw);
                    if (extractedFileId && extractedFileId !== fieldValueRaw) {
                      console.log(`[AttachInputs] Normalized Google File URL to ID for node ${node.id}`);
                      fieldValue = extractedFileId;
                    }
                  }
                } catch (extractErr) {
                  console.warn('[AttachInputs] Failed to normalize Google URL to ID (nested):', extractErr);
                }
              }

              // ✅ CRITICAL: For Gmail, validate based on operation type
              if (nodeType === 'google_gmail') {
                const operation = config.operation || 'send';
                // messageId is only required for 'get' operation, not 'send'
                if (fieldName === 'messageId' && operation !== 'get') {
                  console.log(`[AttachInputs] Skipping messageId for ${operation} operation`);
                  continue; // Skip messageId for non-get operations
                }
                // from is optional - OAuth account will be used if not provided
                if (fieldName === 'from' && !fieldValue) {
                  console.log(`[AttachInputs] from field empty - will use OAuth account`);
                  // Still allow empty from - it's optional
                }
              }
              
              // ✅ CRITICAL: For Slack, handle both 'message' and 'text' field names
              // The schema may say 'text' but code uses 'message', so accept both
              if (nodeType === 'slack_message') {
                if (fieldName === 'text' && !config.message) {
                  // Map 'text' input to 'message' field
                  config.message = fieldValue;
                  updated = true;
                  console.log(`[AttachInputs] Mapped 'text' to 'message' for node ${node.id} (${nodeType})`);
                  continue;
                }
                // Always accept 'message' field for Slack nodes (it's required)
                if (fieldName === 'message') {
                  config[fieldName] = fieldValue;
                  updated = true;
                  console.log(`[AttachInputs] Applied ${fieldName} to node ${node.id} (${nodeType})`);
                  continue;
                }
              }
              
              if (isRequired || isOptional || nodeType === 'google_gmail') {
                // ✅ Idempotent: Merge with existing value (overwrite if provided)
                const existingValue = config[fieldName];
                if (existingValue !== fieldValue) {
                  config[fieldName] = fieldValue;
                  updated = true;
                  console.log(`[AttachInputs] Applied ${fieldName} to node ${node.id} (${nodeType}) - ${existingValue ? 'updated' : 'set'}`);
                } else {
                  console.log(`[AttachInputs] Field ${fieldName} unchanged for node ${node.id} (${nodeType})`);
                }
              } else {
                console.warn(`[AttachInputs] Field ${fieldName} not in schema for ${nodeType}, skipping`);
              }
            }
          }
        }
      }

      // ✅ CRITICAL: Always return node with config, even if no changes were made
      // This ensures the config is preserved in the node structure
      if (updated || Object.keys(config).length > 0) {
        const updatedNode = {
          ...node,
          data: {
            ...node.data,
            config,
          },
        };
        // ✅ DEBUG: Log the config being saved for this node
        if (updated) {
          console.log(`[AttachInputs] ✅ Node ${node.id} (${nodeType}) config updated:`, Object.keys(config).filter(k => config[k] !== undefined && config[k] !== '').map(k => `${k}=${typeof config[k] === 'string' ? config[k].substring(0, 20) : config[k]}`).join(', '));
        }
        return updatedNode;
      }

      return node;
    });
    } catch (mapError) {
      console.error('[AttachInputs] Error during node input injection:', mapError);
      console.error('[AttachInputs] Error details:', {
        error: mapError instanceof Error ? mapError.message : String(mapError),
        stack: mapError instanceof Error ? mapError.stack : undefined,
        nodesCount: workflowGraph.nodes.length,
        inputsCount: Object.keys(cleanInputs).length,
      });
      return res.status(500).json(
        createError(
          ErrorCode.INTERNAL_ERROR,
          'Failed to inject inputs into nodes',
          {
            error: mapError instanceof Error ? mapError.message : String(mapError),
            workflowId,
            hint: 'An error occurred while applying inputs to workflow nodes. Check server logs for details.',
          }
        )
      );
    }

    // ✅ FIXED: Keep ai_agent nodes as-is (don't replace with ai_chat_model)
    // ai_agent works fine with Ollama and is properly supported in the frontend
    // The ai_chat_model replacement was causing frontend validation errors
    const nodesAfterReplacement = updatedNodes;
    
    // No edge updates needed since we're keeping ai_agent nodes
    let updatedEdges = clonedWorkflow.edges.map((edge: any) => {
      // No special handling needed - keep edges as-is
      
      return edge;
    }).filter((e: any) => e !== null);

    // Use cloned workflow structure with updated nodes
    const updatedWorkflow = {
      nodes: nodesAfterReplacement,
      edges: updatedEdges, // Use updated edges
    };

    // ✅ CRITICAL: Normalize workflow BEFORE validation to fix duplicate triggers and structure issues
    const { validateWorkflowForSave, normalizeWorkflowForSave } = await import('../core/validation/workflow-save-validator');
    
    // Normalize the workflow to fix common issues (duplicate triggers, invalid edges, etc.)
    const preNormalized = normalizeWorkflowForSave(nodesAfterReplacement, updatedEdges);
    
    if (preNormalized.migrationsApplied.length > 0) {
      console.log('[AttachInputs] 🔄 Pre-validation normalization applied:', preNormalized.migrationsApplied);
    }
    
    // Validate the normalized workflow (should pass now since normalization fixed issues)
    const saveValidation = validateWorkflowForSave(preNormalized.nodes, preNormalized.edges);
    
    // ✅ CRITICAL: Only reject on truly critical errors that can't be auto-fixed
    // Normalization should have fixed duplicate triggers, invalid edges, etc.
    // Only block on errors that indicate the workflow is fundamentally broken
    const criticalSaveErrors = saveValidation.errors.filter((error: string) => {
      const errorLower = error.toLowerCase();
      // Critical errors that can't be auto-fixed:
      return errorLower.includes('no nodes') || 
             errorLower.includes('no edges') ||
             (errorLower.includes('must have exactly one trigger') && !errorLower.includes('multiple')); // Only block if NO trigger, not multiple (normalization fixes multiple)
    });
    
    if (criticalSaveErrors.length > 0) {
      console.error('[AttachInputs] Critical save validation errors (after normalization):', criticalSaveErrors);
      console.warn('[AttachInputs] Non-critical errors (will be auto-fixed):', saveValidation.errors.filter((e: string) => !criticalSaveErrors.includes(e)));
      return res.status(400).json(
        createError(
          ErrorCode.INVALID_INPUT,
          'Workflow validation failed',
          {
            errors: criticalSaveErrors,
            warnings: saveValidation.warnings,
            workflowId,
            hint: 'Please fix the critical validation errors before attaching inputs.',
          }
        )
      );
    }
    
    // Log warnings but don't block
    if (saveValidation.warnings.length > 0) {
      console.warn('[AttachInputs] Validation warnings (non-blocking):', saveValidation.warnings);
    }
    
    // Use normalized nodes/edges for rest of processing
    const normalizedWorkflow = {
      nodes: preNormalized.nodes,
      edges: preNormalized.edges,
    };
    
    // ✅ CRITICAL: Relax validation - only validate structure, not required fields
    // Required fields may be filled later or have defaults
    // Use fixedWorkflow even if there are errors (validator will auto-fix issues)
    // Use normalized workflow (already fixed duplicate triggers, etc.)
    const validation = await workflowValidator.validateAndFix(normalizedWorkflow);

    // ✅ CRITICAL: Only reject on critical structural errors (missing nodes, invalid edges)
    // Allow validation errors that can be auto-fixed or are non-critical
    const criticalErrors = validation.errors.filter((e: any) => {
      const msg = e.message?.toLowerCase() || '';
      // Critical: missing nodes, invalid edges, duplicate IDs
      return msg.includes('missing node') || 
             msg.includes('invalid edge') || 
             msg.includes('duplicate') ||
             msg.includes('no nodes') ||
             msg.includes('no edges');
    });

    if (criticalErrors.length > 0) {
      // ✅ Log detailed validation errors
      console.error('[AttachInputs] Critical validation errors:', criticalErrors.map((e: any) => e.message));
      console.warn('[AttachInputs] Non-critical validation errors:', validation.errors.filter((e: any) => !criticalErrors.includes(e)).map((e: any) => e.message));
      console.warn('[AttachInputs] Validation warnings:', validation.warnings.map((w: any) => w.message));
      
      // ✅ Return structured error only for critical issues
      return res.status(400).json(
        createError(
          ErrorCode.WORKFLOW_VALIDATION_FAILED,
          'Workflow validation failed after input injection',
          {
            errors: criticalErrors.map((e: any) => e.message),
            warnings: validation.warnings.map((w: any) => w.message),
            nonCriticalErrors: validation.errors.filter((e: any) => !criticalErrors.includes(e)).map((e: any) => e.message),
            validationResult: {
              valid: validation.valid,
              errors: validation.errors,
              warnings: validation.warnings,
            },
          }
        )
      );
    }

    // ✅ CRITICAL: Use fixedWorkflow even if there are non-critical errors
    // The validator auto-fixes issues, so we trust its output
    const finalWorkflow = validation.fixedWorkflow || updatedWorkflow;
    
    // Log non-critical errors as warnings
    if (validation.errors.length > 0) {
      console.warn('[AttachInputs] Non-critical validation errors (using fixed workflow):', validation.errors.map((e: any) => e.message));
    }
    if (validation.warnings.length > 0) {
      console.warn('[AttachInputs] Validation warnings:', validation.warnings.map((w: any) => w.message));
    }

    // ✅ CRITICAL: Apply save-time normalization to remove duplicates and fix structure
    const { normalizeWorkflowForSave: normalizeBeforeSave } = await import('../core/validation/workflow-save-validator');
    const finalNormalizedForSave = normalizeBeforeSave(
      finalWorkflow.nodes,
      finalWorkflow.edges
    );
    
    if (finalNormalizedForSave.migrationsApplied.length > 0) {
      console.log('[AttachInputs] 🔄 Applied final normalizations before saving:', finalNormalizedForSave.migrationsApplied);
    }
    
    // ✅ CRITICAL: Normalize workflow graph before saving (for graph structure)
    let finalNormalizedGraph: ReturnType<typeof normalizeWorkflowGraph>;
    try {
      finalNormalizedGraph = normalizeWorkflowGraph({
        nodes: finalNormalizedForSave.nodes,
        edges: finalNormalizedForSave.edges,
      });
    } catch (normalizeError) {
      console.error('[AttachInputs] Failed to normalize final workflow:', normalizeError);
      console.error('[AttachInputs] Final workflow structure:', {
        hasNodes: !!finalWorkflow.nodes,
        hasEdges: !!finalWorkflow.edges,
        nodesType: typeof finalWorkflow.nodes,
        edgesType: typeof finalWorkflow.edges,
        nodesIsArray: Array.isArray(finalWorkflow.nodes),
        edgesIsArray: Array.isArray(finalWorkflow.edges),
        finalWorkflowKeys: Object.keys(finalWorkflow || {}),
      });
      return res.status(500).json(
        createError(
          ErrorCode.GRAPH_PARSE_ERROR,
          'Failed to normalize workflow graph before saving',
          {
            error: normalizeError instanceof Error ? normalizeError.message : String(normalizeError),
            workflowId,
            hint: 'The workflow structure may be invalid after validation. Check server logs for details.',
          }
        )
      );
    }

    // ✅ CRITICAL: Check if credentials are required BEFORE updating
    // If NO credentials are required, set status to ready_for_execution immediately
    let requiredCredentialsCount = 0;
    let missingCredentialsCount = 0;
    let credentialDiscovery: any = null;
    
    try {
      const { credentialDiscoveryPhase } = await import('../services/ai/credential-discovery-phase');
      credentialDiscovery = await credentialDiscoveryPhase.discoverCredentials(
        finalNormalizedGraph,
        userId
      );
      
      requiredCredentialsCount = credentialDiscovery.requiredCredentials?.length || 0;
      missingCredentialsCount = credentialDiscovery.missingCredentials?.length || 0;
      
      console.log(`[AttachInputs] Credential check: ${requiredCredentialsCount} required, ${missingCredentialsCount} missing`);
      
      // ✅ CRITICAL: Auto-inject resolved credentials into nodes
      // If credentials are already satisfied (in vault), automatically inject them into node configs
      if (credentialDiscovery.satisfiedCredentials && credentialDiscovery.satisfiedCredentials.length > 0) {
        console.log(`[AttachInputs] Auto-injecting ${credentialDiscovery.satisfiedCredentials.length} resolved credential(s) into nodes...`);
        
        for (const satisfiedCred of credentialDiscovery.satisfiedCredentials) {
          // Find nodes that need this credential
          const nodeIds = satisfiedCred.nodeIds || [];
          
          for (const nodeId of nodeIds) {
            const node = finalNormalizedGraph.nodes.find((n: any) => n.id === nodeId);
            if (!node) continue;
            
            const nodeType = node.data?.type || node.type || '';
            
            // For OAuth-based nodes (Gmail, Sheets, etc.), inject credentialId
            if (satisfiedCred.type === 'oauth' && satisfiedCred.provider) {
              // Generate credentialId using the same logic as credential resolver
              // Format: provider_type_scopeSignature (e.g., "google_oauth_gmail")
              let credentialId: string;
              if (satisfiedCred.scopes && satisfiedCred.scopes.length > 0) {
                // Extract service name from scope URLs (e.g., "gmail" from "https://www.googleapis.com/auth/gmail.send")
                const sortedScopes = [...satisfiedCred.scopes].sort();
                const scopeSignature = sortedScopes
                  .map((scope: string) => {
                    const match = scope.match(/\/auth\/([^.\/]+)/);
                    return match ? match[1] : scope.split('/').pop() || '';
                  })
                  .filter(Boolean)
                  .join('_');
                credentialId = `${satisfiedCred.provider}_${satisfiedCred.type}_${scopeSignature}`;
              } else {
                // No scopes - use node type as fallback
                credentialId = `${satisfiedCred.provider}_${satisfiedCred.type}_${nodeType}`.replace(/[^a-z0-9_]/gi, '_');
              }
              
              // Ensure node has data object with all required properties
              if (!node.data) {
                node.data = {
                  label: node.type || nodeId,
                  type: nodeType || node.type || '',
                  category: 'utility',
                  config: {}
                };
              }
              if (!node.data.config) node.data.config = {};
              
              // Only inject if credentialId is not already set
              if (!node.data.config.credentialId) {
                node.data.config.credentialId = credentialId;
                console.log(`[AttachInputs] ✅ Auto-injected credentialId "${credentialId}" into node ${nodeId} (${nodeType}) - provider: ${satisfiedCred.provider}, type: ${satisfiedCred.type}, scopes: ${satisfiedCred.scopes?.join(', ') || 'none'}`);
              } else {
                console.log(`[AttachInputs] ⏭️  Node ${nodeId} (${nodeType}) already has credentialId "${node.data.config.credentialId}", skipping auto-injection`);
              }
            }
          }
        }
      }
    } catch (credError) {
      console.warn('[AttachInputs] Failed to discover credentials (non-fatal, defaulting to requiring credentials):', credError);
      // Default to requiring credentials if discovery fails
      requiredCredentialsCount = 1; // Assume credentials might be needed
      missingCredentialsCount = 1;
    }
    
    // ✅ CRITICAL: If no credentials required, move to ready_for_execution
    // Use 'active' for status (enum) and phase values for execution readiness (TEXT)
    let nextStatus = 'active'; // Always use valid enum value when workflow is being configured
    let nextPhase = 'configuring_credentials';
    if (requiredCredentialsCount === 0 || missingCredentialsCount === 0) {
      // No credentials needed OR all credentials already satisfied
      nextStatus = 'active'; // Valid enum value
      nextPhase = 'ready_for_execution'; // TEXT field for execution readiness
      console.log(`[AttachInputs] No credentials required - setting status to active, phase to ready_for_execution`);
    } else {
      // Credentials needed - keep status as 'active' but phase as 'configuring_credentials'
      nextStatus = 'active';
      nextPhase = 'configuring_credentials';
      console.log(`[AttachInputs] Credentials required - setting status to active, phase to configuring_credentials`);
    }
    
    // ✅ CRITICAL: Use linearized graph from normalizeWorkflowGraph (has single-trigger, single-chain enforcement)
    // This ensures workflows are saved with exactly one trigger and linear chain structure
    const nodesToSave = finalNormalizedGraph.nodes;
    const edgesToSave = finalNormalizedGraph.edges;
    
    console.log('[AttachInputs] 💾 Saving workflow with linearized structure:', {
      nodeCount: nodesToSave.length,
      edgeCount: edgesToSave.length,
      triggerNodes: nodesToSave.filter(n => {
        const category = n.data?.category || '';
        const nodeType = n.data?.type || n.type || '';
        return category.toLowerCase() === 'triggers' || 
               category.toLowerCase() === 'trigger' ||
               nodeType.includes('trigger') ||
               ['manual_trigger', 'webhook', 'schedule', 'interval', 'form', 'chat_trigger', 'workflow_trigger'].includes(nodeType);
      }).length,
      linearized: true,
    });
    
    // 🆕 VERSIONING: Get previous definition before update
    let previousDefinition: any = null;
    try {
      const { data: previousWorkflow } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', workflowId)
        .single();

      if (previousWorkflow) {
        previousDefinition = {
          name: previousWorkflow.name,
          nodes: previousWorkflow.nodes || [],
          edges: previousWorkflow.edges || [],
          status: previousWorkflow.status,
          phase: previousWorkflow.phase,
          // ✅ Use settings with fallback - column may not exist if migration not run
          settings: (previousWorkflow as any).settings || {},
          graph: (previousWorkflow as any).graph || {},
          metadata: (previousWorkflow as any).metadata || {},
        };
      }
    } catch (versionError) {
      // Non-critical - continue without previous definition
      console.warn('[AttachInputs] Could not load previous definition for versioning:', versionError);
    }

    // ✅ CRITICAL: Update workflow graph AND status in a single atomic operation
    // Also sync phase field if it exists (for backward compatibility)
    // Note: Database uses 'nodes' and 'edges' columns, not 'graph'
    const { data: updateData, error: updateError } = await supabase
      .from('workflows')
      .update({
        nodes: nodesToSave,
        edges: edgesToSave,
        status: nextStatus, // ✅ CRITICAL: Use valid enum value ('active')
        phase: nextPhase, // ✅ CRITICAL: Use TEXT field for execution phase
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId)
      .select('id, status, phase, nodes, edges, name, metadata')
      .single();

    if (updateError) {
      console.error('[AttachInputs] ❌ Failed to update workflow:', {
        workflowId,
        error: updateError.message,
        errorCode: updateError.code,
        errorDetails: updateError.details,
        hint: updateError.hint,
        fullError: updateError,
      });
      
      // ✅ CRITICAL: Check if error is due to missing 'graph' column
      const isGraphColumnError = updateError.message?.includes('graph') || 
                                 updateError.message?.includes('column') ||
                                 updateError.code === '42703' || // PostgreSQL: undefined column
                                 updateError.code === 'PGRST116'; // PostgREST: column not found
      
      return res.status(500).json(
        createError(
          ErrorCode.INTERNAL_ERROR,
          'Failed to update workflow',
          { 
            error: updateError.message,
            errorCode: updateError.code,
            errorDetails: updateError.details,
            hint: isGraphColumnError 
              ? 'The workflows table may be missing the "graph" column. Check database schema.'
              : updateError.hint || 'Check server logs for detailed error information.',
            workflowId 
          }
        )
      );
    }

    // ✅ CRITICAL: Verify status and phase were actually persisted
    if (!updateData || updateData.status !== nextStatus || updateData.phase !== nextPhase) {
      console.error('[AttachInputs] ❌ Status/phase update did not persist:', {
        workflowId,
        expectedStatus: nextStatus,
        expectedPhase: nextPhase,
        actualStatus: updateData?.status,
        actualPhase: updateData?.phase,
      });
      return res.status(500).json(
        createError(
          ErrorCode.INTERNAL_ERROR,
          'Workflow status/phase update did not persist',
          {
            workflowId,
            expectedStatus: nextStatus,
            expectedPhase: nextPhase,
            actualStatus: updateData?.status,
            actualPhase: updateData?.phase,
          }
        )
      );
    }

    // 🆕 VERSIONING: Create version after successful update
    if (updateData) {
      try {
        const { getWorkflowVersionManager } = await import('../services/workflow-versioning');
        const versionManager = getWorkflowVersionManager();

        // Extract user ID from request
        let createdBy: string | undefined;
        try {
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace('Bearer ', '').trim();
            const { data: { user } } = await supabase.auth.getUser(token);
            if (user) {
              createdBy = user.id;
            }
          }
        } catch (authError) {
          // Non-critical - continue without user ID
        }

        const currentDefinition = {
          name: updateData.name || 'Workflow',
          nodes: nodesToSave,
          edges: edgesToSave,
          status: nextStatus,
          phase: nextPhase,
          // ✅ Use settings with fallback - column may not exist if migration not run
          settings: (updateData as any).settings || {},
          graph: (updateData as any).graph || { nodes: nodesToSave, edges: edgesToSave },
          metadata: (updateData as any).metadata || {},
        };

        await versionManager.createVersion(
          workflowId,
          currentDefinition,
          previousDefinition,
          createdBy,
          {
            description: 'Inputs attached and workflow updated',
          }
        );
      } catch (versionError) {
        // Versioning is non-critical - log but don't fail the update
        console.warn('[AttachInputs] Versioning failed (non-critical):', versionError);
      }
    }

    console.log(`[AttachInputs] ✅ Workflow updated - graph saved, status set to ${nextStatus}, phase set to ${nextPhase} for workflow ${workflowId}`);

    // ✅ CRITICAL: Audit trail - log inputs attached event
    try {
      await supabase
        .from('workflow_events')
        .insert({
          workflow_id: workflowId,
          event_type: 'INPUTS_ATTACHED',
          event_data: {
            inputsCount: Object.keys(cleanInputs).length,
            nodeIds: Array.from(new Set(Object.keys(cleanInputs).map(key => {
              const match = key.match(/^(.+?)_/);
              return match ? match[1] : null;
            }).filter(Boolean))),
            requiredCredentialsCount,
            missingCredentialsCount,
            nextStatus,
          },
          created_at: new Date().toISOString(),
        });
    } catch (auditError) {
      console.warn('[AttachInputs] Failed to log audit event:', auditError);
    }

    console.log(`[AttachInputs] Successfully injected ${Object.keys(cleanInputs).length} input(s) into workflow ${workflowId}, status: ${nextStatus}`);
    
    // ✅ DEBUG: Log the config for each node in the response
    console.log(`[AttachInputs] 📋 Final nodes config summary:`);
    finalNormalizedGraph.nodes.forEach((node: any) => {
      const nodeType = normalizeNodeType(node);
      const config = node.data?.config || {};
      const configKeys = Object.keys(config).filter(k => config[k] !== undefined && config[k] !== '' && !k.startsWith('_'));
      if (configKeys.length > 0) {
        console.log(`[AttachInputs]   Node ${node.id} (${nodeType}): ${configKeys.map(k => `${k}=${typeof config[k] === 'string' && config[k].length > 30 ? config[k].substring(0, 30) + '...' : config[k]}`).join(', ')}`);
      }
    });

    return res.json({
      success: true,
      workflow: finalNormalizedGraph,
      nodes: finalNormalizedGraph.nodes,
      edges: finalNormalizedGraph.edges,
      validation: {
        valid: validation.valid,
        errors: validation.errors.map(e => e.message),
        warnings: validation.warnings.map(w => w.message),
      },
      status: nextStatus,
      phase: nextPhase,
      ready: nextPhase === 'ready_for_execution',
      message: nextPhase === 'ready_for_execution' 
        ? 'Node inputs injected successfully. Workflow is ready for execution.'
        : 'Node inputs injected successfully. Credentials required.',
    });
  } catch (error) {
    console.error('[AttachInputs] ❌ Unhandled error:', error);
    console.error('[AttachInputs] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[AttachInputs] Error details:', {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
      workflowId: req.params.workflowId || req.body?.workflowId,
    });
    return res.status(500).json({
      error: 'Failed to attach inputs',
      details: error instanceof Error ? error.message : String(error),
      code: error instanceof Error && 'code' in error ? (error as any).code : 'UNKNOWN_ERROR',
      hint: 'Check server logs for detailed error information. This may be due to database connection issues, invalid workflow structure, or missing dependencies.',
    });
  }
}
