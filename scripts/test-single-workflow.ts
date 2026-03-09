#!/usr/bin/env ts-node
/**
 * Test Single Workflow - Stage 1
 * 
 * Run a specific workflow test to verify keyword extraction and variation generation
 * 
 * Usage:
 *   ts-node worker/scripts/test-single-workflow.ts "Generate AI content daily and post automatically on all social platforms."
 */

import { AIIntentClarifier } from '../src/services/ai/summarize-layer';

async function testSingleWorkflow(prompt: string) {
  console.log('🧪 Testing Single Workflow - Stage 1\n');
  console.log('='.repeat(80));
  console.log(`📋 Prompt: "${prompt}"\n`);
  
  const clarifier = new AIIntentClarifier();
  
  try {
    console.log('⏳ Extracting keywords and generating variations...\n');
    const result = await clarifier.clarifyIntentAndGenerateVariations(prompt);
    
    // Display results
    console.log('✅ RESULTS\n');
    console.log('='.repeat(80));
    
    // Extracted Keywords
    console.log('📌 EXTRACTED KEYWORDS:');
    const extractedKeywords = result.mandatoryNodeTypes || [];
    if (extractedKeywords.length > 0) {
      extractedKeywords.forEach((keyword, idx) => {
        console.log(`   ${idx + 1}. ${keyword}`);
      });
    } else {
      console.log('   ⚠️  No keywords extracted');
    }
    console.log('');
    
    // Variations
    console.log(`📝 PROMPT VARIATIONS (${result.promptVariations.length}):\n`);
    result.promptVariations.forEach((variation, idx) => {
      console.log(`   Variation ${idx + 1} (ID: ${variation.id}):`);
      console.log(`   ──────────────────────────────────────────────────────────────`);
      console.log(`   Prompt: "${variation.prompt}"`);
      console.log(`   Keywords: ${variation.keywords && variation.keywords.length > 0 ? variation.keywords.join(', ') : 'None'}`);
      console.log(`   Matched Keywords: ${variation.matchedKeywords && variation.matchedKeywords.length > 0 ? variation.matchedKeywords.join(', ') : 'None'}`);
      console.log(`   Confidence: ${variation.confidence}`);
      console.log(`   Reasoning: ${variation.reasoning}`);
      console.log('');
    });
    
    // Validation
    console.log('🔍 VALIDATION:\n');
    const variationsWithKeywords = result.promptVariations.filter(v => 
      v.keywords && v.keywords.length > 0
    ).length;
    
    const variationsWithNaturalKeywords = result.promptVariations.filter(v => {
      if (!v.keywords || v.keywords.length === 0) return false;
      const promptLower = v.prompt.toLowerCase();
      return v.keywords.some(keyword => 
        promptLower.includes(keyword.toLowerCase()) ||
        promptLower.includes(keyword.replace(/_/g, ' ').toLowerCase())
      );
    }).length;
    
    console.log(`   ✅ Keywords Extracted: ${extractedKeywords.length}`);
    console.log(`   ✅ Variations Generated: ${result.promptVariations.length}`);
    console.log(`   ✅ Variations with Keywords: ${variationsWithKeywords}/${result.promptVariations.length}`);
    console.log(`   ✅ Variations with Natural Keywords: ${variationsWithNaturalKeywords}/${result.promptVariations.length}`);
    
    // Check if keywords are naturally integrated
    if (variationsWithNaturalKeywords === result.promptVariations.length) {
      console.log(`   ✅ All variations have keywords naturally integrated in text`);
    } else {
      console.log(`   ⚠️  ${result.promptVariations.length - variationsWithNaturalKeywords} variation(s) missing natural keyword integration`);
    }
    
    // Check for hardcoded examples
    const hasHardcoded = result.promptVariations.some(v => {
      const promptLower = v.prompt.toLowerCase();
      // Check for common hardcoded examples
      return (promptLower.includes('google_sheets') && !extractedKeywords.some(k => k.includes('sheets'))) ||
             (promptLower.includes('google_gmail') && !extractedKeywords.some(k => k.includes('gmail'))) ||
             (promptLower.includes('linkedin') && !extractedKeywords.some(k => k.includes('linkedin')));
    });
    
    if (!hasHardcoded) {
      console.log(`   ✅ No hardcoded node examples detected (using extracted keywords)`);
    } else {
      console.log(`   ⚠️  Possible hardcoded examples detected`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Test Complete\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Get prompt from command line or use default
const prompt = process.argv[2] || 'Generate AI content daily and post automatically on all social platforms.';

testSingleWorkflow(prompt)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
