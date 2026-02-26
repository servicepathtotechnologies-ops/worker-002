import type { UnifiedNodeDefinition, NodeExecutionContext, NodeExecutionResult, NodeInputSchema } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';
import { resolveRecipients } from '../../utils/recipient-resolver';

function ensureRecipientEmailsField(inputSchema: NodeInputSchema): NodeInputSchema {
  if (inputSchema.recipientEmails) return inputSchema;
  return {
    ...inputSchema,
    recipientEmails: {
      type: 'string',
      description:
        'Recipient email address(es). Supports comma-separated list or array input. If provided, overrides automatic detection.',
      required: false,
      examples: ['john@example.com', 'john@example.com, jane@example.com', '{{$json.email}}'],
    },
  };
}

async function executeGmailSend(context: NodeExecutionContext, schema: NodeSchema): Promise<NodeExecutionResult> {
  // Prepare nodeOutputs + template/placeholder resolution similarly to legacy adapter
  const { LRUNodeOutputsCache } = await import('../../cache/lru-node-outputs-cache');
  const nodeOutputs = new LRUNodeOutputsCache(100, false);
  context.upstreamOutputs.forEach((output, nodeId) => {
    nodeOutputs.set(nodeId, output, true);
  });

  // ✅ CRITICAL FIX: Store rawInput as 'input' in cache for {{input.*}} template resolution
  // This ensures templates like {{input.response.subject}} resolve correctly
  if (context.rawInput !== undefined && context.rawInput !== null) {
    nodeOutputs.set('input', context.rawInput, true);
    // Also set as $json for backward compatibility
    nodeOutputs.set('$json', context.rawInput, true);
    nodeOutputs.set('json', context.rawInput, true);
  }

  const { resolveConfigTemplates } = await import('../../utils/universal-template-resolver');
  const { filterPlaceholderValues } = await import('../../utils/placeholder-filter');

  const resolvedConfig = resolveConfigTemplates(context.config || {}, nodeOutputs);
  const filteredConfig = filterPlaceholderValues(resolvedConfig);
  const filteredBaseConfig = filterPlaceholderValues(context.config || {});

  // Merge resolved inputs into config (inputs as fallback only)
  const configWithResolvedInputs: any = { ...(context.inputs || {}), ...filteredBaseConfig, ...filteredConfig };

  const op = typeof configWithResolvedInputs?.operation === 'string' ? String(configWithResolvedInputs.operation) : 'send';
  if (op !== 'send') {
    // Non-send operations use standard legacy execution path
    return await executeViaLegacyExecutor({ context: { ...context, config: configWithResolvedInputs }, schema });
  }

  const userIntent = String((global as any).currentWorkflowIntent || '');
  const upstreamList = Array.from(context.upstreamOutputs.values());
  const recipientSource = configWithResolvedInputs.recipientSource;

  // ✅ CRITICAL FIX: Ensure recipientEmails is preserved even if it looks like a placeholder
  // The field might contain a real email that was incorrectly filtered
  let recipientEmails = configWithResolvedInputs.recipientEmails || 
                        filteredBaseConfig.recipientEmails || 
                        context.config?.recipientEmails;
  let explicitTo = configWithResolvedInputs.to || 
                   filteredBaseConfig.to || 
                   context.config?.to;

  // ✅ FALLBACK: If recipientSource contains an email address (user entered email in wrong field),
  // extract it and use it as recipientEmails
  if (!recipientEmails && !explicitTo && recipientSource) {
    const { parseRecipientEmails } = await import('../../utils/recipient-resolver');
    const emailsFromSource = parseRecipientEmails(recipientSource);
    if (emailsFromSource.length > 0) {
      recipientEmails = emailsFromSource.join(', ');
      console.log('[Gmail Override] ⚠️  Found email in recipientSource field, using it as recipientEmails:', recipientEmails);
    }
  }

  if (process.env.DEBUG_GMAIL_RECIPIENTS === 'true') {
    console.log('[Gmail Override] Config values:', {
      recipientSource,
      recipientEmails,
      explicitTo,
      configWithResolvedInputs_recipientEmails: configWithResolvedInputs.recipientEmails,
      filteredBaseConfig_recipientEmails: filteredBaseConfig.recipientEmails,
      originalConfig_recipientEmails: context.config?.recipientEmails,
    });
  }

  const resolution = resolveRecipients({
    credentialInputRecipientEmails: recipientEmails,
    explicitTo: explicitTo,
    recipientSource,
    userIntent,
    upstreamOutputs: upstreamList,
    maxRecipients: 100,
  });

  if (process.env.DEBUG_GMAIL_RECIPIENTS === 'true') {
    console.log('[RecipientResolver] Gmail recipient resolution:', {
      nodeId: context.nodeId,
      source: resolution.source,
      recipientCount: resolution.recipientList.length,
      detectedFieldNames: resolution.detectedFieldNames,
      recipientsPreview: resolution.recipientList.slice(0, 5),
    });
  }

  if (resolution.recipientList.length === 0) {
    return {
      success: true,
      output: {
        ...(typeof context.inputs === 'object' && context.inputs !== null ? (context.inputs as any) : {}),
        _error:
          'Gmail: missing recipient email(s). Provide recipientEmails (manual) or ensure upstream data contains an email column, or include an email in the prompt.',
        _missingInputs: ['to'],
      },
    };
  }

  // Fill subject/body from raw input or upstream if missing
  const coerceString = (v: any): string => (typeof v === 'string' ? v.trim() : '');
  const inputObjAny = typeof context.rawInput === 'object' && context.rawInput !== null ? (context.rawInput as any) : null;
  const inputSubject =
    coerceString(inputObjAny?.subject) ||
    coerceString(inputObjAny?.response?.subject) ||
    coerceString(inputObjAny?.response_json?.subject) ||
    coerceString(inputObjAny?.responseJson?.subject);
  const inputBody =
    coerceString(inputObjAny?.body) ||
    coerceString(inputObjAny?.response?.body) ||
    coerceString(inputObjAny?.response_text) ||
    coerceString(inputObjAny?.responseText) ||
    coerceString(inputObjAny?.text) ||
    coerceString(inputObjAny?.message) ||
    coerceString(inputObjAny?.content);

  // ✅ CRITICAL FIX: Resolve templates in subject/body fields AFTER initial resolution
  // This ensures templates like {{input.response.subject}} are properly resolved
  const { resolveUniversalTemplate } = await import('../../utils/universal-template-resolver');
  
  // Resolve subject template if it contains template syntax
  let subjectFinal = String((configWithResolvedInputs.subject ?? '') as any).trim();
  if (subjectFinal.includes('{{')) {
    const resolvedSubject = resolveUniversalTemplate(subjectFinal, nodeOutputs);
    subjectFinal = typeof resolvedSubject === 'string' ? resolvedSubject : String(resolvedSubject || '').trim();
  }
  
  // Resolve body template if it contains template syntax
  let bodyFinal = String((configWithResolvedInputs.body ?? '') as any).trim();
  if (bodyFinal.includes('{{')) {
    const resolvedBody = resolveUniversalTemplate(bodyFinal, nodeOutputs);
    bodyFinal = typeof resolvedBody === 'string' ? resolvedBody : String(resolvedBody || '').trim();
  }

  // Fill from input/upstream if still empty after template resolution
  if (!subjectFinal && inputSubject) subjectFinal = inputSubject;
  if (!bodyFinal && inputBody) bodyFinal = inputBody;

  const mostRecentUpstream =
    nodeOutputs && typeof (nodeOutputs as any).getMostRecentOutput === 'function'
      ? (nodeOutputs as any).getMostRecentOutput()
      : null;
  if (mostRecentUpstream) {
    const upstreamObj = mostRecentUpstream as any;
    const upstreamSubject =
      coerceString(upstreamObj?.subject) ||
      coerceString(upstreamObj?.response?.subject) ||
      coerceString(upstreamObj?.response_json?.subject) ||
      coerceString(upstreamObj?.responseJson?.subject);
    const upstreamBody =
      coerceString(upstreamObj?.body) ||
      coerceString(upstreamObj?.response?.body) ||
      coerceString(upstreamObj?.response_text) ||
      coerceString(upstreamObj?.responseText) ||
      coerceString(upstreamObj?.text) ||
      coerceString(upstreamObj?.message) ||
      coerceString(upstreamObj?.content);
    if (!subjectFinal && upstreamSubject) subjectFinal = upstreamSubject;
    if (!bodyFinal && upstreamBody) bodyFinal = upstreamBody;
  }
  if (!subjectFinal) {
    return { success: true, output: { ...(context.inputs as any), _error: 'Gmail: "subject" is required', _missingInputs: ['subject'] } };
  }
  if (!bodyFinal) {
    return { success: true, output: { ...(context.inputs as any), _error: 'Gmail: "body" is required', _missingInputs: ['body'] } };
  }

  const { resolveGmailCredentials, sendGmailEmail } = await import('../../../shared/gmail-executor');
  const credential = await resolveGmailCredentials(
    context.supabase,
    context.workflowId,
    context.nodeId,
    context.userId,
    context.currentUserId
  );

  if (!credential) {
    return {
      success: true,
      output: {
        ...(typeof context.inputs === 'object' && context.inputs !== null ? (context.inputs as any) : {}),
        _error: 'Gmail: OAuth token not found. Please connect a Google account with Gmail permissions.',
      },
    };
  }

  const recipients = resolution.recipientList;
  const results: Array<{ to: string; success: boolean; messageId?: string; error?: string }> = [];
  for (const recipient of recipients) {
    const r = await sendGmailEmail(credential, {
      to: recipient,
      subject: subjectFinal,
      body: bodyFinal,
    });
    results.push({ to: recipient, success: r.success, messageId: r.messageId, error: r.error });
  }

  const failed = results.filter((r) => !r.success);
  const firstError = failed[0]?.error;

  return {
    success: true,
    output: {
      ...(typeof context.inputs === 'object' && context.inputs !== null ? (context.inputs as any) : {}),
      success: failed.length === 0,
      subject: subjectFinal,
      to: recipients.length === 1 ? recipients[0] : recipients,
      messageId: recipients.length === 1 ? results[0]?.messageId : undefined,
      sentCount: results.filter((r) => r.success).length,
      failedCount: failed.length,
      results,
      ...(firstError ? { _warning: firstError } : {}),
    },
  };
}

export function overrideGoogleGmail(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  const inputSchema = ensureRecipientEmailsField(def.inputSchema);
  return {
    ...def,
    inputSchema,
    tags: Array.from(new Set([...(def.tags || []), 'communication', 'output', 'sink'])),
    execute: async (context) => {
      return await executeGmailSend(context, schema);
    },
  };
}

