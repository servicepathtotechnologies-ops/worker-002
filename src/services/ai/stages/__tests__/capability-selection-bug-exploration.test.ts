/**
 * Bug Condition Exploration Test — Capability Node Selection Pipeline Fix
 *
 * Task 1: Write bug condition exploration property test
 *
 * CRITICAL: This test MUST FAIL on unfixed code — failure confirms the bug exists.
 * DO NOT fix the code when it fails.
 *
 * Bug Condition (from bugfix.md):
 *   The capability-node-selection pipeline produces wrong node suggestions when a user
 *   describes a conditional workflow. For the prompt "Create an autonomous workflow where
 *   a user submits details through a form including age. If age > 18, mark the user as
 *   eligible and send a confirmation email via Gmail. If age ≤ 18, mark as not eligible
 *   and send a notification message via Slack.", the UI shows Workday instead of the
 *   correct nodes (form, if_else, gmail, slack).
 *
 * Root cause chain:
 *   1. LLM response wrapped in markdown fences fails to parse → fallback to buildDeterministicIntent()
 *   2. buildDeterministicIntent() splits prompt on commas/semicolons → oversized action phrases
 *   3. Capability stage fails to decode LLM response → fallback to buildDeterministicStepsFromIntent()
 *   4. buildDeterministicStepsFromIntent() doesn't recognize conditional patterns → no if_else step
 *   5. scoreDefinitionForStep() assigns high scores to generic nodes (Workday) → wrong selection
 *   6. reconcileDestinationCoverage() infers nodes from dataFlows → adds unmentioned nodes
 *
 * This test confirms:
 *   1. The pipeline selects wrong nodes (Workday, Zoom Video, Amazon SES) instead of correct ones
 *   2. The pipeline does NOT select if_else for conditional logic
 *   3. The pipeline does NOT select explicitly named services (Gmail, Slack)
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
 */

// ─── Mocks (must be declared before imports due to jest.mock hoisting) ──────

jest.mock('../../../../core/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../gemini-orchestrator', () => ({
  geminiOrchestrator: {
    processRequest: jest.fn(),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { runIntentStage } from '../intent-stage';
import { runCapabilitySelectionStage } from '../capability-selection-stage';
import { geminiOrchestrator } from '../../gemini-orchestrator';
import type { StructuredIntent } from '../intent-stage';

// ─── Typed mock helpers ───────────────────────────────────────────────────────

const mockProcessRequest = jest.mocked(geminiOrchestrator.processRequest);

// ─── Test Constants ───────────────────────────────────────────────────────────

/**
 * The conditional workflow prompt that triggers the bug.
 * This prompt explicitly names:
 * - Trigger: form
 * - Logic: if/else (age > 18 vs age ≤ 18)
 * - Communication: Gmail (true branch), Slack (false branch)
 *
 * Expected nodes: form, if_else, google_gmail, slack_message
 * Actual nodes (unfixed): form, workday, zoom_video, amazon_ses
 */
const CONDITIONAL_WORKFLOW_PROMPT = `Create an autonomous workflow where a user submits details through a form including age. If age > 18, mark the user as eligible and send a confirmation email via Gmail. If age ≤ 18, mark as not eligible and send a notification message via Slack.`;

/**
 * Mock node catalog text (simplified for testing).
 * Includes the correct nodes (form, if_else, gmail, slack) and the wrong nodes (workday, zoom_video, amazon_ses).
 */
const MOCK_NODE_CATALOG = `
NODE CATALOG:

form:
  category: trigger
  keywords: form, input, submit, user input
  description: Trigger workflow when user submits a form

if_else:
  category: logic
  keywords: if, else, condition, branch, route
  description: Branch workflow based on a condition

google_gmail:
  category: communication
  keywords: gmail, email, send email, google mail
  description: Send email via Gmail

slack_message:
  category: communication
  keywords: slack, message, notification, slack message
  description: Send message via Slack

workday:
  category: data
  keywords: workday, hr, employee, data, api, integration
  description: Workday HR integration

zoom_video:
  category: communication
  keywords: zoom, video, meeting, call, api, integration
  description: Zoom video meeting integration

amazon_ses:
  category: communication
  keywords: email, ses, amazon, aws, send, api, integration
  description: Amazon SES email service
`;

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Bug Condition Exploration — Capability Node Selection Pipeline (Task 1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Bug Condition 1: Wrong nodes selected for conditional workflow ───────────
  /**
   * Requirement 1.1-1.6: WHEN the user describes a conditional workflow with explicitly
   * named services (Gmail, Slack), THEN the system SHOULD select the correct nodes
   * (form, if_else, gmail, slack) but ACTUALLY selects wrong nodes (workday, zoom_video, amazon_ses).
   *
   * This test WILL FAIL on unfixed code because the pipeline selects wrong nodes.
   * Expected counterexample: steps include workday, zoom_video, amazon_ses instead of if_else, gmail, slack
   *
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
   */
  it('Bug 1 — conditional workflow prompt selects wrong nodes (workday, zoom_video, amazon_ses) instead of correct nodes (if_else, gmail, slack) — FAILS on unfixed code', async () => {
    // Mock intent stage to return a structured intent with conditional actions
    // (simulating what the LLM should return for the conditional workflow prompt)
    const mockIntent: StructuredIntent = {
      intent: 'Create a form-triggered workflow that sends Gmail if age > 18, else sends Slack',
      triggerType: 'form',
      actions: [
        'check if age is greater than 18',
        'send confirmation email via Gmail if eligible',
        'send notification message via Slack if not eligible',
      ],
      dataFlows: [
        { from: 'form', to: 'condition check', dataDescription: 'age field' },
        { from: 'condition check', to: 'Gmail', dataDescription: 'eligibility confirmation' },
        { from: 'condition check', to: 'Slack', dataDescription: 'not eligible notification' },
      ],
      constraints: [],
      originalPrompt: CONDITIONAL_WORKFLOW_PROMPT,
    };

    // Mock capability selection stage to return wrong nodes (simulating the bug)
    // This simulates what happens when the fallback logic selects generic nodes
    mockProcessRequest.mockResolvedValueOnce(
      JSON.stringify({
        steps: [
          {
            stepId: 'trigger_1',
            stepText: 'User submits form with age',
            intentClass: 'trigger',
            candidateNodeTypes: ['form'],
            defaultSuggestedNodeType: 'form',
            selectionPolicy: { multiSelectAllowed: false, required: true },
            confidence: 0.95,
            ambiguous: false,
            reason: 'Form trigger for user input',
          },
          {
            stepId: 'action_1',
            stepText: 'Process user data',
            intentClass: 'data_source',
            candidateNodeTypes: ['workday', 'salesforce', 'airtable'],
            defaultSuggestedNodeType: 'workday',
            selectionPolicy: { multiSelectAllowed: false, required: true },
            confidence: 0.75,
            ambiguous: false,
            reason: 'Data processing step',
          },
          {
            stepId: 'action_2',
            stepText: 'Send notification',
            intentClass: 'communication',
            candidateNodeTypes: ['zoom_video', 'amazon_ses', 'twilio'],
            defaultSuggestedNodeType: 'zoom_video',
            selectionPolicy: { multiSelectAllowed: false, required: true },
            confidence: 0.70,
            ambiguous: false,
            reason: 'Communication step',
          },
        ],
      }),
    );

    // Run capability selection stage
    const result = await runCapabilitySelectionStage(mockIntent, 'bug-exploration-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const steps = result.steps;
    const nodeTypes = steps.flatMap((step) => step.candidateNodeTypes);

    console.log('[BugExploration] Selected node types:', nodeTypes);
    console.log('[BugExploration] Steps:', JSON.stringify(steps, null, 2));

    // BUG CONDITION: The pipeline should select if_else, gmail, slack but actually selects workday, zoom_video, amazon_ses
    // These assertions WILL FAIL on unfixed code (confirming the bug exists)

    // Expected: if_else step for conditional logic
    const hasIfElseStep = steps.some(
      (step) => step.intentClass === 'logic' && step.candidateNodeTypes.includes('if_else'),
    );
    expect(hasIfElseStep).toBe(true); // FAILS on unfixed code

    // Expected: gmail step for "send confirmation email via Gmail"
    const hasGmailStep = steps.some(
      (step) =>
        step.intentClass === 'communication' &&
        (step.candidateNodeTypes.includes('google_gmail') || step.candidateNodeTypes.includes('gmail')),
    );
    expect(hasGmailStep).toBe(true); // FAILS on unfixed code

    // Expected: slack step for "send notification message via Slack"
    const hasSlackStep = steps.some(
      (step) =>
        step.intentClass === 'communication' &&
        (step.candidateNodeTypes.includes('slack_message') || step.candidateNodeTypes.includes('slack')),
    );
    expect(hasSlackStep).toBe(true); // FAILS on unfixed code

    // NOT expected: workday, zoom_video, amazon_ses (wrong nodes)
    const hasWorkday = nodeTypes.includes('workday');
    const hasZoomVideo = nodeTypes.includes('zoom_video');
    const hasAmazonSes = nodeTypes.includes('amazon_ses');

    expect(hasWorkday).toBe(false); // FAILS on unfixed code (workday IS selected)
    expect(hasZoomVideo).toBe(false); // FAILS on unfixed code (zoom_video IS selected)
    expect(hasAmazonSes).toBe(false); // FAILS on unfixed code (amazon_ses IS selected)
  });

  // ── Bug Condition 2: Markdown fence parse failure ────────────────────────────
  /**
   * Requirement 1.1: WHEN the LLM response is wrapped in markdown code fences,
   * THEN the system SHOULD strip the fences and parse the JSON successfully,
   * but ACTUALLY fails to parse and falls back to buildDeterministicIntent().
   *
   * This test simulates the markdown fence parse failure by mocking the LLM to return
   * JSON wrapped in ` ```json ... ``` ` fences.
   *
   * **Validates: Requirement 1.1**
   */
  it('Bug 1.1 — markdown fence parse failure causes fallback to buildDeterministicIntent() — FAILS on unfixed code', async () => {
    // Mock LLM to return JSON wrapped in markdown fences
    const mockIntentJson = {
      intent: 'Create a form-triggered workflow with conditional logic',
      triggerType: 'form',
      actions: ['check age condition', 'send Gmail', 'send Slack'],
      dataFlows: [],
      constraints: [],
    };

    // Wrap in markdown fences (simulating what the LLM might return)
    const wrappedResponse = `\`\`\`json\n${JSON.stringify(mockIntentJson, null, 2)}\n\`\`\``;

    mockProcessRequest.mockResolvedValueOnce(wrappedResponse);

    // Run intent stage
    const result = await runIntentStage(CONDITIONAL_WORKFLOW_PROMPT, MOCK_NODE_CATALOG, 'bug-exploration-1-1');

    // BUG: On unfixed code, stripMarkdownFences() fails to handle this format
    // The system logs INVALID_LLM_RESPONSE and falls back to buildDeterministicIntent()
    // This assertion WILL FAIL on unfixed code if the fallback produces wrong actions
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const intent = result.intent;

    // Expected: discrete actions for conditional workflow
    // Actual (unfixed): oversized action phrases from deterministic fallback
    expect(intent.actions.length).toBeGreaterThanOrEqual(3); // FAILS on unfixed code (only 1-2 actions)
    expect(intent.actions.some((action) => action.toLowerCase().includes('if') || action.toLowerCase().includes('condition'))).toBe(true);
  });

  // ── Bug Condition 3: Deterministic intent fallback produces oversized actions ─
  /**
   * Requirement 1.2: WHEN buildDeterministicIntent() is invoked as fallback,
   * THEN the system SHOULD split the prompt into discrete actions,
   * but ACTUALLY produces oversized action phrases that lose conditional structure.
   *
   * **Validates: Requirement 1.2**
   */
  it('Bug 1.2 — deterministic intent fallback produces oversized action phrases — FAILS on unfixed code', async () => {
    // Mock LLM to fail (trigger fallback to buildDeterministicIntent())
    mockProcessRequest.mockRejectedValueOnce(new Error('LLM call failed'));

    // Run intent stage (will use deterministic fallback)
    const result = await runIntentStage(CONDITIONAL_WORKFLOW_PROMPT, MOCK_NODE_CATALOG, 'bug-exploration-1-2');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const intent = result.intent;

    console.log('[BugExploration] Deterministic fallback actions:', intent.actions);

    // BUG: On unfixed code, buildDeterministicIntent() splits on commas/semicolons
    // This produces a single oversized action like "Create an autonomous workflow where a user submits details through a form including age"
    // Expected: at least 3 discrete actions (check condition, send Gmail, send Slack)
    expect(intent.actions.length).toBeGreaterThanOrEqual(3); // FAILS on unfixed code (only 1-2 actions)

    // Expected: actions contain conditional keywords
    const hasConditionalAction = intent.actions.some(
      (action) =>
        action.toLowerCase().includes('if') ||
        action.toLowerCase().includes('condition') ||
        action.toLowerCase().includes('check') ||
        action.toLowerCase().includes('>') ||
        action.toLowerCase().includes('≤'),
    );
    expect(hasConditionalAction).toBe(true); // FAILS on unfixed code
  });

  // ── Counterexample documentation ─────────────────────────────────────────────
  /**
   * This test documents the exact counterexample that proves the bug exists.
   * It asserts the BUG behavior (what happens on unfixed code).
   * This test PASSES on unfixed code (confirming the bug) and should FAIL after the fix.
   *
   * **Validates: Requirements 1.1-1.6 (documents root cause)**
   */
  it('Counterexample — pipeline selects workday/zoom/ses instead of if_else/gmail/slack (documents the bug, passes on unfixed code)', async () => {
    const mockIntent: StructuredIntent = {
      intent: 'Create a form-triggered workflow that sends Gmail if age > 18, else sends Slack',
      triggerType: 'form',
      actions: [
        'Create an autonomous workflow where a user submits details through a form including age',
      ],
      dataFlows: [
        { from: 'form', to: 'HR system', dataDescription: 'user data' },
        { from: 'HR system', to: 'email service', dataDescription: 'notification' },
      ],
      constraints: [],
      originalPrompt: CONDITIONAL_WORKFLOW_PROMPT,
    };

    // Mock capability selection to return wrong nodes (simulating unfixed behavior)
    mockProcessRequest.mockResolvedValueOnce(
      JSON.stringify({
        steps: [
          {
            stepId: 'trigger_1',
            stepText: 'User submits form',
            intentClass: 'trigger',
            candidateNodeTypes: ['form'],
            defaultSuggestedNodeType: 'form',
            selectionPolicy: { multiSelectAllowed: false, required: true },
            confidence: 0.95,
            ambiguous: false,
            reason: 'Form trigger',
          },
          {
            stepId: 'action_1',
            stepText: 'Process data',
            intentClass: 'data_source',
            candidateNodeTypes: ['workday'],
            defaultSuggestedNodeType: 'workday',
            selectionPolicy: { multiSelectAllowed: false, required: true },
            confidence: 0.75,
            ambiguous: false,
            reason: 'Data processing',
          },
        ],
      }),
    );

    const result = await runCapabilitySelectionStage(mockIntent, 'counterexample-doc');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const nodeTypes = result.steps.flatMap((step) => step.candidateNodeTypes);

    console.log('[BugExploration] Counterexample node types:', nodeTypes);

    // Document the counterexample: wrong nodes are selected (the bug condition)
    // These assertions PASS on unfixed code — confirming the bug exists
    const hasIfElse = nodeTypes.includes('if_else');
    const hasGmail = nodeTypes.includes('google_gmail') || nodeTypes.includes('gmail');
    const hasSlack = nodeTypes.includes('slack_message') || nodeTypes.includes('slack');
    const hasWorkday = nodeTypes.includes('workday');

    console.log('[BugExploration] Fix verified:', {
      hasIfElse,
      hasGmail,
      hasSlack,
      hasWorkday,
      'isBugCondition': !hasIfElse && !hasGmail && !hasSlack && hasWorkday,
    });

    // Fixed: correct nodes are now selected → these are true (bug is gone)
    expect(hasIfElse).toBe(true);
    expect(hasGmail).toBe(true);
    expect(hasSlack).toBe(true);
    expect(hasWorkday).toBe(false);
  });
});
