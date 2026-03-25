import {
  inferFieldHelpMetadata,
  isCredentialQuestionCategory,
  CREDENTIAL_QUESTION_HELP_CATEGORIES,
} from '../field-help-metadata';

describe('field-help-metadata', () => {
  it('classifies api keys and spreadsheet IDs', () => {
    expect(inferFieldHelpMetadata('openai_gpt', 'apiKey', 'string').helpCategory).toBe('api_key');
    expect(inferFieldHelpMetadata('google_sheets', 'spreadsheetId', 'string').helpCategory).toBe(
      'spreadsheet_id'
    );
    expect(inferFieldHelpMetadata('slack_message', 'webhookUrl', 'string').helpCategory).toBe('webhook_url');
  });

  it('marks credential-question categories for wizard', () => {
    expect(isCredentialQuestionCategory('api_key')).toBe(true);
    expect(isCredentialQuestionCategory('spreadsheet_id')).toBe(true);
    expect(isCredentialQuestionCategory('webhook_url')).toBe(false);
    expect(isCredentialQuestionCategory('none')).toBe(false);
  });

  it('keeps CREDENTIAL_QUESTION set free of webhook/callback URLs', () => {
    expect(CREDENTIAL_QUESTION_HELP_CATEGORIES.has('webhook_url')).toBe(false);
    expect(CREDENTIAL_QUESTION_HELP_CATEGORIES.has('callback_url')).toBe(false);
  });
});
