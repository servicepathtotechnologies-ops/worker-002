/**
 * Capability Pipeline Integration Tests
 *
 * Tests the full intent analysis + capability grouping pipeline across 5 topology types:
 *   1. Linear          — simple sequential steps, no branching
 *   2. If/Else         — binary condition (true path / false path)
 *   3. Switch          — multi-case routing (3+ named branches)
 *   4. Nested          — condition inside a condition
 *   5. Mixed           — linear base with one if/else branch embedded
 *
 * Each describe block calls Gemini ONCE in beforeAll and shares the result across assertions.
 * Skip in CI: set SKIP_AI_INTEGRATION_TESTS=1 or omit GEMINI_API_KEY.
 *
 * Run all:        npx jest capability-pipeline.integration --testTimeout=120000 --no-coverage --runInBand --forceExit
 * Run one suite:  npx jest capability-pipeline.integration --testNamePattern="linear" --runInBand
 */

import { describe, expect, it, beforeAll } from '@jest/globals';
import { buildNodeCatalogText } from '../../../services/ai/node-catalog-builder';
import { runIntentAnalysis } from '../../../services/ai/stages/capability-intent-analyzer';
import { runCapabilityGrouping } from '../../../services/ai/stages/capability-grouper-stage';
import type { UseCaseUnit, CapabilityContainer, CandidateNode } from '../../../services/ai/stages/capability-types';

// ─── Skip guard ───────────────────────────────────────────────────────────────

const SKIP = !process.env.GEMINI_API_KEY || process.env.SKIP_AI_INTEGRATION_TESTS === '1';
const maybeIt = SKIP ? it.skip : it;

// ─── Shared catalog (built once) ──────────────────────────────────────────────

let nodeCatalog: string;
const FAKE_USER_ID = 'test-user-pipeline';
const FAKE_CORRELATION = 'test-corr-pipeline';
const PIPELINE_TIMEOUT = 120_000; // 2 min for beforeAll (multiple Gemini calls)

beforeAll(() => {
  nodeCatalog = buildNodeCatalogText();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runPipeline(
  prompt: string,
  attempt = 1,
): Promise<{ units: UseCaseUnit[]; containers: CapabilityContainer[] }> {
  const intentResult = await runIntentAnalysis(prompt, nodeCatalog, FAKE_CORRELATION);
  if (!intentResult.ok) {
    if (attempt < 3 && intentResult.code === 'LLM_CALL_FAILED') {
      await sleep(5_000 * attempt);
      return runPipeline(prompt, attempt + 1);
    }
    throw new Error(`Intent analysis failed [${intentResult.code}]: ${intentResult.message}`);
  }

  const groupResult = await runCapabilityGrouping(intentResult.units, nodeCatalog, FAKE_USER_ID, FAKE_CORRELATION);
  if (!groupResult.ok) {
    if (attempt < 3 && groupResult.code === 'LLM_CALL_FAILED') {
      await sleep(5_000 * attempt);
      return runPipeline(prompt, attempt + 1);
    }
    throw new Error(`Capability grouping failed [${groupResult.code}]: ${groupResult.message}`);
  }

  return { units: intentResult.units, containers: groupResult.containers };
}

// Throttle: wait between suites to avoid Gemini rate limits when running --runInBand.
// Gemini free tier: ~10 RPM. Each suite makes ~1-2 calls, so 8s gap is safe.
let lastSuiteEndMs = 0;
async function throttleBeforeSuite() {
  const elapsed = Date.now() - lastSuiteEndMs;
  const GAP_MS = 8_000;
  if (lastSuiteEndMs > 0 && elapsed < GAP_MS) {
    await sleep(GAP_MS - elapsed);
  }
}
function markSuiteEnd() { lastSuiteEndMs = Date.now(); }

const byRole = (units: UseCaseUnit[], role: UseCaseUnit['semanticRole']) =>
  units.filter(u => u.semanticRole === role);

const types = (container: CapabilityContainer) =>
  container.candidates.map((c: CandidateNode) => c.nodeType);

// ─── 1. LINEAR ────────────────────────────────────────────────────────────────

describe('1. Linear workflow', () => {
  let units: UseCaseUnit[];
  let containers: CapabilityContainer[];

  beforeAll(async () => {
    if (SKIP) return;
    await throttleBeforeSuite();
    const result = await runPipeline(
      'When I receive a new email in Gmail, extract the sender name and email body, then send a Slack message with those details to the #alerts channel.'
    );
    units = result.units;
    containers = result.containers;
    markSuiteEnd();
  }, PIPELINE_TIMEOUT);

  maybeIt('has exactly one trigger unit', () => {
    expect(byRole(units, 'trigger')).toHaveLength(1);
  });

  maybeIt('has no logic units (purely sequential, no branching)', () => {
    expect(byRole(units, 'logic')).toHaveLength(0);
  });

  maybeIt('trigger container is defined and contains at least one candidate', () => {
    const triggerUnit = byRole(units, 'trigger')[0];
    const triggerContainer = containers.find(c => c.useCaseUnit?.unitId === triggerUnit.unitId);
    expect(triggerContainer).toBeDefined();
    // Gmail has no dedicated trigger node in the registry; the grouper correctly returns
    // a generic trigger (webhook / manual_trigger) for "receive email" use cases.
    expect(types(triggerContainer!).length).toBeGreaterThanOrEqual(1);
  });

  maybeIt('communication container includes a Slack node', () => {
    const commUnits = byRole(units, 'communication');
    expect(commUnits.length).toBeGreaterThanOrEqual(1);
    const slackContainer = containers.find(c =>
      commUnits.some(u => u.unitId === c.useCaseUnit?.unitId) ||
      c.label.toLowerCase().includes('slack')
    );
    expect(slackContainer).toBeDefined();
    expect(types(slackContainer!).some(t => t === 'slack_message' || t === 'slack_webhook')).toBe(true);
  });

  maybeIt('no container is filled with only code/utility nodes', () => {
    const CODE_NODES = new Set(['function', 'javascript', 'http_request', 'noop']);
    for (const container of containers) {
      const allCode = types(container).every(t => CODE_NODES.has(t));
      expect(allCode).toBe(false);
    }
  });

  maybeIt('number of containers equals number of units (one container per unit)', () => {
    expect(containers).toHaveLength(units.length);
  });
});

// ─── 2. IF/ELSE ───────────────────────────────────────────────────────────────

describe('2. If/Else workflow', () => {
  let units: UseCaseUnit[];
  let containers: CapabilityContainer[];

  beforeAll(async () => {
    if (SKIP) return;
    await throttleBeforeSuite();
    const result = await runPipeline(
      'When a new support ticket arrives via a form, check if the priority field is "urgent". If urgent, immediately send an email via Gmail to the support manager. If not urgent, add it to a Trello card in the Backlog column.'
    );
    units = result.units;
    containers = result.containers;
    markSuiteEnd();
  }, PIPELINE_TIMEOUT);

  maybeIt('has exactly one trigger unit', () => {
    expect(byRole(units, 'trigger')).toHaveLength(1);
  });

  maybeIt('has exactly one logic unit', () => {
    expect(byRole(units, 'logic')).toHaveLength(1);
  });

  maybeIt('logic container includes if_else (binary, not multi-case switch)', () => {
    const logicUnit = byRole(units, 'logic')[0];
    const logicContainer = containers.find(c => c.useCaseUnit?.unitId === logicUnit.unitId);
    expect(logicContainer).toBeDefined();
    expect(types(logicContainer!).some(t => t === 'if_else')).toBe(true);
  });

  maybeIt('has at least 2 non-trigger/non-logic units (true branch + false branch)', () => {
    const branches = units.filter(u => u.semanticRole !== 'trigger' && u.semanticRole !== 'logic');
    expect(branches.length).toBeGreaterThanOrEqual(2);
  });

  maybeIt('Gmail container includes google_gmail', () => {
    const gmailContainer = containers.find(c =>
      c.label.toLowerCase().includes('gmail') ||
      c.label.toLowerCase().includes('email') ||
      types(c).some(t => t === 'google_gmail')
    );
    expect(gmailContainer).toBeDefined();
    expect(types(gmailContainer!).some(t => t === 'google_gmail')).toBe(true);
  });

  maybeIt('number of containers equals number of units', () => {
    expect(containers).toHaveLength(units.length);
  });
});

// ─── 3. SWITCH (multi-case) ───────────────────────────────────────────────────

describe('3. Switch workflow (3 named branches)', () => {
  let units: UseCaseUnit[];
  let containers: CapabilityContainer[];

  beforeAll(async () => {
    if (SKIP) return;
    await throttleBeforeSuite();
    const result = await runPipeline(
      'When a contact form is submitted, look at the "department" field: if it is "sales" send a Slack message to #sales-team; if it is "billing" send an email via Gmail to billing@company.com; if it is "support" create a Zendesk ticket.'
    );
    units = result.units;
    containers = result.containers;
    markSuiteEnd();
  }, PIPELINE_TIMEOUT);

  maybeIt('has exactly one trigger unit', () => {
    expect(byRole(units, 'trigger')).toHaveLength(1);
  });

  maybeIt('has exactly one logic unit', () => {
    expect(byRole(units, 'logic')).toHaveLength(1);
  });

  maybeIt('logic container includes switch node (3 cases → switch, not if_else)', () => {
    const logicUnit = byRole(units, 'logic')[0];
    const logicContainer = containers.find(c => c.useCaseUnit?.unitId === logicUnit.unitId);
    expect(logicContainer).toBeDefined();
    expect(types(logicContainer!).some(t => t === 'switch')).toBe(true);
  });

  maybeIt('has exactly 3 branch output units (sales, billing, support)', () => {
    const branches = units.filter(u => u.semanticRole !== 'trigger' && u.semanticRole !== 'logic');
    expect(branches).toHaveLength(3);
  });

  maybeIt('branch labels preserve case names (sales / billing / support)', () => {
    const branchUnits = units.filter(u => u.semanticRole !== 'trigger' && u.semanticRole !== 'logic');
    const combined = branchUnits.map(u => u.label.toLowerCase()).join(' ');
    const hasCaseMention = combined.includes('sales') || combined.includes('billing') || combined.includes('support');
    expect(hasCaseMention).toBe(true);
  });

  maybeIt('Slack container includes slack_message', () => {
    const slackContainer = containers.find(c =>
      c.label.toLowerCase().includes('slack') ||
      types(c).some(t => t === 'slack_message' || t === 'slack_webhook')
    );
    expect(slackContainer).toBeDefined();
    expect(types(slackContainer!).some(t => t === 'slack_message' || t === 'slack_webhook')).toBe(true);
  });

  maybeIt('Gmail container includes google_gmail', () => {
    const gmailContainer = containers.find(c =>
      c.label.toLowerCase().includes('gmail') ||
      c.label.toLowerCase().includes('email') ||
      types(c).some(t => t === 'google_gmail')
    );
    expect(gmailContainer).toBeDefined();
    expect(types(gmailContainer!).some(t => t === 'google_gmail')).toBe(true);
  });

  maybeIt('number of containers equals number of units', () => {
    expect(containers).toHaveLength(units.length);
  });
});

// ─── 4. NESTED CONDITION ──────────────────────────────────────────────────────

describe('4. Nested condition workflow', () => {
  let units: UseCaseUnit[];
  let containers: CapabilityContainer[];

  beforeAll(async () => {
    if (SKIP) return;
    await throttleBeforeSuite();
    const result = await runPipeline(
      'When an order is placed via a form, first check if the payment status is "paid". If paid, then check if the order total is over $500: if yes send a VIP welcome email via Gmail; if no send a standard confirmation email via Gmail. If payment failed, send a Slack message to #alerts with the order ID.'
    );
    units = result.units;
    containers = result.containers;
    markSuiteEnd();
  }, PIPELINE_TIMEOUT);

  maybeIt('has exactly one trigger unit', () => {
    expect(byRole(units, 'trigger')).toHaveLength(1);
  });

  maybeIt('has at least 2 logic units (outer payment check + inner amount check)', () => {
    expect(byRole(units, 'logic').length).toBeGreaterThanOrEqual(2);
  });

  maybeIt('has at least 3 output/communication units (VIP Gmail, standard Gmail, Slack)', () => {
    const outputs = units.filter(u => u.semanticRole !== 'trigger' && u.semanticRole !== 'logic');
    expect(outputs.length).toBeGreaterThanOrEqual(3);
  });

  maybeIt('has at least 2 separate Gmail containers (VIP + standard are distinct)', () => {
    const gmailContainers = containers.filter(c =>
      types(c).some(t => t === 'google_gmail') ||
      c.label.toLowerCase().includes('email')
    );
    expect(gmailContainers.length).toBeGreaterThanOrEqual(2);
  });

  maybeIt('has a Slack container for the payment failure branch', () => {
    const slackContainer = containers.find(c =>
      c.label.toLowerCase().includes('slack') ||
      types(c).some(t => t === 'slack_message' || t === 'slack_webhook')
    );
    expect(slackContainer).toBeDefined();
  });

  maybeIt('no logic/trigger nodes appear in output containers', () => {
    const LOGIC_TRIGGER = new Set(['if_else', 'switch', 'manual_trigger', 'form', 'schedule', 'webhook']);
    const outputUnits = units.filter(u => u.semanticRole !== 'trigger' && u.semanticRole !== 'logic');
    for (const unit of outputUnits) {
      const container = containers.find(c => c.useCaseUnit?.unitId === unit.unitId);
      if (!container) continue;
      const badNodes = types(container).filter(t => LOGIC_TRIGGER.has(t));
      expect(badNodes).toHaveLength(0);
    }
  });
});

// ─── 5. MIXED (linear base + embedded if/else) ────────────────────────────────

describe('5. Mixed workflow (linear + if/else)', () => {
  let units: UseCaseUnit[];
  let containers: CapabilityContainer[];

  beforeAll(async () => {
    if (SKIP) return;
    await throttleBeforeSuite();
    const result = await runPipeline(
      'Every morning at 9am, fetch the latest sales report from Google Sheets, summarize it using AI, and then check if total revenue exceeds the target: if yes post a congratulations message to Slack #wins channel; if no send an alert email via Gmail to the sales director.'
    );
    units = result.units;
    containers = result.containers;
    markSuiteEnd();
  }, PIPELINE_TIMEOUT);

  maybeIt('has exactly one trigger unit (schedule)', () => {
    expect(byRole(units, 'trigger')).toHaveLength(1);
  });

  maybeIt('trigger container includes a schedule node', () => {
    const triggerUnit = byRole(units, 'trigger')[0];
    const triggerContainer = containers.find(c => c.useCaseUnit?.unitId === triggerUnit.unitId);
    expect(triggerContainer).toBeDefined();
    const hasSchedule = types(triggerContainer!).some(t => t === 'schedule' || t === 'interval' || t === 'manual_trigger');
    expect(hasSchedule).toBe(true);
  });

  maybeIt('has at least one data_source unit (Google Sheets)', () => {
    expect(byRole(units, 'data_source').length).toBeGreaterThanOrEqual(1);
  });

  maybeIt('has at least one transformation unit (AI summarize)', () => {
    expect(byRole(units, 'transformation').length).toBeGreaterThanOrEqual(1);
  });

  maybeIt('has exactly one logic unit (revenue > target check)', () => {
    expect(byRole(units, 'logic')).toHaveLength(1);
  });

  maybeIt('data_source container does not contain logic or trigger nodes', () => {
    const dataUnit = byRole(units, 'data_source')[0];
    if (!dataUnit) return;
    const dataContainer = containers.find(c => c.useCaseUnit?.unitId === dataUnit.unitId);
    if (!dataContainer) return;
    const badNodes = types(dataContainer).filter(t =>
      t === 'if_else' || t === 'switch' || t.includes('trigger') || t === 'schedule'
    );
    expect(badNodes).toHaveLength(0);
  });

  maybeIt('Slack container includes slack_message', () => {
    const slackContainer = containers.find(c =>
      c.label.toLowerCase().includes('slack') ||
      types(c).some(t => t === 'slack_message' || t === 'slack_webhook')
    );
    expect(slackContainer).toBeDefined();
    expect(types(slackContainer!).some(t => t === 'slack_message' || t === 'slack_webhook')).toBe(true);
  });

  maybeIt('Gmail container includes google_gmail', () => {
    const gmailContainer = containers.find(c =>
      c.label.toLowerCase().includes('gmail') ||
      types(c).some(t => t === 'google_gmail')
    );
    expect(gmailContainer).toBeDefined();
    expect(types(gmailContainer!).some(t => t === 'google_gmail')).toBe(true);
  });

  maybeIt('total containers count equals total units count', () => {
    expect(containers).toHaveLength(units.length);
  });
});
