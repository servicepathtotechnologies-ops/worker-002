/**
 * ✅ INTEGRATE ENHANCED CONTEXTS
 * 
 * This script integrates enhanced contexts into the NodeContextRegistry.
 * 
 * Purpose:
 * - Load enhanced contexts from context-enhancement-generator
 * - Merge with existing contexts
 * - Update NodeContextRegistry with enhanced information
 */

import { nodeLibrary } from '../src/services/nodes/node-library';
import { extractNodeContext, NodeContext } from '../src/core/types/node-context';
import { enhanceNodeContext } from './context-enhancement-generator';

/**
 * Integrate enhanced contexts into NodeContextRegistry
 */
export async function integrateEnhancedContexts(): Promise<void> {
  const allSchemas = nodeLibrary.getAllSchemas();
  const enhancedContexts: Map<string, NodeContext> = new Map();
  
  console.log(`[Context Integration] 🚀 Integrating enhanced contexts for ${allSchemas.length} nodes...`);
  
  for (const schema of allSchemas) {
    try {
      // Extract base context
      const baseContext = extractNodeContext(schema);
      
      // Enhance context with detailed information
      const enhanced = enhanceNodeContext(baseContext, schema);
      
      // Merge enhanced fields into base context
      const mergedContext: NodeContext = {
        ...baseContext,
        // Use enhanced examples if available
        examples: enhanced.realWorldExamples.length > 0 
          ? [...baseContext.examples, ...enhanced.realWorldExamples].slice(0, 10)
          : baseContext.examples,
        // Add integration examples to use cases
        useCases: enhanced.integrationExamples.length > 0
          ? [...baseContext.useCases, ...enhanced.integrationExamples].slice(0, 10)
          : baseContext.useCases,
        // Enhance description with detailed description
        description: enhanced.detailedDescription || baseContext.description,
      };
      
      enhancedContexts.set(schema.type, mergedContext);
    } catch (error: any) {
      console.error(`[Context Integration] ❌ Failed to integrate ${schema.type}:`, error.message);
    }
  }
  
  console.log(`[Context Integration] ✅ Integrated ${enhancedContexts.size} enhanced contexts`);
  
  // Note: Actual integration into NodeContextRegistry requires modifying the registry
  // For now, we'll export the enhanced contexts for manual integration
  return enhancedContexts as any;
}

// Run integration if executed directly
if (require.main === module) {
  integrateEnhancedContexts()
    .then(() => {
      console.log('\n✅ Enhanced contexts ready for integration');
      console.log('Note: Modify NodeContextRegistry.initializeFromNodeLibrary() to use enhanced contexts');
    })
    .catch(error => {
      console.error('❌ Integration failed:', error);
      process.exit(1);
    });
}
