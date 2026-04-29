import * as cheerio from 'cheerio';
import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';

function mergeInputs(context: { config?: Record<string, any>; inputs?: Record<string, any> }): Record<string, any> {
  return { ...(context.config || {}), ...(context.inputs || {}) };
}

export function overrideHtml(def: UnifiedNodeDefinition, _schema: NodeSchema): UnifiedNodeDefinition {
  const operationOptions = ['parse', 'extract', 'clean'].map((value) => ({
    label: value.charAt(0).toUpperCase() + value.slice(1),
    value,
  }));

  return {
    ...def,
    inputSchema: {
      ...def.inputSchema,
      operation: {
        ...def.inputSchema.operation,
        ui: { ...(def.inputSchema.operation?.ui || {}), options: operationOptions },
      },
      selector: {
        type: 'string',
        description: 'CSS selector used by extract. Omit to extract the whole document text.',
        required: false,
        role: 'config',
        fillMode: { default: 'buildtime_ai_once', supportsRuntimeAI: false, supportsBuildtimeAI: true },
      },
      attribute: {
        type: 'string',
        description: 'Optional attribute to extract from selected elements, e.g. href or src.',
        required: false,
        role: 'config',
        fillMode: { default: 'buildtime_ai_once', supportsRuntimeAI: false, supportsBuildtimeAI: true },
      },
    },
    execute: async (context) => {
      const inputs = mergeInputs(context);
      const operation = String(inputs.operation || 'parse');
      const html = String(inputs.html || inputs.content || '');

      try {
        if (!html.trim()) throw new Error('html is required');
        const $ = cheerio.load(html);

        if (operation === 'clean') {
          $('script,style,noscript,iframe').remove();
          return {
            success: true,
            output: {
              operation,
              html: $.html(),
              text: $.root().text().replace(/\s+/g, ' ').trim(),
            },
          };
        }

        if (operation === 'extract') {
          const selector = String(inputs.selector || 'body').trim() || 'body';
          const attribute = String(inputs.attribute || '').trim();
          const matches = $(selector)
            .toArray()
            .map((el) => {
              const node = $(el);
              return attribute
                ? { value: node.attr(attribute) || '', text: node.text().trim(), html: node.html() || '' }
                : { text: node.text().trim(), html: node.html() || '' };
            });
          return { success: true, output: { operation, selector, attribute: attribute || undefined, matches } };
        }

        if (operation === 'parse') {
          const title = $('title').first().text().trim();
          const headings = $('h1,h2,h3').toArray().map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: $(el).text().trim(),
          }));
          const links = $('a[href]').toArray().map((el) => ({
            text: $(el).text().trim(),
            href: $(el).attr('href') || '',
          }));
          return {
            success: true,
            output: {
              operation,
              title,
              text: $.root().text().replace(/\s+/g, ' ').trim(),
              headings,
              links,
            },
          };
        }

        throw new Error(`Unsupported HTML operation: ${operation}`);
      } catch (error: any) {
        return { success: false, error: { code: 'HTML_OPERATION_FAILED', message: error?.message || 'HTML operation failed' } };
      }
    },
  };
}
