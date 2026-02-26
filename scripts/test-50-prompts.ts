/**
 * Test 50 Random User Prompts
 * Analyzes how well the system handles various prompts
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  prompt: string;
  expectedTrigger?: string;
  expectedNodes?: string[];
  actualTrigger?: string;
  actualNodes?: string[];
  accuracy: 'correct' | 'partial' | 'incorrect' | 'not_tested';
  issues?: string[];
}

// Generate 50 diverse test prompts
function generateTestPrompts(): string[] {
  return [
    // LinkedIn & Social Media (10)
    'post to linkedin daily',
    'schedule linkedin posts weekly',
    'post content to linkedin',
    'automated linkedin posting',
    'daily linkedin post automation',
    'post to twitter daily',
    'schedule instagram posts',
    'post to linkedin from google sheets',
    'linkedin posting workflow',
    'share content on linkedin',

    // Scheduled Automation (10)
    'send daily report to email',
    'daily slack notification',
    'hourly data sync',
    'weekly backup to sheets',
    'schedule email every morning',
    'daily reminder to slack',
    'send weekly summary',
    'hourly health check',
    'daily metrics report',
    'schedule notification at 9am',

    // Form Processing (5)
    'save form data to sheets',
    'form submission to email',
    'form to slack notification',
    'form data to database',
    'form submission confirmation',

    // Webhook (5)
    'webhook to sheets',
    'webhook to slack',
    'webhook data processing',
    'webhook to database',
    'webhook notification',

    // Data Processing (5)
    'transform data with javascript',
    'read from database',
    'write to database',
    'database to sheets sync',
    'data transformation pipeline',

    // AI Processing (5)
    'ai chatbot workflow',
    'ai content generation',
    'ai email summarization',
    'ai data analysis',
    'ai workflow automation',

    // Integration (5)
    'sheets to gmail',
    'api to sheets',
    'database to slack',
    'sheets to multiple channels',
    'multi-service integration',

    // Notification (5)
    'slack notification on error',
    'email alert on condition',
    'discord notification',
    'multi-channel alert',
    'notification workflow',
  ];
}

// Expected results for each prompt
function getExpectedResult(prompt: string): { trigger: string; nodes: string[] } {
  const lower = prompt.toLowerCase();
  
  // LinkedIn prompts
  if (lower.includes('linkedin')) {
    const nodes = ['linkedin'];
    if (lower.includes('sheets') || lower.includes('google')) {
      nodes.unshift('google_sheets');
    }
    return {
      trigger: lower.includes('daily') || lower.includes('schedule') || lower.includes('weekly') ? 'schedule' : 'manual_trigger',
      nodes,
    };
  }

  // Twitter/Instagram
  if (lower.includes('twitter')) {
    return {
      trigger: lower.includes('daily') || lower.includes('schedule') ? 'schedule' : 'manual_trigger',
      nodes: ['twitter'],
    };
  }
  if (lower.includes('instagram')) {
    return {
      trigger: lower.includes('schedule') ? 'schedule' : 'manual_trigger',
      nodes: ['instagram'],
    };
  }

  // Scheduled automation
  if (lower.includes('daily') || lower.includes('hourly') || lower.includes('weekly') || lower.includes('schedule')) {
    if (lower.includes('email') || lower.includes('gmail')) {
      return { trigger: 'schedule', nodes: lower.includes('gmail') ? ['google_gmail'] : ['email'] };
    }
    if (lower.includes('slack')) {
      return { trigger: 'schedule', nodes: ['slack_message'] };
    }
    if (lower.includes('discord')) {
      return { trigger: 'schedule', nodes: ['discord'] };
    }
    if (lower.includes('sheets') || lower.includes('backup')) {
      return { trigger: 'schedule', nodes: ['google_sheets'] };
    }
    if (lower.includes('database') || lower.includes('sync')) {
      return { trigger: 'schedule', nodes: lower.includes('read') ? ['database_read'] : ['database_write'] };
    }
    return { trigger: 'schedule', nodes: ['slack_message'] }; // Default
  }

  // Form processing
  if (lower.includes('form')) {
    const nodes: string[] = [];
    if (lower.includes('sheets')) nodes.push('google_sheets');
    if (lower.includes('email') || lower.includes('gmail')) {
      nodes.push(lower.includes('gmail') ? 'google_gmail' : 'email');
    }
    if (lower.includes('slack')) nodes.push('slack_message');
    if (lower.includes('database')) nodes.push('database_write');
    if (nodes.length === 0) nodes.push('google_sheets'); // Default
    return { trigger: 'form', nodes };
  }

  // Webhook
  if (lower.includes('webhook')) {
    const nodes: string[] = [];
    if (lower.includes('sheets')) nodes.push('google_sheets');
    if (lower.includes('slack')) nodes.push('slack_message');
    if (lower.includes('database')) nodes.push('database_write');
    if (lower.includes('notification')) nodes.push('slack_message');
    if (nodes.length === 0) nodes.push('slack_message'); // Default
    return { trigger: 'webhook', nodes };
  }

  // Data processing
  if (lower.includes('transform') || lower.includes('javascript')) {
    return { trigger: 'manual_trigger', nodes: ['javascript', 'google_sheets'] };
  }
  if (lower.includes('read from database') || lower.includes('database read')) {
    return { trigger: 'manual_trigger', nodes: ['database_read'] };
  }
  if (lower.includes('write to database') || lower.includes('database write')) {
    return { trigger: 'manual_trigger', nodes: ['database_write'] };
  }
  if (lower.includes('database to sheets') || lower.includes('database sync')) {
    return { trigger: 'schedule', nodes: ['database_read', 'google_sheets'] };
  }

  // AI processing
  if (lower.includes('ai')) {
    const nodes = ['ai_agent'];
    if (lower.includes('email')) nodes.push('email');
    if (lower.includes('slack')) nodes.push('slack_message');
    if (lower.includes('linkedin')) nodes.push('linkedin');
    return { trigger: lower.includes('chatbot') ? 'chat_trigger' : 'manual_trigger', nodes };
  }

  // Integration
  if (lower.includes('sheets to gmail') || lower.includes('sheets to email')) {
    return { trigger: 'schedule', nodes: ['google_sheets', 'google_gmail'] };
  }
  if (lower.includes('api to sheets')) {
    return { trigger: 'schedule', nodes: ['http_request', 'google_sheets'] };
  }
  if (lower.includes('database to slack')) {
    return { trigger: 'schedule', nodes: ['database_read', 'slack_message'] };
  }

  // Notification
  if (lower.includes('slack notification') || lower.includes('slack alert')) {
    return { trigger: lower.includes('on error') || lower.includes('on condition') ? 'webhook' : 'schedule', nodes: ['slack_message'] };
  }
  if (lower.includes('email alert') || lower.includes('email notification')) {
    return { trigger: 'schedule', nodes: ['email'] };
  }
  if (lower.includes('discord notification')) {
    return { trigger: 'webhook', nodes: ['discord'] };
  }

  // Default
  return { trigger: 'manual_trigger', nodes: ['slack_message'] };
}

// Simulate API call (or make actual call if worker is running)
async function testPrompt(prompt: string): Promise<TestResult> {
  const expected = getExpectedResult(prompt);
  
  // Try to call actual API if worker is running
  const workerUrl = process.env.WORKER_URL || 'http://localhost:3001';
  
  try {
    const response = await fetch(`${workerUrl}/api/generate-workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (response.ok) {
      const data = await response.json() as { 
        nodes?: Array<{ 
          type: string; 
          data?: { type: string; label?: string } 
        }>;
        workflow?: { 
          nodes?: Array<{ 
            type: string; 
            data?: { type: string; label?: string } 
          }> 
        };
      };
      
      // CRITICAL: Nodes can be in data.nodes or data.workflow.nodes
      const nodes = data.nodes || data.workflow?.nodes || [];
      
      // CRITICAL: Extract actual node type from node.data.type (not node.type which is 'custom')
      // Use normalizeNodeType logic to extract correct type
      const actualNodes = nodes.map((n: any) => {
        // CRITICAL: Frontend uses type: "custom" with actual type in data.type
        let nodeType = n.type || '';
        
        // Handle frontend normalization where type: "custom" with actual type in data.type
        if (nodeType === 'custom' && n.data?.type) {
          nodeType = n.data.type;
        }
        
        // Also check for data.nodeType as fallback
        if ((!nodeType || nodeType === 'custom') && n.data?.nodeType) {
          nodeType = n.data.nodeType;
        }
        
        // If still empty, try to infer from data.type directly
        if (!nodeType && n.data?.type) {
          nodeType = n.data.type;
        }
        
        // Last resort: try to infer from label
        if ((!nodeType || nodeType === 'custom') && n.data?.label) {
          const label = n.data.label.toLowerCase();
          if (label.includes('linkedin')) return 'linkedin';
          if (label.includes('schedule')) return 'schedule';
          if (label.includes('slack')) return 'slack_message';
          if (label.includes('email') || label.includes('gmail')) return label.includes('gmail') ? 'google_gmail' : 'email';
          if (label.includes('form')) return 'form';
          if (label.includes('webhook')) return 'webhook';
          if (label.includes('twitter')) return 'twitter';
          if (label.includes('instagram')) return 'instagram';
          if (label.includes('discord')) return 'discord';
          if (label.includes('database')) return 'database_read';
        }
        
        return nodeType && nodeType !== 'custom' ? nodeType : null;
      }).filter((t: string | null): t is string => t !== null && t !== '');
      
      const actualTrigger = actualNodes[0] || 'unknown';
      const actualActionNodes = actualNodes.slice(1);

      // Analyze accuracy
      const issues: string[] = [];
      let accuracy: 'correct' | 'partial' | 'incorrect' = 'correct';

      // Check trigger
      if (actualTrigger !== expected.trigger) {
        issues.push(`Wrong trigger: expected "${expected.trigger}", got "${actualTrigger}"`);
        accuracy = 'incorrect';
      }

      // Check nodes
      const expectedSet = new Set(expected.nodes);
      const actualSet = new Set(actualActionNodes);
      
      const missing = expected.nodes.filter((n: string) => !actualSet.has(n));
      const extra = actualActionNodes.filter((n: string) => !expectedSet.has(n));

      if (missing.length > 0) {
        issues.push(`Missing nodes: ${missing.join(', ')}`);
        if (accuracy === 'correct') accuracy = 'partial';
      }

      if (extra.length > 0 && !missing.length) {
        // Extra nodes are OK if all expected are present
        if (accuracy === 'correct') accuracy = 'partial';
      }

      if (missing.length > 0 && actualActionNodes.length === 0) {
        accuracy = 'incorrect';
      }

      return {
        prompt,
        expectedTrigger: expected.trigger,
        expectedNodes: expected.nodes,
        actualTrigger,
        actualNodes: actualActionNodes,
        accuracy,
        issues: issues.length > 0 ? issues : undefined,
      };
    }
  } catch (error) {
    // Worker not running or error - return expected only
    console.warn(`⚠️  Could not test "${prompt}": ${error instanceof Error ? error.message : String(error)}`);
  }

  // Fallback: return expected result only
  return {
    prompt,
    expectedTrigger: expected.trigger,
    expectedNodes: expected.nodes,
    accuracy: 'not_tested',
    issues: ['Worker not running - could not test'],
  };
}

async function main() {
  console.log('🧪 Testing 50 Random User Prompts\n');
  console.log('⏳ This may take a few minutes...\n');

  const prompts = generateTestPrompts();
  const results: TestResult[] = [];

  // Test each prompt
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    process.stdout.write(`\rTesting ${i + 1}/${prompts.length}: ${prompt.substring(0, 50)}...`);
    
    const result = await testPrompt(prompt);
    results.push(result);
    
    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n\n📊 Analysis Results:\n');

  // Statistics
  const correct = results.filter(r => r.accuracy === 'correct').length;
  const partial = results.filter(r => r.accuracy === 'partial').length;
  const incorrect = results.filter(r => r.accuracy === 'incorrect').length;
  const notTested = results.filter(r => r.accuracy === 'not_tested').length;

  console.log('📈 Overall Statistics:');
  console.log(`   Total prompts: ${results.length}`);
  console.log(`   ✅ Correct: ${correct} (${((correct / results.length) * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  Partial: ${partial} (${((partial / results.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Incorrect: ${incorrect} (${((incorrect / results.length) * 100).toFixed(1)}%)`);
  console.log(`   ⏸️  Not tested: ${notTested} (${((notTested / results.length) * 100).toFixed(1)}%)\n`);

  // Accuracy by category
  console.log('📋 Accuracy by Category:\n');

  const categories = {
    'LinkedIn & Social Media': prompts.slice(0, 10),
    'Scheduled Automation': prompts.slice(10, 20),
    'Form Processing': prompts.slice(20, 25),
    'Webhook': prompts.slice(25, 30),
    'Data Processing': prompts.slice(30, 35),
    'AI Processing': prompts.slice(35, 40),
    'Integration': prompts.slice(40, 45),
    'Notification': prompts.slice(45, 50),
  };

  Object.entries(categories).forEach(([category, categoryPrompts]) => {
    const categoryResults = results.filter(r => categoryPrompts.includes(r.prompt));
    const catCorrect = categoryResults.filter(r => r.accuracy === 'correct').length;
    const catPartial = categoryResults.filter(r => r.accuracy === 'partial').length;
    const catIncorrect = categoryResults.filter(r => r.accuracy === 'incorrect').length;
    const catNotTested = categoryResults.filter(r => r.accuracy === 'not_tested').length;
    
    const total = categoryResults.length;
    const accuracy = total > 0 ? ((catCorrect / total) * 100).toFixed(1) : '0';
    
    console.log(`   ${category}:`);
    console.log(`      ✅ ${catCorrect} | ⚠️ ${catPartial} | ❌ ${catIncorrect} | ⏸️ ${catNotTested} | Accuracy: ${accuracy}%`);
  });

  // Common issues
  console.log('\n🔍 Common Issues:\n');
  
  const allIssues = results.flatMap(r => r.issues || []);
  const issueCounts = new Map<string, number>();
  
  allIssues.forEach(issue => {
    const key = issue.split(':')[0]; // Get issue type
    issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
  });

  Array.from(issueCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([issue, count]) => {
      console.log(`   ${issue}: ${count} occurrences`);
    });

  // Show incorrect results
  const incorrectResults = results.filter(r => r.accuracy === 'incorrect');
  if (incorrectResults.length > 0) {
    console.log('\n❌ Incorrect Results (Top 10):\n');
    incorrectResults.slice(0, 10).forEach(result => {
      console.log(`   Prompt: "${result.prompt}"`);
      console.log(`   Expected: ${result.expectedTrigger} → ${result.expectedNodes?.join(', ')}`);
      console.log(`   Got: ${result.actualTrigger} → ${result.actualNodes?.join(', ') || 'none'}`);
      if (result.issues) {
        result.issues.forEach(issue => console.log(`   Issue: ${issue}`));
      }
      console.log('');
    });
  }

  // Show partial results
  const partialResults = results.filter(r => r.accuracy === 'partial');
  if (partialResults.length > 0) {
    console.log('\n⚠️  Partial Results (Top 5):\n');
    partialResults.slice(0, 5).forEach(result => {
      console.log(`   Prompt: "${result.prompt}"`);
      console.log(`   Expected: ${result.expectedTrigger} → ${result.expectedNodes?.join(', ')}`);
      console.log(`   Got: ${result.actualTrigger} → ${result.actualNodes?.join(', ') || 'none'}`);
      if (result.issues) {
        result.issues.forEach(issue => console.log(`   Issue: ${issue}`));
      }
      console.log('');
    });
  }

  // Save results to file
  const outputPath = path.join(__dirname, '../data/test-results-50-prompts.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      total: results.length,
      statistics: {
        correct,
        partial,
        incorrect,
        notTested,
        accuracy: ((correct / results.length) * 100).toFixed(1) + '%',
      },
      results,
    }, null, 2),
    'utf-8'
  );

  console.log(`\n💾 Results saved to: ${outputPath}\n`);

  // Final summary
  const accuracy = ((correct / results.length) * 100).toFixed(1);
  console.log('🎯 Final Summary:');
  console.log(`   Overall Accuracy: ${accuracy}%`);
  console.log(`   Status: ${parseFloat(accuracy) >= 80 ? '✅ Excellent' : parseFloat(accuracy) >= 60 ? '⚠️ Needs Improvement' : '❌ Poor'}\n`);

  if (notTested > 0) {
    console.log('💡 Note: Some prompts were not tested because worker is not running.');
    console.log('   Start worker with: cd worker && npm run dev\n');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main, generateTestPrompts, getExpectedResult };
