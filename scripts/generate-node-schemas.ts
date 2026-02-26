/**
 * Generate Node Schemas Script
 * Generates node schema definitions from Node Library
 */

import * as fs from 'fs';
import * as path from 'path';
import { nodeLibrary } from '../src/services/nodes/node-library';
import { NodeSchemaRegistry } from '../src/core/contracts/node-schema-registry';

async function generateNodeSchemas() {
  console.log('📚 Generating node schemas from Node Library...');
  
  const registry = NodeSchemaRegistry.getInstance();
  const schemas = registry.getAllSchemas();
  
  // Generate TypeScript interface definitions
  const interfaceCode = `/**
 * Auto-generated Node Schema Definitions
 * Generated from Node Library
 * DO NOT EDIT MANUALLY - Regenerate using: npm run build:schemas
 */

export interface NodeSchemaDefinition {
  nodeType: string;
  category: string;
  inputs: string[];
  outputs: string[];
  requiredConfig: string[];
  optionalConfig: string[];
  credentialType: string | null;
  capabilities?: string[];
}

export const NODE_SCHEMA_DEFINITIONS: NodeSchemaDefinition[] = ${JSON.stringify(schemas, null, 2)};

export const NODE_TYPES = ${JSON.stringify(schemas.map(s => s.nodeType), null, 2)};

export const NODE_CATEGORIES = ${JSON.stringify([...new Set(schemas.map(s => s.category))], null, 2)};
`;
  
  // Write to src/core/contracts/generated-schemas.ts
  const outputPath = path.join(__dirname, '../src/core/contracts/generated-schemas.ts');
  fs.writeFileSync(outputPath, interfaceCode);
  
  console.log(`✅ Generated ${schemas.length} node schema definitions`);
  console.log(`📁 Output: ${outputPath}`);
  
  // Also generate JSON version
  const jsonPath = path.join(__dirname, '../public/node-schemas.json');
  const publicDir = path.join(__dirname, '../public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  fs.writeFileSync(jsonPath, JSON.stringify(schemas, null, 2));
  console.log(`📁 JSON output: ${jsonPath}`);
  
  return { outputPath, jsonPath, count: schemas.length };
}

// Run if called directly
if (require.main === module) {
  generateNodeSchemas()
    .then(result => {
      console.log(`\n🎉 Generated ${result.count} node schemas successfully!`);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Generation failed:', error);
      process.exit(1);
    });
}

export { generateNodeSchemas };
