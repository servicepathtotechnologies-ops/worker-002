import { queryAsService } from '../core/database/db-pool';
import { credentialTypeDefinitions } from './credential-type-registry';
import { nodeRegistryService } from './node-registry-service';

export interface RegistrySyncResult {
  credentialTypes: number;
  nodeDefinitions: number;
  nodeOperations: number;
}

export class RegistrySyncService {
  async syncToDatabase(): Promise<RegistrySyncResult> {
    let credentialTypes = 0;
    let nodeDefinitions = 0;
    let nodeOperations = 0;

    for (const definition of credentialTypeDefinitions) {
      await queryAsService(
        `INSERT INTO credential_types (
           id, provider, display_name, auth_type, schema, form_config, validation_rules,
           test_request, injection_rules, refresh_rules, updated_at
         )
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET
           provider = EXCLUDED.provider,
           display_name = EXCLUDED.display_name,
           auth_type = EXCLUDED.auth_type,
           schema = EXCLUDED.schema,
           form_config = EXCLUDED.form_config,
           validation_rules = EXCLUDED.validation_rules,
           test_request = EXCLUDED.test_request,
           injection_rules = EXCLUDED.injection_rules,
           refresh_rules = EXCLUDED.refresh_rules,
           updated_at = NOW()`,
        [
          definition.id,
          definition.provider,
          definition.displayName,
          definition.authType,
          JSON.stringify({ inputFields: definition.inputFields, maskFields: definition.maskFields, oauth2: definition.oauth2 || null }),
          JSON.stringify(definition.form),
          JSON.stringify(definition.validation),
          JSON.stringify(definition.testRequest || null),
          JSON.stringify(definition.injection),
          JSON.stringify(definition.refresh || {}),
        ],
      );
      credentialTypes += 1;
    }

    const nodes = nodeRegistryService.listNodeDefinitions();
    for (const node of nodes) {
      await queryAsService(
        `INSERT INTO node_definitions (
           id, type, display_name, provider, category, resources, input_fields,
           output_schema, credential_requirements, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET
           type = EXCLUDED.type,
           display_name = EXCLUDED.display_name,
           provider = EXCLUDED.provider,
           category = EXCLUDED.category,
           resources = EXCLUDED.resources,
           input_fields = EXCLUDED.input_fields,
           output_schema = EXCLUDED.output_schema,
           credential_requirements = EXCLUDED.credential_requirements,
           updated_at = NOW()`,
        [
          node.id,
          node.type,
          node.displayName,
          node.provider || null,
          node.category,
          JSON.stringify(node.resources),
          JSON.stringify(node.inputFields),
          JSON.stringify(node.outputSchema),
          JSON.stringify(node.credentialRequirements),
        ],
      );
      nodeDefinitions += 1;

      for (const operation of node.operations) {
        const operationId = `${node.id}:${operation.resource}:${operation.operation}`;
        await queryAsService(
          `INSERT INTO node_operations (
             id, node_definition_id, resource, operation, display_name, method, path,
             input_fields, output_schema
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
           ON CONFLICT (node_definition_id, resource, operation) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             method = EXCLUDED.method,
             path = EXCLUDED.path,
             input_fields = EXCLUDED.input_fields,
             output_schema = EXCLUDED.output_schema`,
          [
            operationId,
            node.id,
            operation.resource,
            operation.operation,
            operation.displayName,
            operation.method || null,
            operation.path || null,
            JSON.stringify(operation.inputFields),
            JSON.stringify(operation.outputSchema),
          ],
        );
        nodeOperations += 1;
      }
    }

    return { credentialTypes, nodeDefinitions, nodeOperations };
  }
}

export const registrySyncService = new RegistrySyncService();
