/**
 * Export Node Schemas Script
 * Exports node schemas to JSON for frontend use
 */

import * as fs from 'fs';
import * as path from 'path';
import { NodeSchemaRegistry } from '../src/core/contracts/node-schema-registry';

async function exportNodeSchemas() {
  console.log('📤 Exporting node schemas...');
  
  const registry = NodeSchemaRegistry.getInstance();
  const schemas = registry.getAllSchemas();
  
  // Create simplified schema export
  const exportData = schemas.map(schema => ({
    type: schema.nodeType,
    category: schema.category,
    inputs: schema.inputs,
    outputs: schema.outputs,
    requiredConfig: schema.requiredConfig,
    optionalConfig: schema.optionalConfig,
    credentialType: schema.credentialType,
    capabilities: schema.capabilities || []
  }));
  
  // Export to public directory
  const publicDir = path.join(__dirname, '../public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  const exportPath = path.join(publicDir, 'node-library.json');
  fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
  
  console.log(`✅ Exported ${schemas.length} node schemas to ${exportPath}`);
  
  // Also export to dist if it exists
  const distPublicDir = path.join(__dirname, '../dist/public');
  if (fs.existsSync(path.join(__dirname, '../dist'))) {
    if (!fs.existsSync(distPublicDir)) {
      fs.mkdirSync(distPublicDir, { recursive: true });
    }
    const distExportPath = path.join(distPublicDir, 'node-library.json');
    fs.writeFileSync(distExportPath, JSON.stringify(exportData, null, 2));
    console.log(`✅ Also exported to ${distExportPath}`);
  }
  
  return exportPath;
}

// Run if called directly
if (require.main === module) {
  exportNodeSchemas()
    .then(() => {
      console.log('🎉 Schema export completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Export failed:', error);
      process.exit(1);
    });
}

export { exportNodeSchemas };
