/**
 * Build-time Text Helper
 *
 * Optional helper for generating static text values once during configuration
 * (e.g., analytics metrics descriptions, default prompts). This is driven
 * entirely by registry metadata (NodeInputField.fillMode.supportsBuildtimeAI)
 * and is NOT used implicitly at runtime.
 */

import { LLMAdapter } from '../../shared/llm-adapter';

export interface BuildtimeTextRequest {
  fieldName: string;
  nodeType: string;
  nodeLabel?: string;
  userIntent: string;
  upstreamSummary?: string;
}

export class BuildtimeTextHelper {
  private llm = new LLMAdapter();

  /**
   * Generate a single static text value for a field that has fillMode
   * buildtime_ai_once enabled. The caller is responsible for persisting
   * the returned value into node.data.config and never re-calling this
   * for the same field unless the user explicitly asks for regeneration.
   */
  async generateTextOnce(request: BuildtimeTextRequest): Promise<string> {
    const { fieldName, nodeType, nodeLabel, userIntent, upstreamSummary } = request;

    const systemPrompt =
      'You generate concise, production-ready text snippets for workflow configuration fields. ' +
      'Return ONLY the text, no explanations, no JSON, no quotes.';

    const userContent = [
      `Workflow node type: ${nodeType}`,
      nodeLabel ? `Node label: ${nodeLabel}` : '',
      `Target field: ${fieldName}`,
      '',
      `User intent / prompt:`,
      userIntent,
      '',
      upstreamSummary ? `Upstream data summary:\n${upstreamSummary}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.llm.chat(
      'gemini',
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      {
        model: 'gemini-2.5-flash',
        apiKey: process.env.GEMINI_API_KEY,
        temperature: 0.4,
      }
    );

    return (response.content || '').trim();
  }
}

export const buildtimeTextHelper = new BuildtimeTextHelper();

