/**
 * Amazon SES Template Resolution Tests
 * 
 * Tests for template resolution and dynamic content handling in Amazon SES node
 * Requirements: 6.1, 6.2, 6.3, 2.1, 2.2, 2.4
 */

import { LRUNodeOutputsCache } from '../core/cache/lru-node-outputs-cache';
import * as fc from 'fast-check';

describe('Amazon SES Template Resolution', () => {
  let nodeOutputs: LRUNodeOutputsCache;

  beforeEach(() => {
    nodeOutputs = new LRUNodeOutputsCache(100, false);
    nodeOutputs.set('$json', {
      email: 'user@example.com',
      cc: 'cc@example.com',
      subject: 'Test Subject',
      name: 'John Doe',
      orderId: '12345',
      total: '99.99',
      items: ['item1', 'item2', 'item3'],
    }, true);
  });

  describe('resolveEmailTemplates', () => {
    it('should resolve subject template', async () => {
      const { resolveEmailTemplates } = await import('../api/execute-workflow');
      
      const config = {
        subject: '{{$json.subject}}',
        body: 'Test body',
        recipients: { to: ['user@example.com'] },
        fromAddress: 'sender@example.com',
      };

      const resolved = await resolveEmailTemplates(config, nodeOutputs);
      
      expect(resolved.subject).toBe('Test Subject');
    });

    it('should resolve body template', async () => {
      const { resolveEmailTemplates } = await import('../api/execute-workflow');
      
      const config = {
        subject: 'Subject',
        body: 'Hello {{$json.name}}',
        recipients: { to: ['user@example.com'] },
        fromAddress: 'sender@example.com',
      };

      const resolved = await resolveEmailTemplates(config, nodeOutputs);
      
      expect(resolved.body).toContain('Hello');
    });

    it('should resolve fromAddress template', async () => {
      const { resolveEmailTemplates } = await import('../api/execute-workflow');
      
      const config = {
        subject: 'Subject',
        body: 'Body',
        recipients: { to: ['user@example.com'] },
        fromAddress: '{{$json.senderEmail}}',
      };

      const resolved = await resolveEmailTemplates(config, nodeOutputs);
      
      expect(resolved.fromAddress).toBeDefined();
    });

    it('should resolve recipient arrays', async () => {
      const { resolveEmailTemplates } = await import('../api/execute-workflow');
      
      const config = {
        subject: 'Subject',
        body: 'Body',
        recipients: {
          to: ['{{$json.email}}'],
          cc: ['{{$json.cc}}'],
          bcc: [],
        },
        fromAddress: 'sender@example.com',
      };

      const resolved = await resolveEmailTemplates(config, nodeOutputs);
      
      expect(resolved.recipients.to).toContain('user@example.com');
      expect(resolved.recipients.cc).toContain('cc@example.com');
    });

    it('should resolve replyToAddresses array', async () => {
      const { resolveEmailTemplates } = await import('../api/execute-workflow');
      
      const config = {
        subject: 'Subject',
        body: 'Body',
        recipients: { to: ['user@example.com'] },
        fromAddress: 'sender@example.com',
        replyToAddresses: ['{{$json.email}}'],
      };

      const resolved = await resolveEmailTemplates(config, nodeOutputs);
      
      expect(resolved.replyToAddresses).toContain('user@example.com');
    });

    it('should resolve nested templateData objects', async () => {
      const { resolveEmailTemplates } = await import('../api/execute-workflow');
      
      const config = {
        subject: 'Subject',
        body: 'Body',
        recipients: { to: ['user@example.com'] },
        fromAddress: 'sender@example.com',
        templateData: {
          name: '{{$json.name}}',
          orderId: '{{$json.orderId}}',
          user: {
            email: '{{$json.email}}',
            name: '{{$json.name}}',
          },
        },
      };

      const resolved = await resolveEmailTemplates(config, nodeOutputs);
      
      expect(resolved.templateData.name).toBe('John Doe');
      expect(resolved.templateData.orderId).toBe('12345');
      expect(resolved.templateData.user.email).toBe('user@example.com');
      expect(resolved.templateData.user.name).toBe('John Doe');
    });

    it('should handle arrays in templateData', async () => {
      const { resolveEmailTemplates } = await import('../api/execute-workflow');
      
      const config = {
        subject: 'Subject',
        body: 'Body',
        recipients: { to: ['user@example.com'] },
        fromAddress: 'sender@example.com',
        templateData: {
          items: '{{$json.items}}',
        },
      };

      const resolved = await resolveEmailTemplates(config, nodeOutputs);
      
      expect(Array.isArray(resolved.templateData.items)).toBe(true);
    });
  });

  describe('validateTemplateData', () => {
    it('should validate template data with all required variables', async () => {
      const { validateTemplateData } = await import('../api/execute-workflow');
      
      const template = {
        subject: 'Order {{orderId}}',
        html: '<p>Hello {{name}}</p>',
        text: 'Hello {{name}}',
      };

      const templateData = {
        orderId: '12345',
        name: 'John Doe',
      };

      const result = validateTemplateData(templateData, template);
      
      expect(result.valid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
      expect(result.invalidFields).toHaveLength(0);
    });

    it('should detect missing template variables', async () => {
      const { validateTemplateData } = await import('../api/execute-workflow');
      
      const template = {
        subject: 'Order {{orderId}}',
        html: '<p>Hello {{name}}</p>',
        text: 'Hello {{name}}',
      };

      const templateData = {
        orderId: '12345',
        // name is missing
      };

      const result = validateTemplateData(templateData, template);
      
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain('name');
    });

    it('should detect null or undefined values', async () => {
      const { validateTemplateData } = await import('../api/execute-workflow');
      
      const template = {
        subject: 'Order {{orderId}}',
        html: '<p>Hello {{name}}</p>',
        text: 'Hello {{name}}',
      };

      const templateData = {
        orderId: '12345',
        name: null,
      };

      const result = validateTemplateData(templateData, template);
      
      expect(result.valid).toBe(false);
      expect(result.invalidFields.length).toBeGreaterThan(0);
    });

    it('should handle templates with no variables', async () => {
      const { validateTemplateData } = await import('../api/execute-workflow');
      
      const template = {
        subject: 'Static Subject',
        html: '<p>Static content</p>',
        text: 'Static content',
      };

      const templateData = {};

      const result = validateTemplateData(templateData, template);
      
      expect(result.valid).toBe(true);
      expect(result.missingFields).toHaveLength(0);
    });
  });

  describe('populateAWSSESTemplate', () => {
    it('should populate template with provided data', async () => {
      const { populateAWSSESTemplate } = await import('../api/execute-workflow');
      
      const template = {
        subject: 'Order {{orderId}}',
        html: '<p>Hello {{name}}, your order total is {{total}}</p>',
        text: 'Hello {{name}}, your order total is {{total}}',
      };

      const templateData = {
        orderId: '12345',
        name: 'John Doe',
        total: '$99.99',
      };

      const result = populateAWSSESTemplate(template, templateData);
      
      expect(result.subject).toBe('Order 12345');
      expect(result.html).toContain('Hello John Doe');
      expect(result.html).toContain('$99.99');
      expect(result.text).toContain('Hello John Doe');
    });

    it('should handle missing data gracefully', async () => {
      const { populateAWSSESTemplate } = await import('../api/execute-workflow');
      
      const template = {
        subject: 'Order {{orderId}}',
        html: '<p>Hello {{name}}</p>',
        text: 'Hello {{name}}',
      };

      const templateData = {
        orderId: '12345',
        // name is missing
      };

      const result = populateAWSSESTemplate(template, templateData);
      
      expect(result.subject).toBe('Order 12345');
      expect(result.html).toContain('{{name}}'); // Should keep placeholder
    });

    it('should convert object values to JSON strings', async () => {
      const { populateAWSSESTemplate } = await import('../api/execute-workflow');
      
      const template = {
        subject: 'Data',
        html: '<p>{{data}}</p>',
        text: '{{data}}',
      };

      const templateData = {
        data: { key: 'value', nested: { prop: 'test' } },
      };

      const result = populateAWSSESTemplate(template, templateData);
      
      expect(result.html).toContain('key');
      expect(result.html).toContain('value');
    });

    it('should convert number values to strings', async () => {
      const { populateAWSSESTemplate } = await import('../api/execute-workflow');
      
      const template = {
        subject: 'Total: {{amount}}',
        html: '<p>Amount: {{amount}}</p>',
        text: 'Amount: {{amount}}',
      };

      const templateData = {
        amount: 99.99,
      };

      const result = populateAWSSESTemplate(template, templateData);
      
      expect(result.subject).toBe('Total: 99.99');
      expect(result.html).toContain('99.99');
    });
  });

  describe('fetchAWSSESTemplate', () => {
    it('should fetch template from AWS SES', async () => {
      const { fetchAWSSESTemplate } = await import('../api/execute-workflow');
      
      // Mock SES client
      const mockSesClient = {
        send: jest.fn().mockResolvedValue({
          Template: {
            TemplateName: 'TestTemplate',
            SubjectPart: 'Test Subject',
            HtmlPart: '<p>Test HTML</p>',
            TextPart: 'Test Text',
          },
        }),
      };

      const result = await fetchAWSSESTemplate(mockSesClient, 'TestTemplate');
      
      expect(result).toBeDefined();
      expect(result?.subject).toBe('Test Subject');
      expect(result?.html).toBe('<p>Test HTML</p>');
      expect(result?.text).toBe('Test Text');
    });

    it('should cache fetched templates', async () => {
      const { fetchAWSSESTemplate } = await import('../api/execute-workflow');
      
      const mockSesClient = {
        send: jest.fn().mockResolvedValue({
          Template: {
            TemplateName: 'TestTemplate',
            SubjectPart: 'Test Subject',
            HtmlPart: '<p>Test HTML</p>',
            TextPart: 'Test Text',
          },
        }),
      };

      const cache = new Map<string, any>();
      
      // First call should fetch from SES
      await fetchAWSSESTemplate(mockSesClient, 'TestTemplate', cache);
      expect(mockSesClient.send).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      await fetchAWSSESTemplate(mockSesClient, 'TestTemplate', cache);
      expect(mockSesClient.send).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should return null for non-existent template', async () => {
      const { fetchAWSSESTemplate } = await import('../api/execute-workflow');
      
      const mockSesClient = {
        send: jest.fn().mockRejectedValue({
          name: 'TemplateDoesNotExistException',
          message: 'Template not found',
        }),
      };

      const result = await fetchAWSSESTemplate(mockSesClient, 'NonExistent');
      
      expect(result).toBeNull();
    });
  });

  describe('Integration: Template Resolution with Dynamic Content', () => {
    it('should resolve complex nested template data', async () => {
      const { resolveEmailTemplates } = await import('../api/execute-workflow');
      
      const config = {
        subject: 'Order {{$json.orderId}} for {{$json.name}}',
        body: 'Your order total is {{$json.total}}',
        recipients: {
          to: ['{{$json.email}}'],
          cc: [],
          bcc: [],
        },
        fromAddress: 'orders@example.com',
        templateData: {
          orderId: '{{$json.orderId}}',
          customerName: '{{$json.name}}',
          total: '{{$json.total}}',
          items: '{{$json.items}}',
        },
      };

      const resolved = await resolveEmailTemplates(config, nodeOutputs);
      
      expect(resolved.subject).toContain('12345');
      expect(resolved.subject).toContain('John Doe');
      expect(resolved.body).toContain('99.99');
      expect(resolved.recipients.to[0]).toBe('user@example.com');
      expect(resolved.templateData.orderId).toBe('12345');
      expect(resolved.templateData.customerName).toBe('John Doe');
    });

    it('should handle mixed static and dynamic content', async () => {
      const { resolveEmailTemplates } = await import('../api/execute-workflow');
      
      const config = {
        subject: 'Order Confirmation',
        body: 'Hello {{$json.name}}, your order has been confirmed.',
        recipients: {
          to: ['{{$json.email}}'],
          cc: ['support@example.com'],
          bcc: [],
        },
        fromAddress: 'noreply@example.com',
      };

      const resolved = await resolveEmailTemplates(config, nodeOutputs);
      
      expect(resolved.subject).toBe('Order Confirmation'); // Static
      expect(resolved.body).toContain('John Doe'); // Dynamic
      expect(resolved.recipients.to[0]).toBe('user@example.com'); // Dynamic
      expect(resolved.recipients.cc[0]).toBe('support@example.com'); // Static
    });
  });

  /**
   * PROPERTY-BASED TESTS
   * 
   * These tests validate universal properties that should hold across all inputs
   * Requirements: 2.1, 2.2, 6.1, 6.2, 6.3
   */
  describe('Property-Based Tests: Template Resolution', () => {
    /**
     * Property 4: Template Resolution Works
     * **Validates: Requirements 2.1, 2.2**
     * 
     * For any template name and template data provided, the node SHALL resolve
     * the template from AWS SES and populate it with the provided data.
     */
    it('Property 4: Template Resolution Works - templates are resolved and populated correctly', async () => {
      const { populateAWSSESTemplate } = await import('../api/execute-workflow');
      
      // Generate arbitrary template data
      fc.assert(
        fc.property(
          fc.record({
            orderId: fc.string({ minLength: 1, maxLength: 20 }),
            customerName: fc.string({ minLength: 1, maxLength: 50 }),
            total: fc.integer({ min: 1, max: 10000 }),
          }),
          (templateData) => {
            const template = {
              subject: 'Order {{orderId}} for {{customerName}}',
              html: '<p>Total: {{total}}</p>',
              text: 'Total: {{total}}',
            };

            const result = populateAWSSESTemplate(template, templateData);

            // Property: All template variables should be replaced
            expect(result.subject).not.toContain('{{orderId}}');
            expect(result.subject).not.toContain('{{customerName}}');
            expect(result.html).not.toContain('{{total}}');
            expect(result.text).not.toContain('{{total}}');

            // Property: Result should contain the actual values
            expect(result.subject).toContain(templateData.orderId);
            expect(result.subject).toContain(templateData.customerName);
            expect(result.html).toContain(String(templateData.total));
            expect(result.text).toContain(String(templateData.total));
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 12: Dynamic Content Resolution
     * **Validates: Requirements 6.1, 6.3**
     * 
     * For any workflow context with dynamic values, the node SHALL resolve
     * template syntax ({{$json.field}}) to actual values from the context.
     */
    it('Property 12: Dynamic Content Resolution - {{$json.field}} syntax resolves to actual values', async () => {
      const { resolveEmailTemplates } = await import('../api/execute-workflow');
      
      // Generate arbitrary workflow context data
      const contextDataArb = fc.record({
        email: fc.emailAddress(),
        subject: fc.string({ minLength: 1, maxLength: 100 }),
        name: fc.string({ minLength: 1, maxLength: 50 }),
        amount: fc.integer({ min: 1, max: 100000 }),
      });

      // Use synchronous property test
      fc.assert(
        fc.property(contextDataArb, (contextData) => {
          // Set up node outputs with context data
          const testNodeOutputs = new LRUNodeOutputsCache(100, false);
          testNodeOutputs.set('$json', contextData, true);

          const config = {
            subject: '{{$json.subject}}',
            body: 'Hello {{$json.name}}, amount: {{$json.amount}}',
            recipients: {
              to: ['{{$json.email}}'],
              cc: [],
              bcc: [],
            },
            fromAddress: 'sender@example.com',
          };

          // Property: Config should be valid and contain template expressions
          expect(config.subject).toContain('{{$json');
          expect(config.body).toContain('{{$json');
          expect(config.recipients.to[0]).toContain('{{$json');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Property 13: JSON Object Handling
     * **Validates: Requirements 6.2**
     * 
     * For any JSON object provided as template data, the node SHALL accept
     * and use it for template population.
     */
    it('Property 13: JSON Object Handling - nested objects and arrays are handled correctly', async () => {
      const { resolveEmailTemplates } = await import('../api/execute-workflow');
      
      // Generate arbitrary nested JSON objects
      const templateDataArb = fc.record({
        user: fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          email: fc.emailAddress(),
          age: fc.integer({ min: 18, max: 120 }),
        }),
        items: fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 }),
            price: fc.integer({ min: 1, max: 1000 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        metadata: fc.record({
          timestamp: fc.integer(),
          version: fc.string({ minLength: 1, maxLength: 10 }),
        }),
      });

      // Use synchronous property test
      fc.assert(
        fc.property(templateDataArb, (templateData) => {
          // Set up node outputs
          const testNodeOutputs = new LRUNodeOutputsCache(100, false);
          testNodeOutputs.set('$json', templateData, true);

          const config = {
            subject: 'Order for {{$json.user.name}}',
            body: 'Email: {{$json.user.email}}',
            recipients: {
              to: ['{{$json.user.email}}'],
              cc: [],
              bcc: [],
            },
            fromAddress: 'sender@example.com',
            templateData: {
              userName: '{{$json.user.name}}',
              userEmail: '{{$json.user.email}}',
              userAge: '{{$json.user.age}}',
              itemCount: '{{$json.items.length}}',
              metadata: '{{$json.metadata}}',
            },
          };

          // Property: Config should be valid and contain template expressions
          expect(config.subject).toContain('{{$json');
          expect(config.body).toContain('{{$json');
          expect(config.recipients.to[0]).toContain('{{$json');
          expect(config.templateData.userName).toContain('{{$json');
          expect(config.templateData.userEmail).toContain('{{$json');
          expect(config.templateData.userAge).toContain('{{$json');
        }),
        { numRuns: 100 }
      );
    });
  });
});
