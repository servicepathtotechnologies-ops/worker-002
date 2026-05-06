import type { UnifiedNodeDefinition, NodeExecutionContext, NodeExecutionResult, NodeInputSchema } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { executeViaLegacyExecutor } from '../unified-node-registry-legacy-adapter';
import { resolveRecipients } from '../../utils/recipient-resolver';
import { getGoogleAccessToken } from '../../../shared/google-sheets';
import { fetchGoogleSheetReadRange } from '../../../shared/google-sheets-read-range';

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

  // ✅ NEW: Check for recipientUrl field - extract email from URL if provided
  const recipientUrl = configWithResolvedInputs.recipientUrl || 
                       filteredBaseConfig.recipientUrl || 
                       context.config?.recipientUrl;
  
  if (recipientUrl && typeof recipientUrl === 'string' && recipientUrl.trim()) {
    try {
      const { parseRecipientEmails, extractEmailsFromText } = await import('../../utils/recipient-resolver');
      // Try to extract email from URL (could be in query params, path, or content)
      const emailsFromUrl = extractEmailsFromText(recipientUrl);
      
      // If URL doesn't contain email directly, try fetching content (for Google Sheets, etc.)
      if (emailsFromUrl.length === 0 && recipientUrl.startsWith('http')) {
        try {
          // Fetch URL content and extract emails
          const response = await fetch(recipientUrl);
          if (response.ok) {
            const content = await response.text();
            const emailsFromContent = extractEmailsFromText(content);
            if (emailsFromContent.length > 0) {
              recipientEmails = emailsFromContent.join(', ');
              console.log('[Gmail Override] ✅ Extracted emails from URL content:', recipientEmails);
            }
          }
        } catch (fetchError) {
          console.warn('[Gmail Override] ⚠️  Could not fetch URL to extract emails:', fetchError);
          // Fallback: try to extract from URL string itself
          const emailsFromUrlString = extractEmailsFromText(recipientUrl);
          if (emailsFromUrlString.length > 0) {
            recipientEmails = emailsFromUrlString.join(', ');
            console.log('[Gmail Override] ✅ Extracted emails from URL string:', recipientEmails);
          }
        }
      } else if (emailsFromUrl.length > 0) {
        recipientEmails = emailsFromUrl.join(', ');
        console.log('[Gmail Override] ✅ Extracted emails from URL:', recipientEmails);
      }
    } catch (error) {
      console.warn('[Gmail Override] ⚠️  Error extracting emails from URL:', error);
    }
  }

  // ✅ FALLBACK: If recipientSource contains an email address (user entered email in wrong field),
  // extract it and use it as recipientEmails
  if (!recipientEmails && recipientSource) {
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
      configWithResolvedInputs_recipientEmails: configWithResolvedInputs.recipientEmails,
      filteredBaseConfig_recipientEmails: filteredBaseConfig.recipientEmails,
      originalConfig_recipientEmails: context.config?.recipientEmails,
    });
  }

  const useAggressive =
    configWithResolvedInputs.useAiRecipientMapping === true ||
    configWithResolvedInputs.useAiRecipientMapping === 'true';

  let resolution = resolveRecipients({
    credentialInputRecipientEmails: recipientEmails,
    recipientSource,
    userIntent,
    upstreamOutputs: upstreamList,
    maxRecipients: 100,
    useAggressiveRowScan: useAggressive,
  });

  // Hybrid fallback: only when extract_from_sheet, upstream produced no recipients, and inline sheet is configured.
  if (
    resolution.recipientList.length === 0 &&
    recipientSource === 'extract_from_sheet'
  ) {
    const inlineSpreadsheetId = String(configWithResolvedInputs.spreadsheetId ?? '').trim();
    if (inlineSpreadsheetId) {
      const userIdsToTry: string[] = [];
      if (context.userId) userIdsToTry.push(context.userId);
      if (context.currentUserId && context.currentUserId !== context.userId) {
        userIdsToTry.push(context.currentUserId);
      }
      const accessToken =
        userIdsToTry.length > 0 ? await getGoogleAccessToken(context.supabase, userIdsToTry) : null;
      if (!accessToken) {
        return {
          success: true,
          output: {
            ...(typeof context.inputs === 'object' && context.inputs !== null ? (context.inputs as any) : {}),
            _error:
              'Gmail: inline Google Sheets fallback requires a connected Google account (same OAuth as Gmail, with Sheets API access).',
            _missingInputs: ['spreadsheetId'],
          },
        };
      }
      const sheetName = String(configWithResolvedInputs.sheetName ?? 'Sheet1').trim() || 'Sheet1';
      const rangeRaw = configWithResolvedInputs.range;
      const range =
        typeof rangeRaw === 'string' && rangeRaw.trim() !== '' ? rangeRaw.trim() : undefined;

      const fetched = await fetchGoogleSheetReadRange({
        spreadsheetId: inlineSpreadsheetId,
        sheetName,
        range,
        accessToken,
      });

      if ('error' in fetched) {
        return {
          success: true,
          output: {
            ...(typeof context.inputs === 'object' && context.inputs !== null ? (context.inputs as any) : {}),
            _error: `Gmail: could not read inline spreadsheet — ${fetched.error}`,
            _missingInputs: ['spreadsheetId'],
          },
        };
      }

      const synthetic = {
        items: fetched.items,
        rows: fetched.rows,
        headers: fetched.headers,
        values: fetched.values,
        google_sheets: {
          headers: fetched.headers,
          rows: fetched.rows,
          values: fetched.values,
        },
      };

      resolution = resolveRecipients({
        credentialInputRecipientEmails: recipientEmails,
        recipientSource,
        userIntent,
        upstreamOutputs: [synthetic],
        maxRecipients: 100,
        useAggressiveRowScan: useAggressive,
      });
    }
  }

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
          'Gmail: missing recipient email(s). For Extract from sheet: ensure a Google Sheets node upstream supplies rows with email-like columns, or set optional Spreadsheet ID + sheet on this node for fallback, or use manual recipients / prompt.',
        _missingInputs: ['recipientEmails'],
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
    (typeof inputObjAny?.response === 'string' ? coerceString(inputObjAny.response) : '') ||
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
      (typeof upstreamObj?.response === 'string'
        ? coerceString((upstreamObj.response as string).split(/\r?\n/)[0] || '')
        : '') ||
      coerceString(upstreamObj?.response?.subject) ||
      coerceString(upstreamObj?.response_json?.subject) ||
      coerceString(upstreamObj?.responseJson?.subject);
    const upstreamBody =
      coerceString(upstreamObj?.body) ||
      (typeof upstreamObj?.response === 'string' ? coerceString(upstreamObj.response) : '') ||
      coerceString(upstreamObj?.response?.body) ||
      coerceString(upstreamObj?.response_text) ||
      coerceString(upstreamObj?.responseText) ||
      coerceString(upstreamObj?.text) ||
      coerceString(upstreamObj?.message) ||
      coerceString(upstreamObj?.content);
    if (!subjectFinal && upstreamSubject) subjectFinal = upstreamSubject;
    if (!bodyFinal && upstreamBody) bodyFinal = upstreamBody;
  }

  // Note: subject/body are filled by the dynamic executor's resolveInputsWithAI() before this
  // execute() is called (context.inputs carries the AI-resolved values). The merge at
  // configWithResolvedInputs (line ~47) already brought them in. If still empty here, the
  // upstream truly has no text content and the errors below are the correct user-facing result.

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
  const baseSchema = ensureRecipientEmailsField(def.inputSchema);
  const inputSchema: NodeInputSchema = {
    ...baseSchema,
    credentialId: baseSchema.credentialId
      ? {
          ...baseSchema.credentialId,
          ownership: 'credential',
          fillMode: {
            default: 'manual_static',
            supportsRuntimeAI: false,
            supportsBuildtimeAI: false,
          },
        }
      : baseSchema.credentialId,
    operation: baseSchema.operation
      ? {
          ...baseSchema.operation,
          ownership: 'structural',
          fillMode: {
            default: 'manual_static',
            supportsRuntimeAI: false,
            supportsBuildtimeAI: false,
          },
        }
      : baseSchema.operation,
    recipientSource: baseSchema.recipientSource
      ? {
          ...baseSchema.recipientSource,
          ownership: 'structural',
          fillMode: {
            default: 'manual_static',
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
        }
      : baseSchema.recipientSource,
    recipientEmails: baseSchema.recipientEmails
      ? {
          ...baseSchema.recipientEmails,
          ownership: 'value',
          fillMode: {
            default: 'manual_static',
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
          role: 'recipient',
        }
      : baseSchema.recipientEmails,
    spreadsheetId: baseSchema.spreadsheetId
      ? {
          ...baseSchema.spreadsheetId,
          ownership: 'structural',
          fillMode: {
            default: 'manual_static',
            supportsRuntimeAI: false,
            supportsBuildtimeAI: false,
          },
        }
      : baseSchema.spreadsheetId,
    range: baseSchema.range
      ? {
          ...baseSchema.range,
          ownership: 'structural',
          fillMode: {
            default: 'manual_static',
            supportsRuntimeAI: false,
            supportsBuildtimeAI: false,
          },
        }
      : baseSchema.range,
    subject: baseSchema.subject
      ? {
          ...baseSchema.subject,
          ownership: 'value',
          fillMode: {
            default: 'manual_static',
            supportsRuntimeAI: true,
            supportsBuildtimeAI: true,
          },
          role: 'title_like',
          // Gmail cannot send without a subject; runtime_ai must guarantee this.
          essentialForExecution: true,
        }
      : baseSchema.subject,
    body: baseSchema.body
      ? {
          ...baseSchema.body,
          ownership: 'value',
          fillMode: {
            default: 'manual_static',
            supportsRuntimeAI: true,
            supportsBuildtimeAI: true,
          },
          role: 'long_body',
          // Body is required for a meaningful email; enforced at runtime.
          essentialForExecution: true,
        }
      : baseSchema.body,
    from: baseSchema.from
      ? {
          ...baseSchema.from,
          ownership: 'value',
          fillMode: {
            default: 'manual_static',
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
        }
      : baseSchema.from,
    messageId: baseSchema.messageId
      ? {
          ...baseSchema.messageId,
          ownership: 'value',
          fillMode: {
            default: 'manual_static',
            supportsRuntimeAI: false,
            supportsBuildtimeAI: false,
          },
        }
      : baseSchema.messageId,
    query: baseSchema.query
      ? {
          ...baseSchema.query,
          ownership: 'value',
          fillMode: {
            default: 'manual_static',
            supportsRuntimeAI: false,
            supportsBuildtimeAI: true,
          },
        }
      : baseSchema.query,
  };
  return {
    ...def,
    inputSchema,
    tags: Array.from(new Set([...(def.tags || []), 'communication', 'output', 'sink'])),
    execute: async (context) => {
      return await executeGmailSend(context, schema);
    },
  };
}

