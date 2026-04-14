import { parseStructuralBlueprintContract } from '../structural-blueprint-contract';

describe('parseStructuralBlueprintContract', () => {
  it('parses a complete sectioned blueprint', () => {
    const parsed = parseStructuralBlueprintContract(`
ARCHITECTURE_ORDER:
- 1. webhook - receive order
- 2. if_else - branch by amount
- 3. google_gmail - send confirmation
- 4. slack_message - notify review

BRANCHING_RULES:
- if amount > 5000 -> google_gmail
- else -> slack_message

DATA_FLOW_MAP:
- webhook.orderAmount -> if_else.conditions (threshold check)
- if_else.true -> google_gmail.input (VIP confirmation)
- if_else.false -> slack_message.input (review notification)

FIELD_OWNERSHIP_PLAN:
- if_else.conditions = buildtime_ai_once
- google_gmail.credentialId = manual_static
- slack_message.webhookUrl = manual_static

VALIDATION_CHECKS:
- exactly one trigger
- both branch terminals reachable
`);

    expect(parsed).not.toBeNull();
    expect(parsed?.architectureOrder.length).toBeGreaterThanOrEqual(2);
    expect(parsed?.dataFlowMap.length).toBeGreaterThan(0);
  });

  it('returns null when required sections are missing', () => {
    const parsed = parseStructuralBlueprintContract(`
ARCHITECTURE_ORDER:
- 1. webhook - receive order
- 2. log_output - done
`);

    expect(parsed).toBeNull();
  });
});

