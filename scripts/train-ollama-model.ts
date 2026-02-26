/**
 * Fine-Tune Ollama Model for Workflow Generation
 * 
 * This script trains an Ollama model on workflow patterns so it "remembers"
 * them without needing to search the dataset every time.
 * 
 * Benefits:
 * - Fast inference (no dataset search)
 * - Scales infinitely (no 1M+ record search delays)
 * - Model "knows" patterns from training
 * 
 * Usage:
 *   npm run train:ollama                    # Full training pipeline
 *   npm run train:prepare-data              # Prepare data only
 *   ts-node scripts/train-ollama-model.ts --method=ollama-ft  # Use ollama-ft
 *   ts-node scripts/train-ollama-model.ts --method=modelfile  # Use Modelfile only
 */

// Load environment variables FIRST, before any other imports
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

// Now import modules that depend on environment variables
import * as fs from 'fs';
import { execSync } from 'child_process';
import axios from 'axios';
import { config } from '../src/core/config';

interface TrainingExample {
  userPrompt: string;
  systemPrompt: string;
  nodes: string[];
  connections: string[];
  requirements: any;
}

class OllamaModelTrainer {
  private ollamaUrl: string;
  private baseModel = process.env.BASE_MODEL || 'qwen2.5:14b-instruct-q4_K_M';
  private fineTunedModel = process.env.FINE_TUNED_MODEL || 'ctrlchecks-workflow-builder';
  private trainingMethod: 'modelfile' | 'ollama-ft' | 'unsloth' = 'modelfile';

  constructor() {
    // Use config to get Ollama URL (loads from .env via dotenv)
    this.ollamaUrl = process.env.OLLAMA_URL || process.env.OLLAMA_BASE_URL || config.ollamaHost || 'http://localhost:11434';
  }

  /**
   * Convert dataset to training format (JSONL)
   */
  convertDatasetToTrainingFormat(datasetPath: string): string {
    console.log('📊 Converting dataset to training format...');
    
    if (!fs.existsSync(datasetPath)) {
      throw new Error(`Dataset file not found: ${datasetPath}`);
    }

    const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
    const trainingExamples: any[] = [];

    console.log(`   Found ${dataset.workflows?.length || 0} workflows in dataset`);

    for (const workflow of dataset.workflows || []) {
      try {
        const userPrompt = workflow.phase1?.step1?.userPrompt || workflow.goal || '';
        const systemPrompt = workflow.phase1?.step3?.systemPrompt || '';
        const nodes = workflow.phase1?.step5?.selectedNodes || [];
        const connections = workflow.phase1?.step5?.connections || [];
        const requirements = workflow.phase1?.step4?.requirements || {};

        if (!userPrompt || nodes.length === 0) {
          console.warn(`   ⚠️  Skipping workflow ${workflow.id}: missing required fields`);
          continue;
        }

        const example = {
          messages: [
            {
              role: 'system',
              content: `You are an expert workflow builder. Generate workflows in JSON format based on user requests.

You understand:
- Workflow patterns and structures
- Node types and their purposes
- How to connect nodes logically
- Requirements extraction
- System prompt generation

Always respond with valid JSON containing:
- systemPrompt: 20-30 word summary
- nodes: array of node types
- connections: array of connection strings (format: "source→target")
- requirements: object with platforms, credentials, complexity, etc.`
            },
            {
              role: 'user',
              content: userPrompt
            },
            {
              role: 'assistant',
              content: JSON.stringify({
                systemPrompt: systemPrompt || `Build automated workflow to ${userPrompt.substring(0, 50)}`,
                nodes: nodes,
                connections: connections,
                requirements: requirements
              }, null, 2)
            }
          ]
        };
        
        trainingExamples.push(example);
      } catch (error) {
        console.warn(`   ⚠️  Error processing workflow ${workflow.id}:`, error);
      }
    }

    // Save as JSONL (one JSON object per line)
    const outputDir = path.join(__dirname, '../data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const jsonlPath = path.join(outputDir, 'training_data.jsonl');
    const jsonlContent = trainingExamples
      .map(ex => JSON.stringify(ex))
      .join('\n');
    
    fs.writeFileSync(jsonlPath, jsonlContent, 'utf-8');
    console.log(`✅ Converted ${trainingExamples.length} examples to ${jsonlPath}`);
    
    return jsonlPath;
  }

  /**
   * Create Modelfile for Ollama
   */
  createModelfile(): string {
    const modelfile = `FROM ${this.baseModel}

# System prompt
SYSTEM """You are an expert workflow builder. Generate workflows in JSON format based on user requests.

You understand:
- Workflow patterns and structures
- Node types and their purposes
- How to connect nodes logically
- Requirements extraction
- System prompt generation

Always respond with valid JSON containing:
- systemPrompt: 20-30 word summary
- nodes: array of node types
- connections: array of connection strings (format: "source→target")
- requirements: object with platforms, credentials, complexity, etc.
"""

# Template for conversation
TEMPLATE """{{ .System }}

User: {{ .Prompt }}

Assistant: {{ .Response }}"""

# Parameters
PARAMETER temperature 0.2
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER num_ctx 4096
PARAMETER num_predict 2048
`;

    const modelfilePath = path.join(__dirname, '../data/Modelfile');
    fs.writeFileSync(modelfilePath, modelfile, 'utf-8');
    console.log(`✅ Created Modelfile at ${modelfilePath}`);
    
    return modelfilePath;
  }

  /**
   * Create model using Modelfile (basic fine-tuning)
   * Uses Ollama CLI if available, otherwise falls back to API (if supported)
   * @returns true if model was created, false if manual steps are needed
   */
  async createModel(): Promise<boolean> {
    console.log('🚀 Creating fine-tuned model...');
    console.log(`   Base model: ${this.baseModel}`);
    console.log(`   Target model: ${this.fineTunedModel}`);

    try {
      const modelfilePath = this.createModelfile();
      const modelfileContent = fs.readFileSync(modelfilePath, 'utf-8');

      // Check if we're using a remote proxy (doesn't support /api/create)
      const isRemoteProxy = this.ollamaUrl.includes('ollama.ctrlchecks.ai') || 
                           this.ollamaUrl.includes(':8000');
      
      // Try using Ollama CLI first (works for both local and remote)
      let useCli = false;
      try {
        execSync('ollama --version', { stdio: 'ignore' });
        useCli = true;
      } catch (error) {
        // CLI not available, will try API
      }

      if (useCli) {
        console.log('   Using Ollama CLI to create model (this may take a few minutes)...');
        console.log(`   Command: ollama create ${this.fineTunedModel} -f ${modelfilePath}`);
        
        try {
          // Extract hostname:port from URL for OLLAMA_BASE_URL env var
          let ollamaHostEnv: string | undefined;
          if (isRemoteProxy) {
            try {
              const url = new URL(this.ollamaUrl);
              ollamaHostEnv = url.hostname + (url.port ? `:${url.port}` : '');
            } catch {
              ollamaHostEnv = this.ollamaUrl.replace(/^https?:\/\//, '');
            }
          }
          
          const env = { ...process.env };
          if (ollamaHostEnv) {
            env.OLLAMA_BASE_URL = ollamaHostEnv;
            console.log(`   Using OLLAMA_BASE_URL=${ollamaHostEnv}`);
          }
          
          execSync(`ollama create ${this.fineTunedModel} -f ${modelfilePath}`, {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..'),
            env
          });
          
          console.log('✅ Model created successfully!');
          console.log(`   Model name: ${this.fineTunedModel}`);
          console.log(`   You can now use this model in ollama-orchestrator.ts`);
          return true;
        } catch (cliError: any) {
          console.warn('⚠️  Ollama CLI failed:', cliError.message);
          if (isRemoteProxy) {
            console.warn('   Remote proxy may not support model creation via CLI either.');
            console.warn('   You may need to create the model directly on the server.');
          }
          // Fall through to API method or graceful exit
        }
      }

      // Fallback to API method (only works for direct Ollama servers, not proxies)
      if (isRemoteProxy) {
        console.log('\n⚠️  Cannot create model automatically on remote proxy endpoint.');
        console.log('   The remote endpoint does not support model creation via API/CLI.');
        console.log('\n✅ Modelfile prepared successfully!');
        console.log('\n📝 To create the model, you have two options:');
        console.log('   1. Use Ollama CLI on the server where Ollama is running:');
        console.log(`      ollama create ${this.fineTunedModel} -f ${modelfilePath}`);
        console.log('   2. Or use a local Ollama instance:');
        console.log('      Set OLLAMA_BASE_URL=http://localhost:11434 and run this script again');
        console.log('\n💡 The Modelfile has been created at:');
        console.log(`   ${modelfilePath}`);
        console.log('\n📋 After creating the model on the server, you can:');
        console.log('   1. Update worker/env with:');
        console.log(`      FINE_TUNED_MODEL=${this.fineTunedModel}`);
        console.log('      USE_FINE_TUNED_MODEL=true');
        console.log('   2. Restart your worker service');
        return false; // Model not created, but Modelfile is ready
      }

      console.log('   Creating model via API (this may take a few minutes)...');
      
      const response = await axios.post(
        `${this.ollamaUrl}/api/create`,
        {
          name: this.fineTunedModel,
          modelfile: modelfileContent,
          stream: false
        },
        {
          timeout: 300000 // 5 minutes timeout
        }
      );

      console.log('✅ Model created successfully!');
      console.log(`   Model name: ${this.fineTunedModel}`);
      console.log(`   You can now use this model in ollama-orchestrator.ts`);
      return true;
      
    } catch (error: any) {
      if (error.response) {
        console.error('❌ Ollama API error:', error.response.data);
        if (error.response.status === 404) {
          console.error('   The /api/create endpoint is not available on this server.');
          console.error('   This usually means you\'re using a proxy that doesn\'t support model creation.');
          console.log('\n💡 Solution: Use Ollama CLI instead:');
          console.log(`   ollama create ${this.fineTunedModel} -f ${path.join(__dirname, '../data/Modelfile')}`);
          return false;
        }
      }
      // For other errors, still throw to maintain existing behavior
      throw error;
    }
  }

  /**
   * Verify model exists
   */
  async verifyModel(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.ollamaUrl}/api/tags`);
      const models = response.data.models || [];
      const modelExists = models.some((m: any) => m.name === this.fineTunedModel);
      
      if (modelExists) {
        console.log(`✅ Model ${this.fineTunedModel} exists`);
        return true;
      } else {
        console.log(`❌ Model ${this.fineTunedModel} not found`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error verifying model:', error);
      return false;
    }
  }

  /**
   * Incremental training (adds to existing model)
   */
  async incrementalTrain(
    newExamples: any[],
    batchId?: string
  ): Promise<void> {
    console.log(`🔄 Starting incremental training with ${newExamples.length} new examples...`);

    try {
      // Load existing training data (if any)
      const existingDataPath = path.join(__dirname, '../data/training_data.jsonl');
      let existingData: any[] = [];

      if (fs.existsSync(existingDataPath)) {
        const existingContent = fs.readFileSync(existingDataPath, 'utf-8');
        existingData = existingContent
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
        console.log(`   Loaded ${existingData.length} existing examples`);
      }

      // Merge with new examples
      const combinedData = [...existingData, ...newExamples];
      console.log(`   Total examples: ${combinedData.length}`);

      // Save combined data
      const jsonlContent = combinedData
        .map(ex => JSON.stringify(ex))
        .join('\n');
      fs.writeFileSync(existingDataPath, jsonlContent, 'utf-8');

      // Fine-tune on combined dataset
      const modelCreated = await this.createModel();
      
      if (modelCreated) {
        console.log(`✅ Incremental training complete!`);
        if (batchId) {
          console.log(`   Batch ID: ${batchId}`);
        }
      } else {
        console.log(`✅ Training data updated!`);
        console.log(`   Modelfile ready for manual model creation on server.`);
        if (batchId) {
          console.log(`   Batch ID: ${batchId}`);
        }
      }
    } catch (error: any) {
      console.error('❌ Incremental training failed:', error.message);
      throw error;
    }
  }

  /**
   * Train using ollama-ft (recommended for actual fine-tuning)
   * Falls back to modelfile method if ollama-ft is not available
   */
  async trainWithOllamaFt(trainingDataPath: string): Promise<void> {
    console.log('🚀 Starting fine-tuning with ollama-ft...');
    console.log(`   Base model: ${this.baseModel}`);
    console.log(`   Output model: ${this.fineTunedModel}`);
    console.log(`   Training data: ${trainingDataPath}\n`);

    // Check if ollama-ft is installed
    let ollamaFtAvailable = false;
    try {
      execSync('ollama-ft --version', { stdio: 'ignore' });
      ollamaFtAvailable = true;
    } catch (error) {
      console.warn('⚠️  ollama-ft is not installed!');
      console.log('   Falling back to Modelfile method (basic fine-tuning)...\n');
      ollamaFtAvailable = false;
    }

    // If ollama-ft is not available, fall back to modelfile method
    if (!ollamaFtAvailable) {
      console.log('📝 Using Modelfile method instead...');
      const modelCreated = await this.createModel();
      if (modelCreated) {
        await this.verifyModel();
      }
      return;
    }

    // Build ollama-ft command
    const epochs = process.env.EPOCHS || '3';
    const learningRate = process.env.LEARNING_RATE || '2e-5';
    const batchSize = process.env.BATCH_SIZE || '4';

    const command = [
      'ollama-ft',
      'train',
      '--base-model', this.baseModel,
      '--output-model', this.fineTunedModel,
      '--data', trainingDataPath,
      '--epochs', epochs,
      '--learning-rate', learningRate,
      '--batch-size', batchSize,
    ].join(' ');

    console.log(`📝 Running: ${command}\n`);

    try {
      // Execute ollama-ft training
      execSync(command, { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
      });

      console.log('\n✅ Fine-tuning complete!');
      await this.verifyModel();
    } catch (error: any) {
      console.error('\n❌ Fine-tuning failed:', error.message);
      throw error;
    }
  }

  /**
   * Full training pipeline
   */
  async train(method?: 'modelfile' | 'ollama-ft' | 'unsloth'): Promise<void> {
    if (method) {
      this.trainingMethod = method;
    }

    console.log('🎓 Starting Ollama Model Training Pipeline\n');
    console.log(`   Method: ${this.trainingMethod}`);
    console.log(`   Base model: ${this.baseModel}`);
    console.log(`   Fine-tuned model: ${this.fineTunedModel}\n`);

    // Step 1: Convert dataset
    const datasetPath = path.join(__dirname, '../data/workflow_training_dataset_100.json');
    if (!fs.existsSync(datasetPath)) {
      console.warn(`⚠️  Dataset not found: ${datasetPath}`);
      console.log('   Using alternative dataset path...');
      const altPath = path.join(__dirname, '../data/workflow_training_dataset.json');
      if (fs.existsSync(altPath)) {
        const trainingDataPath = this.convertDatasetToTrainingFormat(altPath);
        await this.proceedWithTraining(trainingDataPath);
        return;
      }
      throw new Error(`Dataset not found. Expected: ${datasetPath}`);
    }

    const trainingDataPath = this.convertDatasetToTrainingFormat(datasetPath);
    await this.proceedWithTraining(trainingDataPath);
  }

  /**
   * Proceed with training based on selected method
   */
  private async proceedWithTraining(trainingDataPath: string): Promise<void> {
    if (this.trainingMethod === 'ollama-ft') {
      await this.trainWithOllamaFt(trainingDataPath);
    } else if (this.trainingMethod === 'unsloth') {
      console.log('📝 For Unsloth training, use:');
      console.log('   python worker/scripts/train-with-unsloth.py');
      console.log('\n   Or set environment variables:');
      console.log('   BASE_MODEL=unsloth/llama-3.2-3b-Instruct');
      console.log('   TRAINING_DATA_PATH=worker/data/training_data.jsonl');
      return;
    } else {
      // Default: Modelfile method
      const modelCreated = await this.createModel();
      if (modelCreated) {
        await this.verifyModel();
        console.log('\n✅ Training pipeline complete!');
        console.log('\n📝 Next steps:');
        console.log('   1. Update worker/env with:');
        console.log(`      FINE_TUNED_MODEL=${this.fineTunedModel}`);
        console.log('      USE_FINE_TUNED_MODEL=true');
        console.log('   2. Update ollama-orchestrator.ts to use fine-tuned model');
        console.log('   3. Test the fine-tuned model with a sample prompt');
        console.log(`   4. Test: ollama run ${this.fineTunedModel} "Your test prompt"`);
      } else {
        console.log('\n✅ Modelfile preparation complete!');
        console.log('\n📝 Next steps:');
        console.log('   1. Create the model on your Ollama server (see instructions above)');
        console.log('   2. After model is created, update worker/env with:');
        console.log(`      FINE_TUNED_MODEL=${this.fineTunedModel}`);
        console.log('      USE_FINE_TUNED_MODEL=true');
        console.log('   3. Restart your worker service');
      }
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const prepareOnly = args.includes('--prepare-only');
  const methodArg = args.find(arg => arg.startsWith('--method='));
  const method = methodArg ? methodArg.split('=')[1] as 'modelfile' | 'ollama-ft' | 'unsloth' : undefined;

  const trainer = new OllamaModelTrainer();
  
  try {
    if (prepareOnly) {
      // Only prepare data
      const datasetPath = path.join(__dirname, '../data/workflow_training_dataset_100.json');
      if (!fs.existsSync(datasetPath)) {
        const altPath = path.join(__dirname, '../data/workflow_training_dataset.json');
        if (fs.existsSync(altPath)) {
          trainer.convertDatasetToTrainingFormat(altPath);
          return;
        }
        throw new Error(`Dataset not found: ${datasetPath}`);
      }
      trainer.convertDatasetToTrainingFormat(datasetPath);
      console.log('\n✅ Data preparation complete!');
      console.log('   Run: npm run train:ollama to start training');
    } else {
      await trainer.train(method);
    }
  } catch (error) {
    console.error('\n❌ Training failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { OllamaModelTrainer };
