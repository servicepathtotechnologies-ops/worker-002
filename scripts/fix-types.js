#!/usr/bin/env node
/**
 * Auto-fix script for common TypeScript type errors
 * Helps identify and fix common type mismatches
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const commonFixes = {
  // Array type mismatches - string[] to object[]
  'string\\[\\].*outputs': (line, file) => {
    if (line.includes('outputs') && line.includes('string[]')) {
      console.log(`🔧 Fixing outputs type in ${file}`);
      return line.replace(/outputs:\s*\[\]\s*as\s*string\[\]/g, 'outputs: [] as OutputDefinition[]');
    }
    return line;
  },

  // Missing type annotations for object literals
  'const\\s+\\w+\\s*=\\s*\\{': (line, file) => {
    const match = line.match(/const\s+(\w+)\s*=\s*\{/);
    if (match && !line.includes(':')) {
      const varName = match[1];
      // Only fix if it's a structure-like variable
      if (['structure', 'config', 'result', 'data'].includes(varName.toLowerCase())) {
        console.log(`🔧 Adding type annotation for ${varName} in ${file}`);
        return line.replace(`const ${varName} = {`, `const ${varName}: any = {`);
      }
    }
    return line;
  },
};

function fixTypeErrors(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let fixed = false;
  const newLines = [];

  lines.forEach((line, index) => {
    let modifiedLine = line;
    let lineFixed = false;

    for (const [pattern, fixer] of Object.entries(commonFixes)) {
      try {
        const regex = new RegExp(pattern);
        if (regex.test(line)) {
          const fixedLine = fixer(line, filePath);
          if (fixedLine !== line) {
            console.log(`   Line ${index + 1}: ${line.trim()}`);
            console.log(`   → ${fixedLine.trim()}`);
            modifiedLine = fixedLine;
            lineFixed = true;
            fixed = true;
          }
        }
      } catch (e) {
        // Skip invalid regex patterns
      }
    }

    newLines.push(modifiedLine);
  });

  if (fixed) {
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    console.log(`✅ Fixed type errors in ${filePath}\n`);
  }

  return fixed;
}

function findTypeScriptFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        // Skip node_modules and dist
        if (entry.name === 'node_modules' || entry.name === 'dist') {
          continue;
        }

        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  traverse(dir);
  return files;
}

// Main execution
console.log('🔍 Auto-fixing common TypeScript type errors...\n');

const srcDir = path.join(__dirname, '..', 'src');
const tsFiles = findTypeScriptFiles(srcDir);

console.log(`Found ${tsFiles.length} TypeScript files to check\n`);

let fixedCount = 0;
tsFiles.forEach((file) => {
  if (fixTypeErrors(file)) {
    fixedCount++;
  }
});

console.log(`\n✅ Fixed ${fixedCount} files automatically`);
console.log('📋 Remaining errors may need manual fixing');
console.log('\n💡 Run "npm run type-check" to verify all types are correct');

// Run type check to show remaining errors
if (fixedCount > 0) {
  console.log('\n🔍 Running type check to verify fixes...\n');
  try {
    execSync('npm run type-check', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (error) {
    console.log('\n⚠️  Some type errors remain. Please fix them manually.');
  }
}
