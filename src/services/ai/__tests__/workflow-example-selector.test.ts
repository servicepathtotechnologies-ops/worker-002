import { describe, it, expect } from '@jest/globals';
import { workflowExampleSelector } from '../workflow-example-selector';
import { WorkflowIntentType, type IntentClassification } from '../intent-classifier';

describe('WorkflowExampleSelector', () => {
  const intentNotification: IntentClassification = {
    intent: WorkflowIntentType.NOTIFICATION_WORKFLOW,
    confidence: 0.9,
    requiresAI: false,
    expectedComplexity: 'simple',
    suggestedPatterns: [],
    estimatedNodeCount: 2,
    reasoning: '',
  };

  const intentDataSync: IntentClassification = {
    intent: WorkflowIntentType.DATA_SYNC,
    confidence: 0.9,
    requiresAI: false,
    expectedComplexity: 'medium',
    suggestedPatterns: [],
    estimatedNodeCount: 3,
    reasoning: '',
  };

  const intentIntegration: IntentClassification = {
    intent: WorkflowIntentType.INTEGRATION_BRIDGE,
    confidence: 0.9,
    requiresAI: false,
    expectedComplexity: 'simple',
    suggestedPatterns: [],
    estimatedNodeCount: 2,
    reasoning: '',
  };

  it('should prefer webhook_to_slack_notification_v1 for webhook + Slack prompt', () => {
    const result = workflowExampleSelector.selectBestExample({
      prompt: 'When a webhook is received, send a notification message to Slack channel',
      triggerType: 'webhook',
      intent: intentNotification,
    });

    expect(result).not.toBeNull();
    expect(result!.example.id).toBe('webhook_to_slack_notification_v1');
  });

  it('should prefer sheets_scheduled_api_to_sheets_v1 for daily API to Google Sheets prompt', () => {
    const result = workflowExampleSelector.selectBestExample({
      prompt: 'Save API data to Google Sheets every day on a schedule',
      triggerType: 'schedule',
      intent: intentDataSync,
    });

    expect(result).not.toBeNull();
    expect(result!.example.id).toBe('sheets_scheduled_api_to_sheets_v1');
  });

  it('should prefer crm_lead_capture_hubspot_v1 for CRM lead capture prompt', () => {
    const result = workflowExampleSelector.selectBestExample({
      prompt: 'Create a CRM lead capture workflow: form submission to HubSpot contact',
      triggerType: 'form',
      intent: intentIntegration,
    });

    expect(result).not.toBeNull();
    expect(result!.example.id).toBe('crm_lead_capture_hubspot_v1');
  });
});

