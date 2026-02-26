/**
 * Verification Script for Fine-Tuned Model
 * 
 * This script verifies that:
 * 1. Fine-tuned model exists on Ollama server
 * 2. Model can be loaded and used
 * 3. Environment variables are configured correctly
 * 4. Integration points are working
 * 
 * Usage:
 *   npm run verify:fine-tuned
 *   OR
 *   ts-node scripts/verify-fine-tuned-model.ts
 */

// Load environment variables FIRST, before any other imports
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

// Now import modules that depend on environment variables
import { ollamaManager } from '../src/services/ai/ollama-manager';
import { config } from '../src/core/config';
import * as fs from 'fs';

interface VerificationResult {
  step: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

class FineTunedModelVerifier {
  private results: VerificationResult[] = [];
  private fineTunedModel: string;
  private useFineTuned: boolean;

  constructor() {
    this.fineTunedModel = process.env.FINE_TUNED_MODEL || 'ctrlchecks-workflow-builder';
    this.useFineTuned = process.env.USE_FINE_TUNED_MODEL === 'true';
  }

  /**
   * Run all verification steps
   */
  async verify(): Promise<void> {
    console.log('🔍 Verifying Fine-Tuned Model Setup\n');
    console.log(`   Fine-tuned model: ${this.fineTunedModel}`);
    console.log(`   Use fine-tuned: ${this.useFineTuned}\n`);

    // Step 1: Check environment variables
    this.verifyEnvironmentVariables();

    // Step 2: Check Ollama connection
    await this.verifyOllamaConnection();

    // Step 3: Check if model exists
    await this.verifyModelExists();

    // Step 4: Test model loading
    await this.verifyModelLoading();

    // Step 5: Test model inference
    await this.verifyModelInference();

    // Step 6: Check integration points
    this.verifyIntegrationPoints();

    // Step 7: Check training data
    this.verifyTrainingData();

    // Print summary
    this.printSummary();
  }

  private verifyEnvironmentVariables(): void {
    console.log('📋 Step 1: Checking environment variables...');

    const checks = [
      {
        name: 'FINE_TUNED_MODEL',
        value: process.env.FINE_TUNED_MODEL,
        required: false,
      },
      {
        name: 'USE_FINE_TUNED_MODEL',
        value: process.env.USE_FINE_TUNED_MODEL,
        required: false,
      },
      {
        name: 'OLLAMA_BASE_URL',
        value: process.env.OLLAMA_BASE_URL || config.ollamaHost,
        required: true,
      },
    ];

    let allPass = true;
    for (const check of checks) {
      if (check.required && !check.value) {
        this.addResult('Environment Variables', 'fail', 
          `Missing required variable: ${check.name}`);
        allPass = false;
      } else if (check.value) {
        this.addResult('Environment Variables', 'pass', 
          `${check.name}=${check.value}`);
      } else {
        this.addResult('Environment Variables', 'warning', 
          `${check.name} not set (optional)`);
      }
    }

    if (allPass) {
      console.log('   ✅ Environment variables configured\n');
    } else {
      console.log('   ⚠️  Some environment variables missing\n');
    }
  }

  private async verifyOllamaConnection(): Promise<void> {
    console.log('🔗 Step 2: Checking Ollama connection...');

    try {
      await ollamaManager.initialize();
      const health = await ollamaManager.healthCheck();
      
      if (health.healthy) {
        this.addResult('Ollama Connection', 'pass', 
          `Connected to ${health.endpoint}`, { models: health.models });
        console.log(`   ✅ Connected to ${health.endpoint}`);
        console.log(`   📦 Available models: ${health.models.join(', ')}\n`);
      } else {
        this.addResult('Ollama Connection', 'fail', 
          `Cannot connect to Ollama at ${health.endpoint}`);
        console.log(`   ❌ Cannot connect to Ollama\n`);
      }
    } catch (error) {
      this.addResult('Ollama Connection', 'fail', 
        `Connection failed: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`   ❌ Connection failed: ${error}\n`);
    }
  }

  private async verifyModelExists(): Promise<void> {
    console.log('📦 Step 3: Checking if fine-tuned model exists...');

    try {
      const models = await ollamaManager.getAvailableModels();
      // Check for exact match or match with tag (e.g., "model:latest" or "model")
      const modelExists = models.some(m => {
        const modelName = m.name;
        // Exact match
        if (modelName === this.fineTunedModel) return true;
        // Match with tag (e.g., "ctrlchecks-workflow-builder:latest")
        if (modelName.startsWith(this.fineTunedModel + ':')) return true;
        // Match without tag (e.g., "ctrlchecks-workflow-builder" matches "ctrlchecks-workflow-builder:latest")
        const modelBaseName = modelName.split(':')[0];
        return modelBaseName === this.fineTunedModel;
      });

      // Find the actual model name (with tag if present)
      const actualModelName = models.find(m => {
        const modelName = m.name;
        if (modelName === this.fineTunedModel) return true;
        if (modelName.startsWith(this.fineTunedModel + ':')) return true;
        const modelBaseName = modelName.split(':')[0];
        return modelBaseName === this.fineTunedModel;
      })?.name || this.fineTunedModel;

      if (modelExists) {
        this.addResult('Model Exists', 'pass', 
          `Model ${actualModelName} found on Ollama server`);
        console.log(`   ✅ Model ${actualModelName} exists\n`);
        // Update fineTunedModel to use the actual name with tag if present
        if (actualModelName !== this.fineTunedModel) {
          this.fineTunedModel = actualModelName;
        }
      } else {
        this.addResult('Model Exists', 'fail', 
          `Model ${this.fineTunedModel} not found. Run training first.`);
        console.log(`   ❌ Model ${this.fineTunedModel} not found`);
        console.log(`   💡 Available models: ${models.map(m => m.name).join(', ')}`);
        console.log(`   💡 Run: npm run train:ollama-ft\n`);
      }
    } catch (error) {
      this.addResult('Model Exists', 'fail', 
        `Error checking models: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`   ❌ Error: ${error}\n`);
    }
  }

  private async verifyModelLoading(): Promise<void> {
    console.log('🔄 Step 4: Testing model loading...');

    try {
      // Try to generate with the model (this will load it)
      const testPrompt = 'Test prompt for model loading';
      const result = await ollamaManager.generate(testPrompt, {
        model: this.fineTunedModel,
        max_tokens: 10,
      });

      if (result && result.content) {
        this.addResult('Model Loading', 'pass', 
          `Model loaded and responded successfully`);
        console.log(`   ✅ Model loaded successfully\n`);
      } else {
        this.addResult('Model Loading', 'fail', 
          `Model loaded but no response received`);
        console.log(`   ⚠️  Model loaded but no response\n`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        this.addResult('Model Loading', 'fail', 
          `Model not found. Train the model first.`);
        console.log(`   ❌ Model not found. Run training first.\n`);
      } else {
        this.addResult('Model Loading', 'fail', 
          `Error loading model: ${errorMsg}`);
        console.log(`   ❌ Error: ${errorMsg}\n`);
      }
    }
  }

  private async verifyModelInference(): Promise<void> {
    console.log('🧪 Step 5: Testing model inference...');

    try {
      const testPrompt = 'Create a workflow to send daily email reports';
      const result = await ollamaManager.generate(testPrompt, {
        model: this.fineTunedModel,
        max_tokens: 100,
        temperature: 0.7,
      });

      if (result && result.content && result.content.length > 0) {
        this.addResult('Model Inference', 'pass', 
          `Model generated response (${result.content.length} chars)`);
        console.log(`   ✅ Model inference successful`);
        console.log(`   📝 Response preview: ${result.content.substring(0, 100)}...\n`);
      } else {
        this.addResult('Model Inference', 'fail', 
          `Model inference returned empty response`);
        console.log(`   ⚠️  Empty response\n`);
      }
    } catch (error) {
      this.addResult('Model Inference', 'fail', 
        `Inference failed: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`   ❌ Inference failed: ${error}\n`);
    }
  }

  private verifyIntegrationPoints(): void {
    console.log('🔌 Step 6: Checking integration points...');

    const integrationFiles = [
      'src/services/ai/ollama-manager.ts',
      'src/services/ai/ollama-orchestrator.ts',
      'src/services/ai/workflow-analyzer.ts',
      'src/services/ai/requirements-extractor.ts',
    ];

    let allFound = true;
    for (const file of integrationFiles) {
      const filePath = path.join(__dirname, '..', file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const hasFineTunedSupport = content.includes('FINE_TUNED_MODEL') || 
                                   content.includes('USE_FINE_TUNED_MODEL') ||
                                   content.includes('fine-tuned') ||
                                   content.includes('fineTuned');
        
        if (hasFineTunedSupport) {
          this.addResult('Integration Points', 'pass', 
            `${file} has fine-tuned model support`);
        } else {
          this.addResult('Integration Points', 'warning', 
            `${file} may need fine-tuned model support`);
          allFound = false;
        }
      } else {
        this.addResult('Integration Points', 'warning', 
          `${file} not found`);
        allFound = false;
      }
    }

    if (allFound) {
      console.log(`   ✅ Integration points configured\n`);
    } else {
      console.log(`   ⚠️  Some integration points may need updates\n`);
    }
  }

  private verifyTrainingData(): void {
    console.log('📊 Step 7: Checking training data...');

    const trainingDataPath = path.join(__dirname, '..', 'data', 'training_data.jsonl');
    
    if (fs.existsSync(trainingDataPath)) {
      const content = fs.readFileSync(trainingDataPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      const exampleCount = lines.length;

      if (exampleCount > 0) {
        this.addResult('Training Data', 'pass', 
          `Training data found: ${exampleCount} examples`);
        console.log(`   ✅ Training data found: ${exampleCount} examples\n`);
      } else {
        this.addResult('Training Data', 'warning', 
          `Training data file exists but is empty`);
        console.log(`   ⚠️  Training data file is empty\n`);
      }
    } else {
      this.addResult('Training Data', 'warning', 
        `Training data not found. Run: npm run train:prepare-data`);
      console.log(`   ⚠️  Training data not found`);
      console.log(`   💡 Run: npm run train:prepare-data\n`);
    }
  }

  private addResult(step: string, status: 'pass' | 'fail' | 'warning', message: string, details?: any): void {
    this.results.push({ step, status, message, details });
  }

  private printSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Verification Summary');
    console.log('='.repeat(60) + '\n');

    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const warnings = this.results.filter(r => r.status === 'warning').length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Warnings: ${warnings}\n`);

    if (failed > 0) {
      console.log('❌ Failed Checks:');
      this.results
        .filter(r => r.status === 'fail')
        .forEach(r => console.log(`   - ${r.step}: ${r.message}`));
      console.log('');
    }

    if (warnings > 0) {
      console.log('⚠️  Warnings:');
      this.results
        .filter(r => r.status === 'warning')
        .forEach(r => console.log(`   - ${r.step}: ${r.message}`));
      console.log('');
    }

    if (failed === 0 && this.useFineTuned) {
      console.log('🎉 All checks passed! Fine-tuned model is ready to use.\n');
    } else if (failed === 0 && !this.useFineTuned) {
      console.log('✅ All checks passed! Enable fine-tuned model by setting USE_FINE_TUNED_MODEL=true\n');
    } else {
      console.log('⚠️  Some checks failed. Please fix the issues above.\n');
    }
  }
}

// Main execution
async function main() {
  const verifier = new FineTunedModelVerifier();
  
  try {
    await verifier.verify();
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { FineTunedModelVerifier };
