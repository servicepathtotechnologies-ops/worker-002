/**
 * ✅ CONTEXT ENHANCEMENT GENERATOR
 * 
 * This script enhances node contexts with detailed information for better AI understanding.
 * 
 * Purpose:
 * - Generate enhanced contexts for all nodes
 * - Add detailed examples, use cases, capabilities
 * - Improve AI node selection accuracy
 */

import { nodeLibrary } from '../src/services/nodes/node-library';
import { NodeContext, extractNodeContext } from '../src/core/types/node-context';

interface EnhancedContext extends NodeContext {
  // Additional fields for enhanced context
  detailedDescription: string;
  realWorldExamples: string[];
  integrationExamples: string[];
  performanceNotes?: string;
  limitations?: string[];
  bestPractices?: string[];
}

/**
 * Enhance node context with detailed information
 */
export function enhanceNodeContext(
  baseContext: NodeContext,
  schema: any
): EnhancedContext {
  const enhanced: EnhancedContext = {
    ...baseContext,
    detailedDescription: generateDetailedDescription(schema),
    realWorldExamples: generateRealWorldExamples(schema),
    integrationExamples: generateIntegrationExamples(schema),
    performanceNotes: generatePerformanceNotes(schema),
    limitations: generateLimitations(schema),
    bestPractices: generateBestPractices(schema),
  };
  
  return enhanced;
}

/**
 * Generate detailed description from schema
 */
function generateDetailedDescription(schema: any): string {
  let description = schema.description || '';
  
  // Add category-specific details
  if (schema.category === 'triggers') {
    description += ` This is a trigger node that starts workflow execution.`;
  } else if (schema.category === 'ai') {
    description += ` This is an AI-powered node that processes data using machine learning.`;
  } else if (schema.category === 'output') {
    description += ` This is an output node that sends data to external systems.`;
  } else if (schema.category === 'database') {
    description += ` This is a database node that reads or writes data.`;
  } else if (schema.category === 'logic') {
    description += ` This is a logic node that controls workflow flow.`;
  }
  
  // Add capability details
  if (schema.nodeCapability) {
    description += ` Accepts ${schema.nodeCapability.inputType} input and produces ${schema.nodeCapability.outputType} output.`;
  }
  
  return description;
}

/**
 * Generate real-world examples
 */
function generateRealWorldExamples(schema: any): string[] {
  const examples: string[] = [];
  
  // Use existing examples
  if (schema.commonPatterns && schema.commonPatterns.length > 0) {
    schema.commonPatterns.forEach((pattern: any) => {
      examples.push(pattern.description || pattern.name);
    });
  }
  
  // Add category-specific examples
  if (schema.type === 'google_gmail') {
    examples.push('Send email notification when a new order is placed');
    examples.push('Send weekly report email to team members');
    examples.push('Send confirmation email after form submission');
  } else if (schema.type === 'slack_message') {
    examples.push('Send Slack notification when error occurs');
    examples.push('Post daily standup summary to Slack channel');
    examples.push('Alert team when deployment completes');
  } else if (schema.type === 'if_else') {
    examples.push('Branch workflow based on order status');
    examples.push('Conditionally send email based on user type');
    examples.push('Route data based on condition');
  } else if (schema.type === 'google_sheets') {
    examples.push('Read customer data from Google Sheets');
    examples.push('Write form submissions to spreadsheet');
    examples.push('Update inventory tracking sheet');
  }
  
  return examples.slice(0, 5); // Limit to 5 examples
}

/**
 * Generate integration examples
 */
function generateIntegrationExamples(schema: any): string[] {
  const examples: string[] = [];
  
  // Common integration patterns
  if (schema.category === 'triggers') {
    examples.push(`Trigger → ${schema.type} → Process Data → Send Output`);
  } else if (schema.category === 'output') {
    examples.push(`Read Data → Process → ${schema.type} → Notify`);
  } else if (schema.category === 'ai') {
    examples.push(`Trigger → Read Data → ${schema.type} → Analyze → Send Results`);
  } else if (schema.category === 'database') {
    examples.push(`Trigger → ${schema.type} → Process Results → Send Output`);
  }
  
  // Specific integrations
  if (schema.type === 'google_gmail') {
    examples.push('Webhook → Process Form → Gmail → Send Confirmation');
    examples.push('Schedule → Read Data → Gmail → Send Report');
  } else if (schema.type === 'slack_message') {
    examples.push('Error Trigger → Slack → Alert Team');
    examples.push('Database Update → Slack → Notify Channel');
  }
  
  return examples.slice(0, 3); // Limit to 3 examples
}

/**
 * Generate performance notes
 */
function generatePerformanceNotes(schema: any): string | undefined {
  if (schema.category === 'ai') {
    return 'AI nodes may have higher latency. Consider caching results for repeated queries.';
  } else if (schema.category === 'database') {
    return 'Database operations should use connection pooling. Consider batch operations for large datasets.';
  } else if (schema.category === 'output') {
    return 'Output nodes may be rate-limited by external APIs. Implement retry logic with exponential backoff.';
  }
  return undefined;
}

/**
 * Generate limitations
 */
function generateLimitations(schema: any): string[] {
  const limitations: string[] = [];
  
  if (schema.category === 'ai') {
    limitations.push('Requires API credentials');
    limitations.push('May have rate limits');
    limitations.push('Output quality depends on input quality');
  } else if (schema.category === 'output') {
    limitations.push('Requires external service credentials');
    limitations.push('Subject to external API rate limits');
    limitations.push('Network connectivity required');
  } else if (schema.category === 'database') {
    limitations.push('Requires database connection');
    limitations.push('Performance depends on database size');
    limitations.push('Requires proper indexing for large queries');
  }
  
  return limitations;
}

/**
 * Generate best practices
 */
function generateBestPractices(schema: any): string[] {
  const practices: string[] = [];
  
  if (schema.category === 'triggers') {
    practices.push('Use appropriate trigger type for your use case');
    practices.push('Configure trigger parameters carefully');
    practices.push('Test trigger behavior before production');
  } else if (schema.category === 'ai') {
    practices.push('Provide clear, specific prompts for best results');
    practices.push('Validate AI output before using in downstream nodes');
    practices.push('Handle AI errors gracefully');
  } else if (schema.category === 'output') {
    practices.push('Validate data before sending');
    practices.push('Implement error handling for failed sends');
    practices.push('Use templates for consistent formatting');
  } else if (schema.category === 'database') {
    practices.push('Use parameterized queries to prevent SQL injection');
    practices.push('Index frequently queried columns');
    practices.push('Handle connection errors gracefully');
  }
  
  return practices;
}

/**
 * Enhance all node contexts
 */
export async function enhanceAllNodeContexts(): Promise<Map<string, EnhancedContext>> {
  const allSchemas = nodeLibrary.getAllSchemas();
  const enhancedContexts = new Map<string, EnhancedContext>();
  
  console.log(`[Context Enhancement] 🚀 Enhancing ${allSchemas.length} node contexts...`);
  
  for (const schema of allSchemas) {
    try {
      const baseContext = extractNodeContext(schema);
      const enhanced = enhanceNodeContext(baseContext, schema);
      enhancedContexts.set(schema.type, enhanced);
    } catch (error: any) {
      console.error(`[Context Enhancement] ❌ Failed to enhance ${schema.type}:`, error.message);
    }
  }
  
  console.log(`[Context Enhancement] ✅ Enhanced ${enhancedContexts.size} node contexts`);
  
  return enhancedContexts;
}

// Run enhancement if executed directly
if (require.main === module) {
  enhanceAllNodeContexts()
    .then(contexts => {
      console.log(`\n✅ Enhanced ${contexts.size} node contexts`);
      console.log('\nSample enhanced context:');
      const sample = Array.from(contexts.entries())[0];
      if (sample) {
        console.log(JSON.stringify(sample[1], null, 2));
      }
    })
    .catch(error => {
      console.error('❌ Enhancement failed:', error);
      process.exit(1);
    });
}
