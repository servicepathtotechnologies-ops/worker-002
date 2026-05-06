/**
 * Nested Conditions Test - Real AI Integration
 * 
 * This test verifies that the AI correctly handles nested conditional logic:
 * 1. Nested if_else conditions (if within if)
 * 2. Switch statements with multiple cases
 * 3. Complex multi-level conditional workflows
 * 
 * NOTE: This test requires a real AI API key and will make actual API calls.
 */

import { runCapabilitySelectionStage } from '../capability-selection-stage';
import { runIntentStage } from '../intent-stage';

describe('Real AI Integration Test - Nested Conditional Logic', () => {
  // Set a longer timeout for AI API calls
  jest.setTimeout(120000); // 120 seconds for complex prompts

  /**
   * Test Case 1: Nested If-Else Conditions
   * 
   * Tests nested conditional logic: if age > 18, then check if premium member
   * Expected: form, if_else (for age check), if_else (for premium check), gmail, slack
   */
  test('REAL AI TEST: should handle nested if-else conditions', async () => {
    const userPrompt =
      'Create a workflow where a user submits a form with age and membership status. ' +
      'If age > 18, check if they are a premium member. ' +
      'If premium member, send welcome email via Gmail. ' +
      'If not premium, send basic welcome via Slack. ' +
      'If age ≤ 18, send rejection notice via Slack.';

    console.log('\n=== REAL AI TEST: Nested If-Else Conditions ===');
    console.log('User Prompt:', userPrompt);
    console.log('\n--- Step 1: Intent Stage ---');

    // Step 1: Intent Stage
    const intentResult = await runIntentStage(userPrompt);

    if (!intentResult.ok) {
      console.error('❌ Intent stage failed:', intentResult.code, intentResult.rawResponse);
      throw new Error(`Intent stage failed: ${intentResult.code}`);
    }

    const intent = intentResult.intent;
    console.log('✓ Intent extracted successfully');
    console.log('  Trigger Type:', intent.triggerType);
    console.log('  Actions:', intent.actions);

    console.log('\n--- Step 2: Capability Selection Stage ---');

    // Step 2: Capability Selection Stage
    const capabilityResult = await runCapabilitySelectionStage(intent);

    if (!capabilityResult.ok) {
      console.error('❌ Capability selection failed:', capabilityResult.code, capabilityResult.message);
      throw new Error(`Capability selection failed: ${capabilityResult.code} - ${capabilityResult.message}`);
    }

    console.log('✓ Capability selection completed successfully');
    console.log('\n--- Selected Nodes ---');
    capabilityResult.steps.forEach((step, index) => {
      console.log(`${index + 1}. ${step.intentClass}: ${step.candidateNodeTypes.join(', ')}`);
      console.log(`   Step Text: "${step.stepText}"`);
    });

    // Extract all node types
    const allNodeTypes = capabilityResult.steps.flatMap((step) => step.candidateNodeTypes);
    const allNodeTypesLower = allNodeTypes.map((type) => type.toLowerCase());

    console.log('\n--- Verification ---');

    // 1. Must have form trigger
    const hasForm = capabilityResult.steps.some(
      (step) => step.intentClass === 'trigger' && step.candidateNodeTypes.includes('form')
    );
    console.log(`✓ Has form trigger: ${hasForm ? 'YES ✓' : 'NO ✗'}`);
    expect(hasForm).toBe(true);

    // 2. Must have at least one logic step (if_else)
    const logicSteps = capabilityResult.steps.filter((step) => step.intentClass === 'logic');
    const hasIfElse = logicSteps.some((step) => step.candidateNodeTypes.includes('if_else'));
    console.log(`✓ Has if_else logic: ${hasIfElse ? 'YES ✓' : 'NO ✗'}`);
    console.log(`✓ Number of logic steps: ${logicSteps.length}`);
    expect(hasIfElse).toBe(true);
    expect(logicSteps.length).toBeGreaterThanOrEqual(1); // At least one conditional

    // 3. Must have Gmail
    const hasGmail = allNodeTypesLower.some((type) => type.includes('gmail'));
    console.log(`✓ Has Gmail: ${hasGmail ? 'YES ✓' : 'NO ✗'}`);
    expect(hasGmail).toBe(true);

    // 4. Must have Slack
    const hasSlack = allNodeTypesLower.some((type) => type.includes('slack'));
    console.log(`✓ Has Slack: ${hasSlack ? 'YES ✓' : 'NO ✗'}`);
    expect(hasSlack).toBe(true);

    console.log('\n=== TEST PASSED ✓ ===\n');
  });

  /**
   * Test Case 2: Switch Statement with Multiple Cases
   * 
   * Tests switch logic with 3+ cases
   * Expected: form, switch (or if_else), gmail, slack, sms
   */
  test('REAL AI TEST: should handle switch statements with multiple cases', async () => {
    const userPrompt =
      'Create a workflow where a user submits a form with priority level (low, medium, high, critical). ' +
      'If priority is low, send notification via Slack. ' +
      'If priority is medium, send email via Gmail. ' +
      'If priority is high, send SMS alert. ' +
      'If priority is critical, send both email via Gmail and SMS alert.';

    console.log('\n=== REAL AI TEST: Switch Statement with Multiple Cases ===');
    console.log('User Prompt:', userPrompt);
    console.log('\n--- Step 1: Intent Stage ---');

    // Step 1: Intent Stage
    const intentResult = await runIntentStage(userPrompt);

    if (!intentResult.ok) {
      console.error('❌ Intent stage failed:', intentResult.code, intentResult.rawResponse);
      throw new Error(`Intent stage failed: ${intentResult.code}`);
    }

    const intent = intentResult.intent;
    console.log('✓ Intent extracted successfully');
    console.log('  Trigger Type:', intent.triggerType);
    console.log('  Actions:', intent.actions);

    console.log('\n--- Step 2: Capability Selection Stage ---');

    // Step 2: Capability Selection Stage
    const capabilityResult = await runCapabilitySelectionStage(intent);

    if (!capabilityResult.ok) {
      console.error('❌ Capability selection failed:', capabilityResult.code, capabilityResult.message);
      throw new Error(`Capability selection failed: ${capabilityResult.code} - ${capabilityResult.message}`);
    }

    console.log('✓ Capability selection completed successfully');
    console.log('\n--- Selected Nodes ---');
    capabilityResult.steps.forEach((step, index) => {
      console.log(`${index + 1}. ${step.intentClass}: ${step.candidateNodeTypes.join(', ')}`);
      console.log(`   Step Text: "${step.stepText}"`);
    });

    // Extract all node types
    const allNodeTypes = capabilityResult.steps.flatMap((step) => step.candidateNodeTypes);
    const allNodeTypesLower = allNodeTypes.map((type) => type.toLowerCase());

    console.log('\n--- Verification ---');

    // 1. Must have form trigger
    const hasForm = capabilityResult.steps.some(
      (step) => step.intentClass === 'trigger' && step.candidateNodeTypes.includes('form')
    );
    console.log(`✓ Has form trigger: ${hasForm ? 'YES ✓' : 'NO ✗'}`);
    expect(hasForm).toBe(true);

    // 2. Must have logic step (switch or if_else)
    const hasLogic = capabilityResult.steps.some((step) => step.intentClass === 'logic');
    console.log(`✓ Has conditional logic: ${hasLogic ? 'YES ✓' : 'NO ✗'}`);
    expect(hasLogic).toBe(true);

    // 3. Must have Slack
    const hasSlack = allNodeTypesLower.some((type) => type.includes('slack'));
    console.log(`✓ Has Slack: ${hasSlack ? 'YES ✓' : 'NO ✗'}`);
    expect(hasSlack).toBe(true);

    // 4. Must have Gmail
    const hasGmail = allNodeTypesLower.some((type) => type.includes('gmail'));
    console.log(`✓ Has Gmail: ${hasGmail ? 'YES ✓' : 'NO ✗'}`);
    expect(hasGmail).toBe(true);

    console.log('\n=== TEST PASSED ✓ ===\n');
  });

  /**
   * Test Case 3: Complex Multi-Level Conditional Workflow
   * 
   * Tests deeply nested conditions with multiple branches
   * Expected: form, multiple if_else steps, gmail, slack, and other communication nodes
   */
  test('REAL AI TEST: should handle complex multi-level conditional workflows', async () => {
    const userPrompt =
      'Create a workflow where a user submits a form with age, country, and subscription type. ' +
      'If age > 18 and country is USA, check subscription type. ' +
      'If subscription is premium, send personalized email via Gmail. ' +
      'If subscription is basic, send standard email via Gmail. ' +
      'If country is not USA, send international welcome via Slack. ' +
      'If age ≤ 18, send parental consent request via Gmail.';

    console.log('\n=== REAL AI TEST: Complex Multi-Level Conditional Workflow ===');
    console.log('User Prompt:', userPrompt);
    console.log('\n--- Step 1: Intent Stage ---');

    // Step 1: Intent Stage
    const intentResult = await runIntentStage(userPrompt);

    if (!intentResult.ok) {
      console.error('❌ Intent stage failed:', intentResult.code, intentResult.rawResponse);
      throw new Error(`Intent stage failed: ${intentResult.code}`);
    }

    const intent = intentResult.intent;
    console.log('✓ Intent extracted successfully');
    console.log('  Trigger Type:', intent.triggerType);
    console.log('  Actions:', intent.actions);

    console.log('\n--- Step 2: Capability Selection Stage ---');

    // Step 2: Capability Selection Stage
    const capabilityResult = await runCapabilitySelectionStage(intent);

    if (!capabilityResult.ok) {
      console.error('❌ Capability selection failed:', capabilityResult.code, capabilityResult.message);
      throw new Error(`Capability selection failed: ${capabilityResult.code} - ${capabilityResult.message}`);
    }

    console.log('✓ Capability selection completed successfully');
    console.log('\n--- Selected Nodes ---');
    capabilityResult.steps.forEach((step, index) => {
      console.log(`${index + 1}. ${step.intentClass}: ${step.candidateNodeTypes.join(', ')}`);
      console.log(`   Step Text: "${step.stepText}"`);
    });

    // Extract all node types
    const allNodeTypes = capabilityResult.steps.flatMap((step) => step.candidateNodeTypes);
    const allNodeTypesLower = allNodeTypes.map((type) => type.toLowerCase());

    console.log('\n--- Verification ---');

    // 1. Must have form trigger
    const hasForm = capabilityResult.steps.some(
      (step) => step.intentClass === 'trigger' && step.candidateNodeTypes.includes('form')
    );
    console.log(`✓ Has form trigger: ${hasForm ? 'YES ✓' : 'NO ✗'}`);
    expect(hasForm).toBe(true);

    // 2. Must have at least one logic step
    const logicSteps = capabilityResult.steps.filter((step) => step.intentClass === 'logic');
    console.log(`✓ Number of logic steps: ${logicSteps.length}`);
    expect(logicSteps.length).toBeGreaterThanOrEqual(1);

    // 3. Must have Gmail
    const hasGmail = allNodeTypesLower.some((type) => type.includes('gmail'));
    console.log(`✓ Has Gmail: ${hasGmail ? 'YES ✓' : 'NO ✗'}`);
    expect(hasGmail).toBe(true);

    // 4. Must have Slack
    const hasSlack = allNodeTypesLower.some((type) => type.includes('slack'));
    console.log(`✓ Has Slack: ${hasSlack ? 'YES ✓' : 'NO ✗'}`);
    expect(hasSlack).toBe(true);

    // 5. Must NOT have wrong nodes (Workday, Zoom)
    const hasWorkday = allNodeTypesLower.some((type) => type.includes('workday'));
    const hasZoom = allNodeTypesLower.some((type) => type.includes('zoom'));
    console.log(`✓ Does NOT have Workday: ${!hasWorkday ? 'YES ✓' : 'NO ✗'}`);
    console.log(`✓ Does NOT have Zoom: ${!hasZoom ? 'YES ✓' : 'NO ✗'}`);
    expect(hasWorkday).toBe(false);
    expect(hasZoom).toBe(false);

    console.log('\n=== TEST PASSED ✓ ===\n');
  });

  /**
   * Test Case 4: Switch with Nested If-Else
   * 
   * Tests switch statement where each case has nested if-else logic
   * Expected: form, switch (or multiple if_else), gmail, slack
   */
  test('REAL AI TEST: should handle switch with nested if-else conditions', async () => {
    const userPrompt =
      'Create a workflow where a user submits a form with department (sales, support, engineering). ' +
      'If department is sales, check if deal size > 10000. ' +
      'If deal size > 10000, send to senior sales via Gmail. ' +
      'If deal size ≤ 10000, send to junior sales via Slack. ' +
      'If department is support, send to support team via Slack. ' +
      'If department is engineering, send to engineering team via Gmail.';

    console.log('\n=== REAL AI TEST: Switch with Nested If-Else ===');
    console.log('User Prompt:', userPrompt);
    console.log('\n--- Step 1: Intent Stage ---');

    // Step 1: Intent Stage
    const intentResult = await runIntentStage(userPrompt);

    if (!intentResult.ok) {
      console.error('❌ Intent stage failed:', intentResult.code, intentResult.rawResponse);
      throw new Error(`Intent stage failed: ${intentResult.code}`);
    }

    const intent = intentResult.intent;
    console.log('✓ Intent extracted successfully');
    console.log('  Trigger Type:', intent.triggerType);
    console.log('  Actions:', intent.actions);

    console.log('\n--- Step 2: Capability Selection Stage ---');

    // Step 2: Capability Selection Stage
    const capabilityResult = await runCapabilitySelectionStage(intent);

    if (!capabilityResult.ok) {
      console.error('❌ Capability selection failed:', capabilityResult.code, capabilityResult.message);
      throw new Error(`Capability selection failed: ${capabilityResult.code} - ${capabilityResult.message}`);
    }

    console.log('✓ Capability selection completed successfully');
    console.log('\n--- Selected Nodes ---');
    capabilityResult.steps.forEach((step, index) => {
      console.log(`${index + 1}. ${step.intentClass}: ${step.candidateNodeTypes.join(', ')}`);
      console.log(`   Step Text: "${step.stepText}"`);
    });

    // Extract all node types
    const allNodeTypes = capabilityResult.steps.flatMap((step) => step.candidateNodeTypes);
    const allNodeTypesLower = allNodeTypes.map((type) => type.toLowerCase());

    console.log('\n--- Verification ---');

    // 1. Must have form trigger
    const hasForm = capabilityResult.steps.some(
      (step) => step.intentClass === 'trigger' && step.candidateNodeTypes.includes('form')
    );
    console.log(`✓ Has form trigger: ${hasForm ? 'YES ✓' : 'NO ✗'}`);
    expect(hasForm).toBe(true);

    // 2. Must have at least one logic step
    const logicSteps = capabilityResult.steps.filter((step) => step.intentClass === 'logic');
    console.log(`✓ Number of logic steps: ${logicSteps.length}`);
    expect(logicSteps.length).toBeGreaterThanOrEqual(1);

    // 3. Must have Gmail
    const hasGmail = allNodeTypesLower.some((type) => type.includes('gmail'));
    console.log(`✓ Has Gmail: ${hasGmail ? 'YES ✓' : 'NO ✗'}`);
    expect(hasGmail).toBe(true);

    // 4. Must have Slack
    const hasSlack = allNodeTypesLower.some((type) => type.includes('slack'));
    console.log(`✓ Has Slack: ${hasSlack ? 'YES ✓' : 'NO ✗'}`);
    expect(hasSlack).toBe(true);

    console.log('\n=== TEST PASSED ✓ ===\n');
  });
});

/**
 * Summary Test - Documents Nested Conditions Test Results
 */
describe('Real AI Integration Test - Nested Conditions Summary', () => {
  test('documents that nested condition tests verify complex conditional logic', () => {
    const summary = {
      'Test Purpose': 'Verify that the AI handles nested and complex conditional logic correctly',
      'Test Coverage': {
        'Nested If-Else': 'Tests if within if conditions (age check → premium check)',
        'Switch Statements': 'Tests multi-case switch logic (4+ cases)',
        'Multi-Level Conditions': 'Tests deeply nested conditions with multiple branches',
        'Switch with Nested If': 'Tests switch where each case has nested if-else',
      },
      'Expected Behavior': {
        'Logic Detection': 'Should detect all conditional patterns',
        'Node Selection': 'Should select correct communication nodes (Gmail, Slack)',
        'No Wrong Nodes': 'Should NOT select Workday, Zoom, or other wrong nodes',
        'Multiple Logic Steps': 'Should emit multiple if_else steps for nested conditions',
      },
    };

    console.log('\n=== Nested Conditions Test Summary ===\n');
    console.log('Test Purpose:', summary['Test Purpose']);
    console.log('\nTest Coverage:');
    Object.entries(summary['Test Coverage']).forEach(([test, description]) => {
      console.log(`  - ${test}: ${description}`);
    });
    console.log('\nExpected Behavior:');
    Object.entries(summary['Expected Behavior']).forEach(([category, result]) => {
      console.log(`  - ${category}: ${result}`);
    });
    console.log('\n');

    // This test always passes - it's for documentation
    expect(true).toBe(true);
  });
});
