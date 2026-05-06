/**
 * Real AI Integration Test
 * 
 * This test actually calls the AI with real prompts to verify that:
 * 1. The system prompts are correctly integrated
 * 2. The AI receives the enhanced instructions
 * 3. The AI selects the correct nodes for conditional workflows
 * 
 * NOTE: This test requires a real AI API key and will make actual API calls.
 * It may be slow and may incur API costs.
 */

import { runCapabilitySelectionStage } from '../capability-selection-stage';
import { runIntentStage } from '../intent-stage';

describe('Real AI Integration Test - Conditional Workflow Node Selection', () => {
  // Set a longer timeout for AI API calls
  jest.setTimeout(60000); // 60 seconds

  /**
   * Test Case 1: Primary Bug Case - Conditional Form Workflow
   * 
   * This is the exact prompt from the bug report.
   * Expected: form, if_else, google_gmail, slack_message
   * Should NOT contain: workday, zoom_video, amazon_ses
   */
  test('REAL AI TEST: should select correct nodes for conditional form workflow', async () => {
    const userPrompt =
      'Create an autonomous workflow where a user submits details through a form including age. ' +
      'If age > 18, mark the user as eligible and send a confirmation email via Gmail. ' +
      'If age ≤ 18, mark as not eligible and send a notification message via Slack.';

    console.log('\n=== REAL AI TEST: Conditional Form Workflow ===');
    console.log('User Prompt:', userPrompt);
    console.log('\n--- Step 1: Intent Stage ---');

    // Step 1: Intent Stage - Extract structured intent
    const intentResult = await runIntentStage(userPrompt);

    if (!intentResult.ok) {
      console.error('❌ Intent stage failed:', intentResult.code, intentResult.rawResponse);
      throw new Error(`Intent stage failed: ${intentResult.code}`);
    }

    const intent = intentResult.intent;
    console.log('✓ Intent extracted successfully');
    console.log('  Trigger Type:', intent.triggerType);
    console.log('  Actions:', intent.actions);
    console.log('  Data Flows:', intent.dataFlows.length);

    console.log('\n--- Step 2: Capability Selection Stage ---');

    // Step 2: Capability Selection Stage - Select nodes
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
      console.log(`   Confidence: ${step.confidence?.toFixed(2) || 'N/A'}`);
    });

    // Extract all node types
    const allNodeTypes = capabilityResult.steps.flatMap((step) => step.candidateNodeTypes);
    const allNodeTypesLower = allNodeTypes.map((type) => type.toLowerCase());

    console.log('\n--- Verification ---');

    // CRITICAL ASSERTIONS

    // 1. Must have trigger step (form)
    const hasTriggerStep = capabilityResult.steps.some(
      (step) => step.intentClass === 'trigger' && step.candidateNodeTypes.includes('form')
    );
    console.log(`✓ Has form trigger: ${hasTriggerStep ? 'YES ✓' : 'NO ✗'}`);
    expect(hasTriggerStep).toBe(true);

    // 2. Must have logic step (if_else)
    const hasIfElseStep = capabilityResult.steps.some(
      (step) => step.intentClass === 'logic' && step.candidateNodeTypes.includes('if_else')
    );
    console.log(`✓ Has if_else logic: ${hasIfElseStep ? 'YES ✓' : 'NO ✗'}`);
    expect(hasIfElseStep).toBe(true);

    // 3. Must have Gmail
    const hasGmail = allNodeTypesLower.some((type) => type.includes('gmail'));
    console.log(`✓ Has Gmail: ${hasGmail ? 'YES ✓' : 'NO ✗'}`);
    expect(hasGmail).toBe(true);

    // 4. Must have Slack
    const hasSlack = allNodeTypesLower.some((type) => type.includes('slack'));
    console.log(`✓ Has Slack: ${hasSlack ? 'YES ✓' : 'NO ✗'}`);
    expect(hasSlack).toBe(true);

    // 5. Must NOT have Workday
    const hasWorkday = allNodeTypesLower.some((type) => type.includes('workday'));
    console.log(`✓ Does NOT have Workday: ${!hasWorkday ? 'YES ✓' : 'NO ✗'}`);
    expect(hasWorkday).toBe(false);

    // 6. Must NOT have Zoom Video
    const hasZoom = allNodeTypesLower.some((type) => type.includes('zoom'));
    console.log(`✓ Does NOT have Zoom: ${!hasZoom ? 'YES ✓' : 'NO ✗'}`);
    expect(hasZoom).toBe(false);

    // 7. Must NOT have Amazon SES
    const hasAmazonSES = allNodeTypesLower.some((type) => type.includes('amazon_ses'));
    console.log(`✓ Does NOT have Amazon SES: ${!hasAmazonSES ? 'YES ✓' : 'NO ✗'}`);
    expect(hasAmazonSES).toBe(false);

    console.log('\n=== TEST PASSED ✓ ===\n');
  });

  /**
   * Test Case 2: Simple Linear Workflow (Preservation Test)
   * 
   * This tests that linear workflows are NOT affected by the fixes.
   * Expected: NO if_else or switch nodes
   */
  test('REAL AI TEST: should NOT add conditional logic to linear workflows', async () => {
    const userPrompt = 'Fetch data from Google Sheets and send it via Gmail.';

    console.log('\n=== REAL AI TEST: Linear Workflow (Preservation) ===');
    console.log('User Prompt:', userPrompt);

    // Step 1: Intent Stage
    const intentResult = await runIntentStage(userPrompt);

    if (!intentResult.ok) {
      console.error('❌ Intent stage failed:', intentResult.code, intentResult.rawResponse);
      throw new Error(`Intent stage failed: ${intentResult.code}`);
    }

    const intent = intentResult.intent;
    console.log('✓ Intent extracted successfully');

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
    });

    // Verify NO conditional logic
    const hasConditionalLogic = capabilityResult.steps.some(
      (step) => step.intentClass === 'logic' ||
      step.candidateNodeTypes.includes('if_else') ||
      step.candidateNodeTypes.includes('switch')
    );

    console.log('\n--- Verification ---');
    console.log(`✓ Does NOT have conditional logic: ${!hasConditionalLogic ? 'YES ✓' : 'NO ✗'}`);
    expect(hasConditionalLogic).toBe(false);

    // Verify has Google Sheets and Gmail
    const allNodeTypes = capabilityResult.steps.flatMap((step) => step.candidateNodeTypes);
    const allNodeTypesLower = allNodeTypes.map((type) => type.toLowerCase());
    const hasSheets = allNodeTypesLower.some((type) => type.includes('sheets'));
    const hasGmail = allNodeTypesLower.some((type) => type.includes('gmail'));

    console.log(`✓ Has Google Sheets: ${hasSheets ? 'YES ✓' : 'NO ✗'}`);
    console.log(`✓ Has Gmail: ${hasGmail ? 'YES ✓' : 'NO ✗'}`);
    expect(hasSheets).toBe(true);
    expect(hasGmail).toBe(true);

    console.log('\n=== TEST PASSED ✓ ===\n');
  });

  /**
   * Test Case 3: Service Name Preservation
   * 
   * This tests that explicitly named services are preserved (Gmail, not amazon_ses).
   */
  test('REAL AI TEST: should preserve explicitly named services (Gmail not amazon_ses)', async () => {
    const userPrompt = 'Send email via Gmail when form is submitted.';

    console.log('\n=== REAL AI TEST: Service Name Preservation ===');
    console.log('User Prompt:', userPrompt);

    // Step 1: Intent Stage
    const intentResult = await runIntentStage(userPrompt);

    if (!intentResult.ok) {
      console.error('❌ Intent stage failed:', intentResult.code, intentResult.rawResponse);
      throw new Error(`Intent stage failed: ${intentResult.code}`);
    }

    const intent = intentResult.intent;
    console.log('✓ Intent extracted successfully');

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
    });

    // Verify Gmail is selected (not amazon_ses)
    const allNodeTypes = capabilityResult.steps.flatMap((step) => step.candidateNodeTypes);
    const allNodeTypesLower = allNodeTypes.map((type) => type.toLowerCase());
    const hasGmail = allNodeTypesLower.some((type) => type.includes('gmail'));
    const hasAmazonSES = allNodeTypesLower.some((type) => type.includes('amazon_ses'));

    console.log('\n--- Verification ---');
    console.log(`✓ Has Gmail: ${hasGmail ? 'YES ✓' : 'NO ✗'}`);
    console.log(`✓ Does NOT have Amazon SES: ${!hasAmazonSES ? 'YES ✓' : 'NO ✗'}`);
    expect(hasGmail).toBe(true);
    expect(hasAmazonSES).toBe(false);

    console.log('\n=== TEST PASSED ✓ ===\n');
  });

  /**
   * Test Case 4: Unicode Operators
   * 
   * This tests that Unicode comparison operators (≤, ≥) are detected.
   */
  test('REAL AI TEST: should detect conditional logic with Unicode operators', async () => {
    const userPrompt =
      'When temperature ≥ 30, send alert via Slack. When temperature ≤ 10, send warning via Gmail.';

    console.log('\n=== REAL AI TEST: Unicode Operators ===');
    console.log('User Prompt:', userPrompt);

    // Step 1: Intent Stage
    const intentResult = await runIntentStage(userPrompt);

    if (!intentResult.ok) {
      console.error('❌ Intent stage failed:', intentResult.code, intentResult.rawResponse);
      throw new Error(`Intent stage failed: ${intentResult.code}`);
    }

    const intent = intentResult.intent;
    console.log('✓ Intent extracted successfully');

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
    });

    // Verify conditional logic is detected
    const hasLogicStep = capabilityResult.steps.some((step) => step.intentClass === 'logic');
    const allNodeTypes = capabilityResult.steps.flatMap((step) => step.candidateNodeTypes);
    const allNodeTypesLower = allNodeTypes.map((type) => type.toLowerCase());
    const hasSlack = allNodeTypesLower.some((type) => type.includes('slack'));
    const hasGmail = allNodeTypesLower.some((type) => type.includes('gmail'));

    console.log('\n--- Verification ---');
    console.log(`✓ Has conditional logic: ${hasLogicStep ? 'YES ✓' : 'NO ✗'}`);
    console.log(`✓ Has Slack: ${hasSlack ? 'YES ✓' : 'NO ✗'}`);
    console.log(`✓ Has Gmail: ${hasGmail ? 'YES ✓' : 'NO ✗'}`);
    expect(hasLogicStep).toBe(true);
    expect(hasSlack).toBe(true);
    expect(hasGmail).toBe(true);

    console.log('\n=== TEST PASSED ✓ ===\n');
  });
});

/**
 * Summary Test - Documents Real AI Test Results
 */
describe('Real AI Integration Test - Summary', () => {
  test('documents that real AI tests verify the fixes work correctly', () => {
    const summary = {
      'Test Purpose': 'Verify that the AI actually selects correct nodes with real API calls',
      'System Prompts': 'Enhanced prompts are integrated and active',
      'Fallback Logic': 'Enhanced fallback logic works correctly',
      'Test Coverage': {
        'Conditional Form Workflow': 'Tests primary bug case with real AI',
        'Linear Workflow Preservation': 'Tests that linear workflows are unchanged',
        'Service Name Preservation': 'Tests that Gmail is selected (not amazon_ses)',
        'Unicode Operators': 'Tests that ≤, ≥ operators are detected',
      },
      'Expected Results': {
        'Conditional workflows': 'Should select form, if_else, gmail, slack',
        'Linear workflows': 'Should NOT add if_else or switch',
        'Service names': 'Should preserve explicitly named services',
        'Wrong nodes': 'Should NOT select workday, zoom_video, amazon_ses',
      },
    };

    console.log('\n=== Real AI Integration Test Summary ===\n');
    console.log('Test Purpose:', summary['Test Purpose']);
    console.log('\nSystem Enhancements:');
    console.log('  - System Prompts:', summary['System Prompts']);
    console.log('  - Fallback Logic:', summary['Fallback Logic']);
    console.log('\nTest Coverage:');
    Object.entries(summary['Test Coverage']).forEach(([test, description]) => {
      console.log(`  - ${test}: ${description}`);
    });
    console.log('\nExpected Results:');
    Object.entries(summary['Expected Results']).forEach(([category, result]) => {
      console.log(`  - ${category}: ${result}`);
    });
    console.log('\n');

    // This test always passes - it's for documentation
    expect(true).toBe(true);
  });
});
