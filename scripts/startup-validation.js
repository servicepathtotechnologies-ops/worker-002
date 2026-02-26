/**
 * Startup Validation Script
 * Validates system configuration and schemas on startup
 */

const path = require('path');
const fs = require('fs');

async function validateSystemOnStartup() {
  console.log('🔍 Starting CtrlChecks system validation...');
  console.log('='.repeat(50));
  
  try {
    // Check if TypeScript files are compiled
    const distPath = path.join(__dirname, '../dist');
    if (!fs.existsSync(distPath)) {
      console.warn('⚠️  Dist directory not found. Run "npm run build" first.');
    }
    
    // Try to load the schema registry (will work if compiled)
    let NodeSchemaRegistry;
    let schemaRegistry;
    let schemas = [];
    
    try {
      // Try to load from dist (compiled)
      const registryPath = path.join(__dirname, '../dist/core/contracts/node-schema-registry.js');
      if (fs.existsSync(registryPath)) {
        NodeSchemaRegistry = require(registryPath).NodeSchemaRegistry;
        schemaRegistry = NodeSchemaRegistry.getInstance();
        schemas = schemaRegistry.getAllSchemas();
        console.log(`✅ Loaded ${schemas.length} node schemas from compiled code`);
      } else {
        // Try to load from source (for development)
        const tsNode = require('ts-node');
        tsNode.register({
          transpileOnly: true,
          compilerOptions: {
            module: 'commonjs',
            esModuleInterop: true
          }
        });
        
        const sourcePath = path.join(__dirname, '../src/core/contracts/node-schema-registry.ts');
        if (fs.existsSync(sourcePath)) {
          delete require.cache[require.resolve(sourcePath)];
          const module = require(sourcePath);
          NodeSchemaRegistry = module.NodeSchemaRegistry;
          schemaRegistry = NodeSchemaRegistry.getInstance();
          schemas = schemaRegistry.getAllSchemas();
          console.log(`✅ Loaded ${schemas.length} node schemas from source code`);
        } else {
          throw new Error('Schema registry not found');
        }
      }
    } catch (error) {
      console.warn('⚠️  Could not load schema registry:', error.message);
      console.log('ℹ️  Continuing without schema validation (will validate at runtime)');
      return true;
    }
    
    // Check for critical nodes
    const criticalNodes = ['manual_trigger', 'schedule', 'slack_message', 'email'];
    const missingNodes = [];
    
    for (const node of criticalNodes) {
      const schema = schemaRegistry.get(node);
      if (!schema) {
        missingNodes.push(node);
      }
    }
    
    if (missingNodes.length > 0) {
      console.error(`❌ Critical nodes missing from schema registry: ${missingNodes.join(', ')}`);
      throw new Error(`Missing critical nodes: ${missingNodes.join(', ')}`);
    }
    
    console.log('✅ All critical nodes found in schema registry');
    
    // Verify schedule node has required cron field
    const scheduleSchema = schemaRegistry.get('schedule');
    if (scheduleSchema && !scheduleSchema.requiredConfig.includes('cron')) {
      console.error('❌ Schedule node schema missing required "cron" field');
      throw new Error('Schedule node schema missing required "cron" field');
    }
    
    console.log('✅ Schedule node schema validated (has cron field)');
    
    // Verify manual_trigger has correct output port
    const manualTriggerSchema = schemaRegistry.get('manual_trigger');
    if (manualTriggerSchema && !manualTriggerSchema.outputs.includes('inputData')) {
      console.warn('⚠️  Manual trigger schema may not have correct output port "inputData"');
    } else {
      console.log('✅ Manual trigger schema validated (has inputData output)');
    }
    
    // Create node library export for frontend (optional)
    try {
      const nodeLibrary = schemas.map(schema => ({
        type: schema.nodeType,
        category: schema.category,
        inputs: schema.inputs,
        outputs: schema.outputs,
        requiredConfig: schema.requiredConfig,
        optionalConfig: schema.optionalConfig
      }));
      
      const publicDir = path.join(__dirname, '../public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      
      const exportPath = path.join(publicDir, 'node-library.json');
      fs.writeFileSync(exportPath, JSON.stringify(nodeLibrary, null, 2));
      console.log(`📁 Node library exported to ${exportPath}`);
    } catch (error) {
      console.warn('⚠️  Could not export node library:', error.message);
    }
    
    console.log('\n✅ All system validations passed');
    console.log('='.repeat(50));
    return true;
    
  } catch (error) {
    console.error('\n❌ System validation failed:', error.message);
    console.log('='.repeat(50));
    
    // In development, don't exit - just warn
    if (process.env.NODE_ENV !== 'production') {
      console.log('⚠️  Continuing in development mode (validation will occur at runtime)');
      return true;
    }
    
    // In production, exit on validation failure
    process.exit(1);
  }
}

// Run validation
if (require.main === module) {
  validateSystemOnStartup()
    .then(success => {
      if (success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { validateSystemOnStartup };
