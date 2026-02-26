/**
 * Analyze Test Results and Identify Issues
 * Provides detailed analysis of what went wrong and how to fix it
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

interface Analysis {
  total: number;
  correct: number;
  partial: number;
  incorrect: number;
  notTested: number;
  accuracy: number;
  issues: {
    wrongTrigger: number;
    missingNodes: number;
    extraNodes: number;
    platformNodesMissing: number;
  };
  recommendations: string[];
}

function analyzeResults(resultsPath: string): Analysis {
  const data = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const results: TestResult[] = data.results || [];

  const analysis: Analysis = {
    total: results.length,
    correct: 0,
    partial: 0,
    incorrect: 0,
    notTested: 0,
    accuracy: 0,
    issues: {
      wrongTrigger: 0,
      missingNodes: 0,
      extraNodes: 0,
      platformNodesMissing: 0,
    },
    recommendations: [],
  };

  results.forEach(result => {
    if (result.accuracy === 'correct') analysis.correct++;
    else if (result.accuracy === 'partial') analysis.partial++;
    else if (result.accuracy === 'incorrect') analysis.incorrect++;
    else analysis.notTested++;

    if (result.issues) {
      result.issues.forEach(issue => {
        if (issue.includes('Wrong trigger')) analysis.issues.wrongTrigger++;
        if (issue.includes('Missing nodes')) {
          analysis.issues.missingNodes++;
          if (issue.includes('linkedin') || issue.includes('twitter') || issue.includes('instagram')) {
            analysis.issues.platformNodesMissing++;
          }
        }
        if (issue.includes('Extra nodes')) analysis.issues.extraNodes++;
      });
    }
  });

  analysis.accuracy = ((analysis.correct / analysis.total) * 100);

  // Generate recommendations
  if (analysis.issues.platformNodesMissing > 0) {
    analysis.recommendations.push(
      `🚨 CRITICAL: ${analysis.issues.platformNodesMissing} platform nodes (LinkedIn, Twitter, Instagram) are missing. ` +
      `Fix: Improve enforcePlatformNodeSelection() to check full prompt, not just primaryGoal.`
    );
  }

  if (analysis.issues.wrongTrigger > 0) {
    analysis.recommendations.push(
      `⚠️  ${analysis.issues.wrongTrigger} workflows have wrong trigger selection. ` +
      `Fix: Improve trigger detection logic - "daily" should always use "schedule" trigger.`
    );
  }

  if (analysis.issues.missingNodes > 0) {
    analysis.recommendations.push(
      `⚠️  ${analysis.issues.missingNodes} workflows are missing required nodes. ` +
      `Fix: Check filterUnmentionedNodes() - it might be removing nodes that should be kept.`
    );
  }

  if (analysis.accuracy < 50) {
    analysis.recommendations.push(
      `❌ Overall accuracy is ${analysis.accuracy.toFixed(1)}% - very low. ` +
      `Fix: Train model with more examples, improve system prompts, fix node selection logic.`
    );
  }

  return analysis;
}

function main() {
  console.log('📊 Analyzing Test Results...\n');

  const resultsPath = path.join(__dirname, '../data/test-results-50-prompts.json');
  
  if (!fs.existsSync(resultsPath)) {
    console.error('❌ Test results file not found:', resultsPath);
    console.log('💡 Run test-50-prompts.ts first!');
    process.exit(1);
  }

  const analysis = analyzeResults(resultsPath);

  console.log('📈 Overall Statistics:');
  console.log(`   Total: ${analysis.total}`);
  console.log(`   ✅ Correct: ${analysis.correct} (${((analysis.correct / analysis.total) * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  Partial: ${analysis.partial} (${((analysis.partial / analysis.total) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Incorrect: ${analysis.incorrect} (${((analysis.incorrect / analysis.total) * 100).toFixed(1)}%)`);
  console.log(`   ⏸️  Not tested: ${analysis.notTested} (${((analysis.notTested / analysis.total) * 100).toFixed(1)}%)\n`);

  console.log('🔍 Issue Breakdown:');
  console.log(`   Wrong trigger: ${analysis.issues.wrongTrigger}`);
  console.log(`   Missing nodes: ${analysis.issues.missingNodes}`);
  console.log(`   Platform nodes missing: ${analysis.issues.platformNodesMissing}`);
  console.log(`   Extra nodes: ${analysis.issues.extraNodes}\n`);

  console.log('💡 Recommendations:\n');
  analysis.recommendations.forEach((rec, i) => {
    console.log(`   ${i + 1}. ${rec}\n`);
  });

  // Save analysis
  const outputPath = path.join(__dirname, '../data/test-analysis.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      analysis,
    }, null, 2),
    'utf-8'
  );

  console.log(`💾 Analysis saved to: ${outputPath}\n`);
}

if (require.main === module) {
  main();
}

export { analyzeResults, main };
