/**
 * Test Server Start
 * 
 * Attempts to start the server and logs what happens.
 * This helps diagnose startup failures.
 */

console.log('🧪 Testing Server Startup...');
console.log('='.repeat(60));

// Try to load and start the server
try {
  console.log('\n1️⃣  Loading environment variables...');
  require('../src/core/env-loader');
  console.log('   ✅ Environment loaded');
  
  console.log('\n2️⃣  Loading Express app...');
  const app = require('../src/index.ts');
  console.log('   ✅ Express app loaded');
  
  console.log('\n3️⃣  Server should be starting...');
  console.log('   ⏳ Waiting 3 seconds to see if server starts...');
  
  // Wait a bit to see if server starts
  setTimeout(() => {
    console.log('\n4️⃣  Checking if server is listening...');
    const { execSync } = require('child_process');
    try {
      if (process.platform === 'win32') {
        const result = execSync('netstat -ano | findstr :3001', { encoding: 'utf8', stdio: 'pipe' });
        if (result.trim().length > 0) {
          console.log('   ✅ Server is listening on port 3001!');
          console.log('   📊 Port status:');
          console.log(result);
        } else {
          console.log('   ❌ Server is NOT listening on port 3001');
          console.log('   ⚠️  Server may have failed to start or crashed');
        }
      } else {
        const result = execSync('lsof -i :3001', { encoding: 'utf8', stdio: 'pipe' });
        if (result.trim().length > 0) {
          console.log('   ✅ Server is listening on port 3001!');
          console.log('   📊 Port status:');
          console.log(result);
        } else {
          console.log('   ❌ Server is NOT listening on port 3001');
          console.log('   ⚠️  Server may have failed to start or crashed');
        }
      }
    } catch (e) {
      console.log('   ❌ Server is NOT listening on port 3001');
      console.log('   ⚠️  Error checking port:', e.message);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('💡 If server is not listening:');
    console.log('   1. Check console output above for errors');
    console.log('   2. Look for [ServerStartup] logs');
    console.log('   3. Check for unhandled promise rejections');
    console.log('   4. Verify environment variables are set');
    console.log('\n');
    
    process.exit(0);
  }, 3000);
  
} catch (error) {
  console.error('\n❌ Failed to load server:');
  console.error('   Error:', error.message);
  console.error('   Stack:', error.stack);
  console.log('\n💡 This error occurred during module loading.');
  console.log('   Check the error above and fix the issue.');
  process.exit(1);
}
