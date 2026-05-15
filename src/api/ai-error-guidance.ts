import { Request, Response } from 'express';
import crypto from 'crypto';
import { geminiOrchestrator } from '../services/ai/gemini-orchestrator';
import { getCacheRedisClient } from '../middleware/redisGetCache';

interface ErrorGuidanceRequest {
  errorCode?: string;
  errorMessage?: string;
  hint?: string;
  operation?: string;
  context?: {
    workflowName?: string;
    workflowIntent?: string;
    nodeType?: string;
    missingInputs?: Array<{ fieldName: string; nodeLabel: string; description?: string }>;
    missingCredentials?: Array<{ provider: string; displayName: string }>;
    executionValidationErrors?: string[];
    executionValidationIssues?: Array<{
      type?: string;
      severity?: string;
      issue?: string;
      nodeLabel?: string;
      nodeType?: string;
      previousNodeLabel?: string;
      previousNodeType?: string;
    }>;
    phase?: string;
    provider?: string;
    operation?: string;
  };
}

interface ErrorGuidanceResponse {
  title: string;
  description: string;
  resolution: string;
  nextSteps: string[];
  tone: 'configuration' | 'connection' | 'attention' | 'success';
}

const CACHE_TTL_SECONDS = 300; // 5 minutes

function deterministicGuidance(req: ErrorGuidanceRequest): ErrorGuidanceResponse {
  const code = (req.errorCode || '').toUpperCase();
  const ctx = req.context || {};

  // Missing credentials
  if (
    code.includes('MISSING_CREDENTIALS') ||
    code.includes('CREDENTIAL') ||
    code.includes('OAUTH') ||
    (ctx.missingCredentials && ctx.missingCredentials.length > 0) ||
    (req.errorMessage || '').toLowerCase().includes('credential')
  ) {
    const providers = ctx.missingCredentials?.map((c) => c.displayName).filter(Boolean) || [];
    const providerList = providers.length > 0 ? providers.join(', ') : ctx.provider || 'the required service';
    return {
      title: 'Connect your account to continue',
      description: `Your workflow needs access to ${providerList}. You can connect it in a few seconds.`,
      resolution: 'Head to Connections and authorize the account — then run the workflow again.',
      nextSteps: [
        `Open the Connections page from the sidebar`,
        `Find ${providerList} and click Connect`,
        'Return here and run the workflow again',
      ],
      tone: 'connection',
    };
  }

  // Missing inputs
  if (
    code.includes('MISSING_INPUTS') ||
    code.includes('MISSING_INPUT') ||
    (ctx.missingInputs && ctx.missingInputs.length > 0)
  ) {
    const fields = ctx.missingInputs?.map((f) => {
      return f.nodeLabel ? `${f.nodeLabel} → ${f.fieldName}` : f.fieldName;
    }).filter(Boolean) || [];
    const fieldList = fields.length > 0 ? fields.join(', ') : 'some required fields';
    const nodeNames = [...new Set(ctx.missingInputs?.map((f) => f.nodeLabel).filter(Boolean) || [])];
    const nodeHint = nodeNames.length > 0 ? ` Click the ${nodeNames.join(' or ')} node to open its settings.` : '';
    return {
      title: 'Fill in the remaining fields',
      description: `The workflow is almost ready — ${fieldList} still need values before it can run.`,
      resolution: `Click on the highlighted node in the canvas and fill in the missing fields.${nodeHint}`,
      nextSteps: [
        nodeNames.length > 0 ? `Click the ${nodeNames.join(' or ')} node on the canvas` : 'Click the node that needs attention',
        `Fill in: ${fieldList}`,
        'Save and run the workflow again',
      ],
      tone: 'configuration',
    };
  }

  if (ctx.executionValidationIssues?.length || ctx.executionValidationErrors?.length) {
    const firstIssue = ctx.executionValidationIssues?.[0];
    const issueText =
      firstIssue?.previousNodeLabel && firstIssue?.nodeLabel
        ? `${firstIssue.previousNodeLabel} -> ${firstIssue.nodeLabel}: ${firstIssue.issue || 'check this connection'}`
        : firstIssue?.nodeLabel
          ? `${firstIssue.nodeLabel}: ${firstIssue.issue || 'check this node'}`
          : ctx.executionValidationErrors?.[0] || 'The workflow structure needs attention.';
    return {
      title: 'Check this workflow connection',
      description: issueText,
      resolution: 'Open the named node or connection and adjust the order only if this does not match your intended flow.',
      nextSteps: [
        firstIssue?.previousNodeLabel ? `Review ${firstIssue.previousNodeLabel}` : 'Review the previous node',
        firstIssue?.nodeLabel ? `Review ${firstIssue.nodeLabel}` : 'Review the highlighted node',
        'Save and run again',
      ],
      tone: 'configuration',
    };
  }

  // Save / persistence errors
  if (code.includes('SAVE') || (req.operation === 'save')) {
    return {
      title: 'Workflow could not be saved',
      description: 'The save did not go through — your changes are still here, just not stored yet.',
      resolution: 'Check your connection and try saving again. Your current edits are preserved.',
      nextSteps: [
        'Check your internet connection',
        'Click Save again',
        'If it keeps failing, refresh the page — your last saved version will load',
      ],
      tone: 'attention',
    };
  }

  // Auth / sign-in errors
  if (
    code.includes('AUTH') ||
    code.includes('SIGN_IN') ||
    req.operation === 'sign_in' ||
    req.operation === 'sign_up'
  ) {
    return {
      title: 'Check your sign-in details',
      description: "We couldn't sign you in with those details. Double-check and try once more.",
      resolution: 'Make sure your email and password are correct, or use a social sign-in option.',
      nextSteps: [
        'Verify your email address is correct',
        'Check your password — use "Forgot password" if needed',
        'Or sign in with Google or GitHub instead',
      ],
      tone: 'attention',
    };
  }

  // Not ready / phase errors
  if (code.includes('NOT_READY') || code.includes('INVALID_PHASE') || code.includes('PHASE')) {
    return {
      title: 'Finish setting up the workflow first',
      description: 'The workflow needs a bit more setup before it can run.',
      resolution: 'Complete the setup steps shown in the panel, then run again.',
      nextSteps: [
        'Review the setup checklist on the right',
        'Fill in any missing fields or connections',
        'Save and run when everything is checked off',
      ],
      tone: 'configuration',
    };
  }

  // Generic fallback
  return {
    title: 'One more thing to check',
    description: req.hint || req.errorMessage || 'Something needs attention before continuing.',
    resolution: 'Review the details below and follow the next steps.',
    nextSteps: [
      'Check the highlighted items in the workflow',
      'Make any needed changes',
      'Save and try again',
    ],
    tone: 'attention',
  };
}

function buildAIPrompt(req: ErrorGuidanceRequest): string {
  const ctx = req.context || {};
  const lines: string[] = [
    'You are a friendly product assistant helping a user fix a workflow issue.',
    'Rules:',
    '- NEVER use the words "error", "failed", "failure", or "broken"',
    '- Speak directly to the user ("you", "your")',
    '- Be specific to the context given',
    '- Keep total response under 90 words',
    '',
    'Return a JSON object with these exact keys:',
    '  title: string (5-8 words, friendly, no "Error")',
    '  description: string (what happened in plain words, 1 sentence)',
    '  resolution: string (what to do right now, 1 sentence)',
    '  nextSteps: string[] (2-3 short numbered steps the user can follow)',
    '  tone: one of "configuration" | "connection" | "attention" | "success"',
    '',
    'Context:',
  ];

  if (req.errorCode) lines.push(`  Error code: ${req.errorCode}`);
  if (req.errorMessage) lines.push(`  Message: ${req.errorMessage}`);
  if (req.hint) lines.push(`  Hint: ${req.hint}`);
  if (ctx.workflowName) lines.push(`  Workflow: "${ctx.workflowName}"`);
  if (ctx.nodeType) lines.push(`  Node type: ${ctx.nodeType}`);
  if (ctx.phase) lines.push(`  Phase: ${ctx.phase}`);
  if (ctx.provider) lines.push(`  Provider: ${ctx.provider}`);
  if (ctx.operation) lines.push(`  Operation: ${ctx.operation}`);

  if (ctx.missingCredentials?.length) {
    lines.push(`  Missing connections: ${ctx.missingCredentials.map((c) => c.displayName).join(', ')}`);
  }
  if (ctx.missingInputs?.length) {
    lines.push(`  Missing inputs: ${ctx.missingInputs.map((f) => f.nodeLabel ? `${f.nodeLabel} → ${f.fieldName}` : f.fieldName).join(', ')}`);
  }

  if (ctx.executionValidationIssues?.length) {
    lines.push(`  Validation issues: ${ctx.executionValidationIssues.map((issue) => {
      const current = issue.nodeLabel || issue.nodeType || 'node';
      const previous = issue.previousNodeLabel || issue.previousNodeType || '';
      return previous
        ? `${previous} -> ${current}: ${issue.issue || 'check connection'}`
        : `${current}: ${issue.issue || 'check node'}`;
    }).join(', ')}`);
  } else if (ctx.executionValidationErrors?.length) {
    lines.push(`  Validation issues: ${ctx.executionValidationErrors.join(', ')}`);
  }

  lines.push('');
  lines.push('Respond with only the JSON object, no markdown, no explanation.');
  return lines.join('\n');
}

export default async function aiErrorGuidanceHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as ErrorGuidanceRequest;

  // Build a deterministic fallback immediately so we always have something
  const fallback = deterministicGuidance(body);

  // Check Redis cache
  const contextHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ code: body.errorCode, ctx: body.context }))
    .digest('hex')
    .slice(0, 16);
  const cacheKey = `error-guidance:${body.errorCode || 'generic'}:${contextHash}`;

  try {
    const redis = await getCacheRedisClient(process.env.REDIS_URL || 'redis://localhost:6379');
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }
    }

    // Ask Gemini
    const prompt = buildAIPrompt(body);
    const raw = await geminiOrchestrator.processRequest(
      'error-analysis',
      { prompt },
      { temperature: 0.3, max_tokens: 400, cache: false }
    );

    let parsed: ErrorGuidanceResponse | null = null;
    try {
      const text = typeof raw === 'string' ? raw : raw?.text || raw?.content || JSON.stringify(raw);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const candidate = JSON.parse(jsonMatch[0]) as Partial<ErrorGuidanceResponse>;
        if (candidate.title && candidate.description && candidate.nextSteps) {
          parsed = {
            title: candidate.title,
            description: candidate.description,
            resolution: candidate.resolution || fallback.resolution,
            nextSteps: Array.isArray(candidate.nextSteps) ? candidate.nextSteps : fallback.nextSteps,
            tone: candidate.tone || fallback.tone,
          };
        }
      }
    } catch {
      // JSON parse failed — use fallback
    }

    const result = parsed || fallback;

    // Cache successful AI response
    if (parsed && redis) {
      await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
    }

    res.json(result);
  } catch {
    // If anything fails (Redis down, Gemini quota, etc.) — serve deterministic fallback
    res.json(fallback);
  }
}
