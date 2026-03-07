const fs = require('fs');
const path = require('path');

/**
 * Verify that all nodes have proper AI detection metadata:
 * - aiSelectionCriteria (whenToUse, whenNotToUse, keywords, useCases)
 * - keywords array
 * - commonPatterns array
 */

const nodeLibraryPath = path.join(__dirname, '../src/services/nodes/node-library.ts');
const content = fs.readFileSync(nodeLibraryPath, 'utf8');

// Extract all node schema methods
const nodeMethods = content.match(/private create(\w+)Schema\(\): NodeSchema \{/g) || [];
const nodeNames = nodeMethods.map(m => {
  const match = m.match(/create(\w+)Schema/);
  return match ? match[1].toLowerCase().replace(/([A-Z])/g, '_$1').toLowerCase() : null;
}).filter(Boolean);

console.log('=== AI NODE DETECTION VERIFICATION ===\n');
console.log(`Total nodes found: ${nodeNames.length}\n`);

const issues = [];
const nodeStatus = {};

nodeNames.forEach(nodeName => {
  const status = {
    hasAiCriteria: false,
    hasWhenToUse: false,
    hasWhenNotToUse: false,
    hasKeywords: false,
    hasUseCases: false,
    hasCommonPatterns: false,
    keywordCount: 0,
    patternCount: 0
  };

  // Find the schema method
  const methodName = `create${nodeName.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}Schema`;
  const methodRegex = new RegExp(`private ${methodName}\\(\\): NodeSchema \\{[\\s\\S]*?\\}`, 'm');
  const methodMatch = content.match(methodRegex);

  if (!methodMatch) {
    issues.push(`${nodeName}: Schema method not found`);
    nodeStatus[nodeName] = status;
    return;
  }

  const methodContent = methodMatch[0];

  // Check for aiSelectionCriteria
  if (methodContent.includes('aiSelectionCriteria:')) {
    status.hasAiCriteria = true;

    // Check for whenToUse
    if (methodContent.match(/whenToUse:\s*\[/)) {
      status.hasWhenToUse = true;
      const whenToUseMatch = methodContent.match(/whenToUse:\s*\[([\s\S]*?)\]/);
      if (whenToUseMatch && whenToUseMatch[1].trim().length > 0) {
        status.hasWhenToUse = true;
      }
    }

    // Check for whenNotToUse
    if (methodContent.match(/whenNotToUse:\s*\[/)) {
      const whenNotToUseMatch = methodContent.match(/whenNotToUse:\s*\[([\s\S]*?)\]/);
      if (whenNotToUseMatch && whenNotToUseMatch[1].trim().length > 0) {
        status.hasWhenNotToUse = true;
      }
    }

    // Check for keywords in aiSelectionCriteria
    if (methodContent.match(/keywords:\s*\[/)) {
      const keywordsMatch = methodContent.match(/keywords:\s*\[([\s\S]*?)\]/);
      if (keywordsMatch) {
        const keywordsContent = keywordsMatch[1];
        const keywordCount = (keywordsContent.match(/'/g) || []).length / 2; // Count quoted strings
        status.hasKeywords = keywordCount > 0;
        status.keywordCount = keywordCount;
      }
    }

    // Check for useCases
    if (methodContent.match(/useCases:\s*\[/)) {
      const useCasesMatch = methodContent.match(/useCases:\s*\[([\s\S]*?)\]/);
      if (useCasesMatch && useCasesMatch[1].trim().length > 0) {
        status.hasUseCases = true;
      }
    }
  }

  // Check for top-level keywords
  if (methodContent.match(/keywords:\s*\[/)) {
    const keywordsMatch = methodContent.match(/keywords:\s*\[([\s\S]*?)\]/);
    if (keywordsMatch) {
      const keywordsContent = keywordsMatch[1];
      const keywordCount = (keywordsContent.match(/'/g) || []).length / 2;
      if (keywordCount > 0) {
        status.hasKeywords = true;
        status.keywordCount = Math.max(status.keywordCount, keywordCount);
      }
    }
  }

  // Check for commonPatterns
  if (methodContent.match(/commonPatterns:\s*\[/)) {
    const patternsMatch = methodContent.match(/commonPatterns:\s*\[([\s\S]*?)\]/);
    if (patternsMatch) {
      const patternsContent = patternsMatch[1];
      // Count pattern objects (look for name:)
      const patternCount = (patternsContent.match(/name:/g) || []).length;
      status.hasCommonPatterns = patternCount > 0;
      status.patternCount = patternCount;
    }
  }

  // Check for issues
  if (!status.hasAiCriteria) {
    issues.push(`${nodeName}: Missing aiSelectionCriteria`);
  }
  if (!status.hasWhenToUse) {
    issues.push(`${nodeName}: Missing or empty whenToUse`);
  }
  if (!status.hasKeywords || status.keywordCount < 3) {
    issues.push(`${nodeName}: Missing keywords or too few (${status.keywordCount})`);
  }
  if (!status.hasUseCases) {
    issues.push(`${nodeName}: Missing useCases`);
  }
  if (!status.hasCommonPatterns) {
    issues.push(`${nodeName}: Missing commonPatterns`);
  }

  nodeStatus[nodeName] = status;
});

// Print summary
console.log('=== NODE STATUS SUMMARY ===\n');

const goodNodes = [];
const needsWork = [];

Object.entries(nodeStatus).forEach(([node, status]) => {
  const score = 
    (status.hasAiCriteria ? 1 : 0) +
    (status.hasWhenToUse ? 1 : 0) +
    (status.hasWhenNotToUse ? 1 : 0) +
    (status.hasKeywords && status.keywordCount >= 3 ? 1 : 0) +
    (status.hasUseCases ? 1 : 0) +
    (status.hasCommonPatterns ? 1 : 0);

  if (score >= 5) {
    goodNodes.push(node);
  } else {
    needsWork.push({ node, score, status });
  }
});

console.log(`✅ Nodes with complete AI metadata: ${goodNodes.length}/${nodeNames.length}`);
console.log(`⚠️  Nodes needing improvement: ${needsWork.length}/${nodeNames.length}\n`);

if (needsWork.length > 0) {
  console.log('=== NODES NEEDING IMPROVEMENT ===\n');
  needsWork
    .sort((a, b) => a.score - b.score)
    .forEach(({ node, score, status }) => {
      console.log(`${node.padEnd(30)} Score: ${score}/6`);
      if (!status.hasAiCriteria) console.log(`  ❌ Missing aiSelectionCriteria`);
      if (!status.hasWhenToUse) console.log(`  ❌ Missing whenToUse`);
      if (!status.hasWhenNotToUse) console.log(`  ⚠️  Missing whenNotToUse`);
      if (!status.hasKeywords || status.keywordCount < 3) console.log(`  ❌ Keywords: ${status.keywordCount} (need 3+)`);
      if (!status.hasUseCases) console.log(`  ❌ Missing useCases`);
      if (!status.hasCommonPatterns) console.log(`  ❌ Missing commonPatterns`);
      console.log('');
    });
}

console.log(`\n=== ISSUES FOUND ===`);
console.log(`Total issues: ${issues.length}`);
if (issues.length > 0) {
  issues.slice(0, 20).forEach(issue => console.log(`  - ${issue}`));
  if (issues.length > 20) {
    console.log(`  ... and ${issues.length - 20} more`);
  }
}

// Check for semantic matching keywords
console.log(`\n=== SEMANTIC MATCHING CHECK ===`);
const semanticKeywords = [
  'send', 'receive', 'create', 'update', 'delete', 'get', 'fetch', 'retrieve',
  'email', 'message', 'notification', 'alert', 'slack', 'discord',
  'api', 'http', 'request', 'response', 'webhook',
  'database', 'query', 'insert', 'update', 'select',
  'file', 'upload', 'download', 'read', 'write',
  'schedule', 'cron', 'time', 'date', 'trigger',
  'if', 'else', 'condition', 'branch', 'switch',
  'loop', 'iterate', 'repeat', 'for', 'while',
  'transform', 'map', 'filter', 'reduce', 'aggregate',
  'ai', 'gpt', 'openai', 'claude', 'gemini', 'agent',
  'auth', 'oauth', 'login', 'token', 'credential',
  'cache', 'store', 'save', 'retrieve',
  'queue', 'job', 'task', 'worker', 'background',
  'delay', 'wait', 'pause', 'timeout', 'retry',
  'parallel', 'concurrent', 'simultaneous', 'batch',
  'error', 'exception', 'catch', 'handle', 'fallback'
];

const nodesWithSemanticKeywords = [];
Object.entries(nodeStatus).forEach(([node, status]) => {
  // Extract keywords from the node's schema
  const methodName = `create${node.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}Schema`;
  const methodRegex = new RegExp(`private ${methodName}\\(\\): NodeSchema \\{[\\s\\S]*?keywords: \\[([\\s\\S]*?)\\]`, 'm');
  const match = content.match(methodRegex);
  if (match) {
    const keywordsContent = match[1];
    const hasSemanticMatch = semanticKeywords.some(sk => 
      keywordsContent.toLowerCase().includes(sk.toLowerCase())
    );
    if (hasSemanticMatch) {
      nodesWithSemanticKeywords.push(node);
    }
  }
});

console.log(`Nodes with semantic keywords: ${nodesWithSemanticKeywords.length}/${nodeNames.length}`);
console.log(`Coverage: ${((nodesWithSemanticKeywords.length / nodeNames.length) * 100).toFixed(1)}%`);

console.log(`\n=== RECOMMENDATIONS ===`);
if (needsWork.length > 0) {
  console.log(`1. Add missing aiSelectionCriteria to ${needsWork.filter(n => !n.status.hasAiCriteria).length} nodes`);
  console.log(`2. Add more keywords (3+) to ${needsWork.filter(n => !n.status.hasKeywords || n.status.keywordCount < 3).length} nodes`);
  console.log(`3. Add commonPatterns to ${needsWork.filter(n => !n.status.hasCommonPatterns).length} nodes`);
  console.log(`4. Add useCases to ${needsWork.filter(n => !n.status.hasUseCases).length} nodes`);
}
console.log(`5. Ensure all nodes have semantic keywords for better matching`);
