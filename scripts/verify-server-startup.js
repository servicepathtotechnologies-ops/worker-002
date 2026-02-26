/**
 * Server Startup Verification Script
 * 
 * This script verifies the server can start without actually starting it.
 * Use this to diagnose startup issues.
 */

const path = require('path');
const fs = require('fs');

console.log('🔍 Server Startup Verification');
console.log('='.repeat(60));

// Check 1: Verify dist directory exists (for npm start)
const distPath = path.join(__dirname, '..', 'dist');
const distExists = fs.existsSync(distPath);
console.log(`\n1️⃣  Build Check:`);
console.log(`   dist/ directory: ${distExists ? '✅ EXISTS' : '❌ MISSING'}`);
if (!distExists) {
  console.log(`   ⚠️  Run "npm run build" before using "npm start"`);
  console.log(`   💡 Or use "npm run dev" which doesn't require build`);
}

// Check 2: Verify index.ts exists
const indexTsPath = path.join(__dirname, '..', 'src', 'index.ts');
const indexTsExists = fs.existsSync(indexTsPath);
console.log(`\n2️⃣  Source Check:`);
console.log(`   src/index.ts: ${indexTsExists ? '✅ EXISTS' : '❌ MISSING'}`);

// Check 3: Verify .env file
const envPaths = [
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', 'env'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'env'),
];
let envFound = false;
let envPath = null;
for (const envPathCheck of envPaths) {
  if (fs.existsSync(envPathCheck)) {
    envFound = true;
    envPath = envPathCheck;
    break;
  }
}
console.log(`\n3️⃣  Environment Check:`);
console.log(`   .env file: ${envFound ? '✅ FOUND' : '⚠️  NOT FOUND'}`);
if (envFound) {
  console.log(`   Location: ${envPath}`);
} else {
  console.log(`   ⚠️  Server may start but may have missing config`);
  console.log(`   💡 Checked: ${envPaths.join(', ')}`);
}

// Check 4: Verify port configuration
console.log(`\n4️⃣  Port Configuration:`);
const port = process.env.PORT || '3001';
console.log(`   PORT: ${port} (from ${process.env.PORT ? 'env' : 'default'})`);

// Check 5: Check if port is in use
const { execSync } = require('child_process');
let portInUse = false;
try {
  if (process.platform === 'win32') {
    const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: 'pipe' });
    portInUse = result.trim().length > 0;
  } else {
    const result = execSync(`lsof -i :${port}`, { encoding: 'utf8', stdio: 'pipe' });
    portInUse = result.trim().length > 0;
  }
} catch (e) {
  // Port not in use
  portInUse = false;
}
console.log(`   Port ${port}: ${portInUse ? '⚠️  IN USE' : '✅ AVAILABLE'}`);
if (portInUse) {
  console.log(`   ⚠️  Another process is using port ${port}`);
  console.log(`   💡 Kill the process or change PORT in .env`);
}

// Check 6: Verify node_modules
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
const nodeModulesExists = fs.existsSync(nodeModulesPath);
console.log(`\n5️⃣  Dependencies Check:`);
console.log(`   node_modules: ${nodeModulesExists ? '✅ EXISTS' : '❌ MISSING'}`);
if (!nodeModulesExists) {
  console.log(`   ⚠️  Run "npm install" first`);
}

// Summary
console.log(`\n${'='.repeat(60)}`);
console.log('📋 Summary:');
if (indexTsExists && nodeModulesExists) {
  console.log('✅ Basic requirements met');
  if (distExists) {
    console.log('✅ Ready for "npm start" (production mode)');
  } else {
    console.log('✅ Ready for "npm run dev" (development mode)');
  }
} else {
  console.log('❌ Missing requirements - fix above issues first');
}

console.log(`\n🚀 To start the server:`);
if (distExists) {
  console.log(`   npm start          # Production (uses dist/)`);
}
console.log(`   npm run dev        # Development (uses ts-node)`);
console.log(`\n`);
