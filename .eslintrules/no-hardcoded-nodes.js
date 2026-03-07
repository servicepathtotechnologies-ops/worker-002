/**
 * ESLint Rule: No Hardcoded Node Logic
 * 
 * Prevents hardcoded node-specific logic outside of UnifiedNodeRegistry.
 * 
 * Forbidden Patterns:
 * - switch (node.type) { case 'X': ... }
 * - if (node.type === 'X') { ... }
 * - stepLower.includes('X') for node type inference (should use registry)
 * 
 * Allowed:
 * - unifiedNodeRegistry.get(nodeType)
 * - nodeDef.execute(context)
 * - Registry-based logic
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hardcoded node-specific logic outside UnifiedNodeRegistry',
      category: 'Architecture',
      recommended: true,
    },
    messages: {
      noHardcodedSwitch: 'Hardcoded switch statement for node types. Use UnifiedNodeRegistry.get() instead.',
      noHardcodedIf: 'Hardcoded if statement for node type "{{nodeType}}". Use UnifiedNodeRegistry.get() instead.',
      noHardcodedPattern: 'Hardcoded pattern matching for node type. Use registry metadata instead.',
    },
    schema: [],
  },
  create(context) {
    return {
      // Detect switch statements with node.type
      SwitchStatement(node) {
        if (
          node.discriminant &&
          node.discriminant.type === 'MemberExpression' &&
          node.discriminant.property &&
          (node.discriminant.property.name === 'type' || node.discriminant.property.name === 'nodeType')
        ) {
          // Check if this is the legacy executor (allowed as fallback)
          const sourceCode = context.getSourceCode();
          const switchText = sourceCode.getText(node);
          
          // Allow legacy executor switch statement (has TODO comment)
          if (switchText.includes('LEGACY EXECUTOR') || switchText.includes('TODO: Migrate')) {
            return; // Skip - this is the legacy fallback
          }
          
          context.report({
            node,
            messageId: 'noHardcodedSwitch',
          });
        }
      },
      
      // Detect if statements checking node.type === 'X'
      IfStatement(node) {
        const test = node.test;
        
        // Check for: if (node.type === 'X') or if (type === 'X')
        if (
          test.type === 'BinaryExpression' &&
          test.operator === '===' &&
          test.right.type === 'Literal' &&
          typeof test.right.value === 'string'
        ) {
          const left = test.left;
          
          // Check if left side is node.type or type
          if (
            (left.type === 'MemberExpression' && 
             left.property && 
             left.property.name === 'type') ||
            (left.type === 'Identifier' && left.name === 'type')
          ) {
            const nodeType = test.right.value;
            
            // Allow in legacy executor and workflow builder (generation logic)
            const fileName = context.getFilename();
            if (
              fileName.includes('execute-workflow.ts') ||
              fileName.includes('workflow-builder.ts') ||
              fileName.includes('node-execution-stubs.ts') ||
              fileName.includes('unified-node-registry-overrides.ts')
            ) {
              return; // Skip - allowed in these files
            }
            
            context.report({
              node,
              messageId: 'noHardcodedIf',
              data: { nodeType },
            });
          }
        }
      },
      
      // Detect pattern matching: stepLower.includes('X')
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property &&
          node.callee.property.name === 'includes'
        ) {
          const object = node.callee.object;
          
          // Check if it's stepLower.includes or step.includes
          if (
            object.type === 'Identifier' &&
            (object.name === 'stepLower' || object.name === 'step')
          ) {
            // Check if argument is a string literal (node type pattern)
            const arg = node.arguments[0];
            if (arg && arg.type === 'Literal' && typeof arg.value === 'string') {
              const pattern = arg.value.toLowerCase();
              
              // Common node type patterns
              const nodePatterns = [
                'gmail', 'slack', 'airtable', 'google sheet', 'linkedin',
                'hubspot', 'salesforce', 'zoho', 'notion', 'clickup'
              ];
              
              if (nodePatterns.some(p => pattern.includes(p))) {
                // Allow in workflow-builder.ts (generation logic)
                const fileName = context.getFilename();
                if (fileName.includes('workflow-builder.ts')) {
                  return; // Skip - allowed for node type inference
                }
                
                context.report({
                  node,
                  messageId: 'noHardcodedPattern',
                });
              }
            }
          }
        }
      },
    };
  },
};
