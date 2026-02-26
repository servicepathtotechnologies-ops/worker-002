/**
 * Generate / refresh the full workflow training dataset.
 *
 * Comprehensive generator that:
 * 1. Loads existing datasets (100/300 examples)
 * 2. Parses examples.md patterns
 * 3. Dynamically ensures node type coverage
 * 4. Generates 500+ workflows total
 * 5. Outputs to training/workflows/expanded-dataset.json
 *
 * Usage:
 *   npm run generate-training-workflows
 */

import * as path from 'path';

async function main() {
  console.log('🚀 Generating comprehensive workflow training dataset...\n');
  
  // Import and run the comprehensive generator
  const { main: generateExpanded } = await import('./generate-expanded-training-workflows');
  await generateExpanded();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ Failed to generate training workflows:', err);
    process.exit(1);
  });
}

