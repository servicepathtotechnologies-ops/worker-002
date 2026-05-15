import type { UnifiedNodeDefinition } from '../../types/unified-node-contract';
import type { NodeSchema } from '../../../services/nodes/node-library';
import { getGoogleTokenForContext, googleApiRequest, mergedInputs } from './google-workspace-utils';

function personResourceName(contactId: string): string {
  return contactId.startsWith('people/') ? contactId : `people/${contactId}`;
}

function buildPerson(inputs: Record<string, any>) {
  const person: Record<string, any> = (
    inputs.contactData &&
    typeof inputs.contactData === 'object' &&
    !Array.isArray(inputs.contactData)
  )
    ? { ...inputs.contactData }
    : {};

  if (inputs.name && !person.names) {
    person.names = [{ displayName: String(inputs.name), givenName: String(inputs.name) }];
  }
  if (inputs.email && !person.emailAddresses) {
    person.emailAddresses = [{ value: String(inputs.email) }];
  }
  if (inputs.phone && !person.phoneNumbers) {
    person.phoneNumbers = [{ value: String(inputs.phone) }];
  }

  return person;
}

function hasPersonData(person: Record<string, any>): boolean {
  return Object.keys(person).length > 0;
}

export function overrideGoogleContacts(
  def: UnifiedNodeDefinition,
  _schema: NodeSchema,
): UnifiedNodeDefinition {
  const runtimeValue = { default: 'manual_static' as const, supportsRuntimeAI: true, supportsBuildtimeAI: true };
  const options = ['create', 'read', 'update', 'delete'].map((value) => ({ label: value.charAt(0).toUpperCase() + value.slice(1), value }));
  const inputSchema = {
    ...def.inputSchema,
    operation: { ...def.inputSchema.operation, ui: { ...(def.inputSchema.operation?.ui || {}), options } },
    name: { type: 'string' as const, description: 'Contact name', required: false, role: 'title_like' as const, fillMode: runtimeValue },
    email: { type: 'string' as const, description: 'Contact email', required: false, role: 'recipient' as const, fillMode: runtimeValue },
    phone: { type: 'string' as const, description: 'Contact phone number', required: false, role: 'content' as const, fillMode: runtimeValue },
    contactData: { type: 'object' as const, description: 'Raw Google People API person payload', required: false, role: 'raw_json' as const, fillMode: runtimeValue },
  };

  return {
    ...def,
    inputSchema,
    credentialSchema: {
      requirements: [{ provider: 'google', category: 'oauth', required: true, description: 'Google OAuth with Contacts scope' }],
      credentialFields: ['accessToken'],
    },
    execute: async (context) => {
      const inputs = mergedInputs(context);
      const operation = String(inputs.operation || 'read');
      try {
        const accessToken = await getGoogleTokenForContext(context, ['https://www.googleapis.com/auth/contacts']);
        let output: any;
        const personFields = 'names,emailAddresses,phoneNumbers,organizations';
        if (operation === 'read') {
          if (inputs.contactId) {
            output = await googleApiRequest(`https://people.googleapis.com/v1/${personResourceName(String(inputs.contactId))}?personFields=${personFields}`, accessToken);
          } else {
            output = await googleApiRequest(`https://people.googleapis.com/v1/people/me/connections?personFields=${personFields}&pageSize=${Number(inputs.pageSize || 100)}`, accessToken);
          }
        } else if (operation === 'create') {
          const person = buildPerson(inputs);
          if (!hasPersonData(person)) {
            throw new Error('At least one of name, email, phone, or contactData is required to create a contact');
          }
          output = await googleApiRequest('https://people.googleapis.com/v1/people:createContact', accessToken, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(person),
          });
        } else if (operation === 'update') {
          const contactId = String(inputs.contactId || '').trim();
          if (!contactId) throw new Error('contactId is required for update');
          const existing = await googleApiRequest(`https://people.googleapis.com/v1/${personResourceName(contactId)}?personFields=metadata,${personFields}`, accessToken);
          const person = buildPerson(inputs);
          if (!hasPersonData(person)) {
            throw new Error('At least one of name, email, phone, or contactData is required to update a contact');
          }
          output = await googleApiRequest(`https://people.googleapis.com/v1/${personResourceName(contactId)}:updateContact?updatePersonFields=names,emailAddresses,phoneNumbers`, accessToken, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...person, etag: inputs.etag || existing.etag }),
          });
        } else if (operation === 'delete') {
          const contactId = String(inputs.contactId || '').trim();
          if (!contactId) throw new Error('contactId is required for delete');
          await googleApiRequest(`https://people.googleapis.com/v1/${personResourceName(contactId)}:deleteContact`, accessToken, { method: 'DELETE' });
          output = { deleted: true, contactId };
        } else {
          throw new Error(`Unsupported Google Contacts operation: ${operation}`);
        }
        return { success: true, output: { operation, data: output } };
      } catch (error: any) {
        return { success: false, error: { code: 'GOOGLE_CONTACTS_FAILED', message: error?.message || 'Google Contacts operation failed' } };
      }
    },
  };
}
