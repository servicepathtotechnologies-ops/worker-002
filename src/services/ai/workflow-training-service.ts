// Workflow Training Service
// Provides training examples for few-shot learning in workflow generation and execution

import * as fs from 'fs';
import * as path from 'path';
import { trainingMonitor } from './training-monitor';

export interface TrainingWorkflow {
  id: string;
  category: string;
  goal: string;
  use_case?: string; // STEP-4: Use case description
  phase1: {
    step1: { userPrompt: string };
    step2?: { clarificationQuestions?: string[]; userResponses?: Record<string, string> };
    step3: { systemPrompt: string; wordCount: number; temperature?: number };
    step4: { requirements: any };
    step5: { structure?: any; selectedNodes: string[]; nodeConfigurations?: any; connections: string[] };
    step6?: { validationChecks?: string[]; autoHealing?: any };
    step7?: { complexityScore?: number; enhancementSuggestions?: string[] };
  };
  phase2: {
    executionInitialization?: any;
    executionLoop: Array<{
      iteration: number;
      state?: string;
      availableActions?: string[];
      reasoning?: string;
      execution: string;
      stateUpdated?: string;
    }>;
    executionFinalization: { totalIterations: number; goalAchieved: boolean };
  };
  // STEP-4: Additional schema fields for pattern matching
  trigger?: {
    type: string;
    node: string;
  };
  actions?: Array<{
    step: number;
    node: string;
    purpose: string;
    input_mapping: string;
  }>;
  ai_usage?: {
    used: boolean;
    purpose?: string;
    input?: string;
    output_schema?: any;
  };
  credentials_required?: Array<{
    service: string;
    type: 'API_KEY' | 'OAuth' | 'Webhook';
  }>;
  error_handling?: string[];
  constraints?: string[];
  metadata?: {
    version: string;
    validated_on: string;
    compatible_nodes: string[];
  };
}

export interface TrainingDataset {
  version: string;
  description: string;
  totalWorkflows: number;
  workflows: TrainingWorkflow[];
  trainingMetrics?: any;
}

export class WorkflowTrainingService {
  private dataset: TrainingDataset | null = null;
  private modernExamples: TrainingWorkflow[] = [];
  private datasetPath: string;
  private modernExamplesPath: string;

  constructor() {
    // Resolve path relative to the compiled output location
    // In development: __dirname = src/services/ai
    // In production: __dirname = dist/services/ai
    // Try to load datasets in priority order:
    //   1) repo-level training/workflows/expanded-dataset.json (new canonical)
    //   2) worker/data/workflow_training_dataset_300.json
    //   3) worker/data/workflow_training_dataset_100.json
    //   4) worker/data/workflow_training_dataset.json (original)

    // 1) Repo-level expanded dataset (preferred)
    // In both dev and prod, data files are in worker/data/ (not dist/data/)
    // From src/services/ai: ../../../data/ → worker/data/
    // From dist/services/ai: ../../../data/ → worker/data/ (same)
    const basePathExpanded = path.join(__dirname, '../../../training/workflows/expanded-dataset.json');

    // 2–4) Legacy in-worker datasets
    // Paths are the same for dev and prod since data/ is at worker root level
    const basePath300 = path.join(__dirname, '../../../data/workflow_training_dataset_300.json');
    const basePath100 = path.join(__dirname, '../../../data/workflow_training_dataset_100.json');
    const basePathOriginal = path.join(__dirname, '../../../data/workflow_training_dataset.json');
    
    // Prefer expanded dataset first, then 300, 100, original
    const pathExpanded = path.resolve(basePathExpanded);
    const path300 = path.resolve(basePath300);
    const path100 = path.resolve(basePath100);
    const pathOriginal = path.resolve(basePathOriginal);
    
    if (fs.existsSync(pathExpanded)) {
      this.datasetPath = pathExpanded;
      console.log('📚 Using expanded training dataset (training/workflows/expanded-dataset.json)');
    } else if (fs.existsSync(path300)) {
      this.datasetPath = path300;
      console.log('📚 Using 300-example training dataset (best coverage)');
    } else if (fs.existsSync(path100)) {
      this.datasetPath = path100;
      console.log('📚 Using 100-example training dataset');
    } else if (fs.existsSync(pathOriginal)) {
      this.datasetPath = pathOriginal;
      console.log('📚 Using original training dataset');
    } else {
      this.datasetPath = path300; // Will show error in loadDataset
    }
    
    // Load modern workflow examples
    // Path is the same for dev and prod since data/ is at worker root level
    const basePathModern = path.join(__dirname, '../../../data/modern_workflow_examples.json');
    this.modernExamplesPath = path.resolve(basePathModern);
    
    this.loadDataset();
    this.loadModernExamples();
  }
  
  /**
   * Load modern workflow examples for real-world pattern recognition
   */
  private loadModernExamples(): void {
    try {
      if (!fs.existsSync(this.modernExamplesPath)) {
        console.log(`ℹ️  Modern workflow examples not found at: ${this.modernExamplesPath}`);
        console.log(`   This is optional - system will work without modern examples`);
        this.modernExamples = [];
        return;
      }

      const fileContent = fs.readFileSync(this.modernExamplesPath, 'utf-8');
      const modernDataset = JSON.parse(fileContent) as { workflows: TrainingWorkflow[] };
      
      if (!modernDataset.workflows || !Array.isArray(modernDataset.workflows)) {
        console.warn('⚠️  Invalid modern workflow examples format');
        this.modernExamples = [];
        return;
      }

      this.modernExamples = modernDataset.workflows;
      console.log(`✅ Loaded ${this.modernExamples.length} modern workflow examples`);
      
      // Log categories
      const categories = new Set(this.modernExamples.map(w => w.category).filter(Boolean));
      if (categories.size > 0) {
        console.log(`   Modern example categories: ${Array.from(categories).join(', ')}`);
      }
    } catch (error) {
      console.error('❌ Failed to load modern workflow examples:', error);
      this.modernExamples = [];
    }
  }
  
  /**
   * Get modern workflow examples (prioritized for real-world scenarios)
   */
  getModernExamples(limit: number = 5, userPrompt?: string): TrainingWorkflow[] {
    if (this.modernExamples.length === 0) {
      return [];
    }

    // If user prompt provided, use similarity matching
    if (userPrompt) {
      return this.getSimilarModernExamples(userPrompt, limit);
    }

    // Otherwise, return diverse examples
    return this.modernExamples.slice(0, limit);
  }
  
  /**
   * Get similar modern examples based on prompt similarity
   */
  private getSimilarModernExamples(prompt: string, limit: number): TrainingWorkflow[] {
    const promptLower = prompt.toLowerCase();
    const promptWords = promptLower.split(/\s+/).filter(w => w.length > 2);
    
    // Score examples by keyword overlap and category match
    const scored = this.modernExamples.map(example => {
      const goalLower = (example.goal || '').toLowerCase();
      const useCaseLower = (example.use_case || '').toLowerCase();
      const categoryLower = (example.category || '').toLowerCase();
      
      const combinedText = `${goalLower} ${useCaseLower} ${categoryLower}`;
      const exampleWords = combinedText.split(/\s+/).filter(w => w.length > 2);
      
      // Calculate keyword overlap
      const overlap = promptWords.filter(w => exampleWords.includes(w)).length;
      const keywordScore = overlap / Math.max(promptWords.length, 1);
      
      // Category match boost
      const categoryMatch = promptWords.some(w => categoryLower.includes(w)) ? 0.3 : 0;
      
      return {
        example,
        score: keywordScore + categoryMatch
      };
    });
    
    // Sort by score and return top matches
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .filter(item => item.score > 0.1) // Minimum relevance threshold
      .map(item => item.example);
  }
  
  /**
   * Get all workflows (merged: modern examples + training dataset)
   * Returns workflows sorted by priority (modern examples first, then training dataset with sub-priorities)
   */
  getAllWorkflows(): TrainingWorkflow[] {
    const allWorkflows: TrainingWorkflow[] = [];
    
    // Priority 1: Modern examples (highest priority - real-world scenarios)
    if (this.modernExamples.length > 0) {
      // Mark modern examples with priority metadata
      const modernWithPriority = this.modernExamples.map(w => ({
        ...w,
        _priority: 1, // Highest priority
        _source: 'modern_examples'
      }));
      allWorkflows.push(...modernWithPriority);
    }
    
    // Priority 2-4: Training dataset workflows (with sub-priorities based on category and complexity)
    if (this.dataset && this.dataset.workflows) {
      // Mark training dataset workflows with priority metadata based on category and complexity
      const trainingWithPriority = this.dataset.workflows.map(w => {
        const priority = this.calculateTrainingWorkflowPriority(w);
        return {
          ...w,
          _priority: priority,
          _source: 'training_dataset'
        };
      });
      allWorkflows.push(...trainingWithPriority);
    }
    
    // Return sorted by priority (lower number = higher priority)
    return allWorkflows.sort((a, b) => {
      const priorityA = (a as any)._priority || 5;
      const priorityB = (b as any)._priority || 5;
      return priorityA - priorityB;
    });
  }

  /**
   * Calculate priority for training dataset workflows based on category and complexity
   * Priority 2: High-value categories (CRM, AI Agent, Multi-Step, Integration)
   * Priority 3: Medium-value categories (Data Sync, Transformation, Conditional, Scheduled)
   * Priority 4: Standard categories (Notification, API Integration, Error Handling, etc.)
   */
  private calculateTrainingWorkflowPriority(workflow: TrainingWorkflow): number {
    const category = (workflow.category || '').toLowerCase();
    const complexity = (workflow.phase1?.step4?.requirements?.complexityLevel || '').toLowerCase();
    const goal = (workflow.goal || '').toLowerCase();
    
    // Priority 2: High-value categories (most commonly requested)
    const highPriorityCategories = [
      'crm', 'sales', 'ai agent', 'ai processing', 'multi-step',
      'integration', 'automation', 'customer support', 'hr', 'marketing'
    ];
    
    // Priority 3: Medium-value categories (frequently used)
    const mediumPriorityCategories = [
      'data sync', 'transformation', 'conditional', 'scheduled',
      'form processing', 'webhook', 'data processing'
    ];
    
    // Check category priority
    if (highPriorityCategories.some(cat => category.includes(cat))) {
      // Boost complex workflows within high-priority categories
      if (complexity === 'complex' || complexity === 'medium') {
        return 2; // Priority 2
      }
      return 2; // Priority 2
    }
    
    if (mediumPriorityCategories.some(cat => category.includes(cat))) {
      // Boost complex workflows within medium-priority categories
      if (complexity === 'complex') {
        return 2; // Priority 2 (complex workflows in medium categories get boost)
      }
      return 3; // Priority 3
    }
    
    // Priority 4: Standard categories (Notification, API Integration, Error Handling, etc.)
    // But boost complex workflows even in standard categories
    if (complexity === 'complex') {
      return 3; // Priority 3 (complex workflows get slight boost)
    }
    
    return 4; // Priority 4 (default for standard categories)
  }

  /**
   * Get workflows by priority level
   */
  getWorkflowsByPriority(priority: 1 | 2): TrainingWorkflow[] {
    const allWorkflows = this.getAllWorkflows();
    return allWorkflows.filter(w => (w as any)._priority === priority);
  }

  /**
   * Load training dataset from file
   */
  private loadDataset(): void {
    try {
      // Check if file exists
      if (!fs.existsSync(this.datasetPath)) {
        console.error(`❌ Training dataset file not found at: ${this.datasetPath}`);
        console.error(`   Please ensure the file exists at: CtrlChecks-worker/data/workflow_training_dataset.json`);
        this.dataset = null;
        return;
      }

      const fileContent = fs.readFileSync(this.datasetPath, 'utf-8');
      this.dataset = JSON.parse(fileContent) as TrainingDataset;
      
      // Validate dataset structure
      if (!this.dataset.workflows || !Array.isArray(this.dataset.workflows)) {
        console.error('❌ Invalid training dataset: workflows array is missing or invalid');
        this.dataset = null;
        return;
      }

      const workflowCount = this.dataset.workflows.length;
      
      // STEP-4: Validate minimum required workflows (15)
      const MINIMUM_REQUIRED_WORKFLOWS = 15;
      if (workflowCount < MINIMUM_REQUIRED_WORKFLOWS) {
        console.warn(`⚠️  Training dataset has ${workflowCount} workflows, but STEP-4 requires minimum ${MINIMUM_REQUIRED_WORKFLOWS} workflows`);
        console.warn(`   Consider adding ${MINIMUM_REQUIRED_WORKFLOWS - workflowCount} more reference workflows`);
      }
      
      // STEP-4: Validate core starter set (10 recommended workflows)
      // NOTE: This is informational only - missing workflows don't affect functionality
      // Only validate in debug mode to reduce noise
      if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
        const coreStarterSet = this.validateCoreStarterSet();
        if (!coreStarterSet.valid && coreStarterSet.missing.length > 0) {
          // Only log if many are missing (not just 1-2)
          if (coreStarterSet.missing.length > 3) {
            console.log(`ℹ️  Training dataset missing ${coreStarterSet.missing.length} recommended workflow(s) (informational only - doesn't affect functionality)`);
          }
        }
      }
      
      console.log(`✅ Loaded training dataset with ${workflowCount} workflows`);
      
      // Log categories
      const categories = new Set(this.dataset.workflows.map(w => w.category).filter(Boolean));
      if (categories.size > 0) {
        console.log(`   Categories: ${Array.from(categories).join(', ')}`);
      }
    } catch (error) {
      console.error('❌ Failed to load training dataset:', error);
      if (error instanceof SyntaxError) {
        console.error('   This appears to be a JSON syntax error. Please validate the dataset file.');
      }
      this.dataset = null;
    }
  }

  /**
   * Reload training dataset (hot reload)
   */
  reloadDataset(): { success: boolean; message: string; workflows?: number } {
    try {
      const fileContent = fs.readFileSync(this.datasetPath, 'utf-8');
      this.dataset = JSON.parse(fileContent) as TrainingDataset;
      const workflowCount = this.dataset?.workflows.length || 0;
      console.log(`✅ Reloaded training dataset with ${workflowCount} workflows`);
      return {
        success: true,
        message: `Dataset reloaded successfully`,
        workflows: workflowCount,
      };
    } catch (error) {
      console.error('❌ Failed to reload training dataset:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get similar workflows for few-shot learning based on user prompt
   * Enhanced with better similarity matching algorithm
   * STEP-4: Pattern Matching with score threshold (≥ 70)
   * Now includes modern workflow examples for better real-world pattern recognition
   */
  getSimilarWorkflows(userPrompt: string, limit: number = 3): TrainingWorkflow[] {
    // Get all workflows (modern examples + training dataset)
    const allWorkflows = this.getAllWorkflows();
    
    if (allWorkflows.length === 0) {
      return [];
    }

    const promptLower = userPrompt.toLowerCase();
    
    // Extract meaningful keywords (filter out common words)
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how']);
    const keywords = promptLower
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .map(w => w.replace(/[^\w]/g, ''));

    // Score all workflows (modern examples + training dataset)
    const scored = allWorkflows.map(workflow => {
      const workflowText = `${workflow.goal} ${workflow.phase1.step1.userPrompt} ${workflow.category}`.toLowerCase();
      let score = 0;
      const maxPossibleScore = 100; // Normalize to 0-100 scale

      // Keyword matching with weights
      keywords.forEach(keyword => {
        if (workflowText.includes(keyword)) {
          // Higher weight for exact matches in goal or prompt
          if (workflow.goal.toLowerCase().includes(keyword)) {
            score += 3;
          }
          if (workflow.phase1.step1.userPrompt.toLowerCase().includes(keyword)) {
            score += 2;
          }
          if (workflow.category && workflow.category.toLowerCase().includes(keyword)) {
            score += 4;
          }
          // General match
          if (workflowText.includes(keyword)) {
            score += 1;
          }
        }
      });

      // Category matching boost
      if (workflow.category) {
        const categoryLower = workflow.category.toLowerCase();
        if (promptLower.includes(categoryLower) || categoryLower.split(/\s+/).some(catWord => promptLower.includes(catWord))) {
          score += 5;
        }
      }

      // Platform/technology matching
      const platforms = ['slack', 'gmail', 'google', 'hubspot', 'salesforce', 'freshdesk', 'crm', 'api', 'webhook', 'email', 'calendar', 'sheets'];
      platforms.forEach(platform => {
        if (promptLower.includes(platform) && workflowText.includes(platform)) {
          score += 3;
        }
      });

      // Action verb matching
      const actionVerbs = ['build', 'create', 'generate', 'send', 'monitor', 'track', 'analyze', 'automate', 'schedule', 'notify', 'route', 'qualify', 'screen'];
      actionVerbs.forEach(verb => {
        if (promptLower.includes(verb) && workflowText.includes(verb)) {
          score += 2;
        }
      });

      // Normalize score to 0-100 scale
      // Use a simple normalization: score / maxPossibleScore * 100
      // But cap at 100
      const normalizedScore = Math.min(100, (score / 50) * 100); // Rough normalization

      return { workflow, score: normalizedScore, rawScore: score };
    });

    // STEP-4: Pattern Matching Rules - Filter by score ≥ 70
    const PATTERN_MATCH_THRESHOLD = 70;
    
    // Filter workflows with score ≥ 70 (pattern match)
    const patternMatches = scored
      .filter(item => item.score >= PATTERN_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    // If we have pattern matches (score ≥ 70), return them
    if (patternMatches.length > 0) {
      console.log(`✅ Pattern match found: ${patternMatches.length} workflow(s) with score ≥ ${PATTERN_MATCH_THRESHOLD}`);
      return patternMatches.slice(0, limit).map(item => item.workflow);
    }

    // STEP-4: Fallback Strategy - If score < 70, return hybrid approach
    // Return workflows with highest scores (even if < 70) for hybrid building
    const filtered = scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (filtered.length > 0) {
      console.log(`⚠️  No pattern match (score < ${PATTERN_MATCH_THRESHOLD}). Using hybrid approach with top ${limit} workflows.`);
      return filtered.slice(0, limit).map(item => item.workflow);
    }

    // Final fallback: return workflows with most nodes (likely more comprehensive)
    console.log('⚠️  No similarity matches. Using fallback: workflows with most nodes.');
    return allWorkflows
      .sort((a, b) => {
        const aNodes = a.phase1.step5?.selectedNodes?.length || 0;
        const bNodes = b.phase1.step5?.selectedNodes?.length || 0;
        return bNodes - aNodes;
      })
      .slice(0, limit);
  }

  /**
   * STEP-4: Pattern Matching with Score
   * Returns workflows with similarity scores
   * Now includes modern workflow examples
   */
  getSimilarWorkflowsWithScores(userPrompt: string, limit: number = 3): Array<{ workflow: TrainingWorkflow; score: number; matchType: 'pattern' | 'hybrid' | 'fallback' }> {
    // Get all workflows (modern examples + training dataset)
    const allWorkflows = this.getAllWorkflows();
    
    if (allWorkflows.length === 0) {
      return [];
    }

    const promptLower = userPrompt.toLowerCase();
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how']);
    const keywords = promptLower
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .map(w => w.replace(/[^\w]/g, ''));

    // Score all workflows (modern examples + training dataset)
    const scored = allWorkflows.map(workflow => {
      const workflowText = `${workflow.goal} ${workflow.phase1.step1.userPrompt} ${workflow.category}`.toLowerCase();
      let score = 0;

      keywords.forEach(keyword => {
        if (workflowText.includes(keyword)) {
          if (workflow.goal.toLowerCase().includes(keyword)) score += 3;
          if (workflow.phase1.step1.userPrompt.toLowerCase().includes(keyword)) score += 2;
          if (workflow.category && workflow.category.toLowerCase().includes(keyword)) score += 4;
          if (workflowText.includes(keyword)) score += 1;
        }
      });

      if (workflow.category) {
        const categoryLower = workflow.category.toLowerCase();
        if (promptLower.includes(categoryLower) || categoryLower.split(/\s+/).some(catWord => promptLower.includes(catWord))) {
          score += 5;
        }
      }

      const platforms = ['slack', 'gmail', 'google', 'hubspot', 'salesforce', 'freshdesk', 'crm', 'api', 'webhook', 'email', 'calendar', 'sheets'];
      platforms.forEach(platform => {
        if (promptLower.includes(platform) && workflowText.includes(platform)) {
          score += 3;
        }
      });

      const actionVerbs = ['build', 'create', 'generate', 'send', 'monitor', 'track', 'analyze', 'automate', 'schedule', 'notify', 'route', 'qualify', 'screen'];
      actionVerbs.forEach(verb => {
        if (promptLower.includes(verb) && workflowText.includes(verb)) {
          score += 2;
        }
      });

      const normalizedScore = Math.min(100, (score / 50) * 100);
      return { workflow, score: normalizedScore, rawScore: score };
    });

    const PATTERN_MATCH_THRESHOLD = 70;
    const patternMatches = scored
      .filter(item => item.score >= PATTERN_MATCH_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .map(item => ({ ...item, matchType: 'pattern' as const }));

    if (patternMatches.length > 0) {
      return patternMatches.slice(0, limit);
    }

    const hybridMatches = scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => ({ ...item, matchType: 'hybrid' as const }));

    if (hybridMatches.length > 0) {
      return hybridMatches.slice(0, limit);
    }

    // Final fallback: return workflows with most nodes
    return allWorkflows
      .sort((a, b) => {
        const aNodes = a.phase1.step5?.selectedNodes?.length || 0;
        const bNodes = b.phase1.step5?.selectedNodes?.length || 0;
        return bNodes - aNodes;
      })
      .slice(0, limit)
      .map(workflow => ({ workflow, score: 0, matchType: 'fallback' as const }));
  }

  /**
   * Get training examples for system prompt generation
   */
  getSystemPromptExamples(limit: number = 5): Array<{ prompt: string; systemPrompt: string; wordCount: number }> {
    if (!this.dataset || !this.dataset.workflows) {
      return [];
    }

    return this.dataset.workflows
      .filter(w => w.phase1.step3?.systemPrompt)
      .slice(0, limit)
      .map(w => ({
        prompt: w.phase1.step1.userPrompt,
        systemPrompt: w.phase1.step3.systemPrompt,
        wordCount: w.phase1.step3.wordCount || 0,
      }));
  }

  /**
   * Get training examples for requirements extraction
   */
  getRequirementsExamples(limit: number = 5): Array<{ prompt: string; requirements: any }> {
    if (!this.dataset || !this.dataset.workflows) {
      return [];
    }

    return this.dataset.workflows
      .filter(w => w.phase1.step4?.requirements)
      .slice(0, limit)
      .map(w => ({
        prompt: w.phase1.step1.userPrompt,
        requirements: w.phase1.step4.requirements,
      }));
  }

  /**
   * Get training examples for node selection
   */
  getNodeSelectionExamples(limit: number = 5, userPrompt?: string): Array<{
    goal: string;
    selectedNodes: string[];
    nodeConfigurations?: any;
    connections: string[];
  }> {
    if (!this.dataset || !this.dataset.workflows) {
      return [];
    }

    // If user prompt provided, use similarity matching to get most relevant examples
    if (userPrompt) {
      const similar = this.getSimilarWorkflows(userPrompt, limit);
      return similar
        .filter(w => w.phase1.step5?.selectedNodes && w.phase1.step5.selectedNodes.length > 0)
        .map(w => ({
          goal: w.goal,
          selectedNodes: w.phase1.step5.selectedNodes,
          nodeConfigurations: w.phase1.step5.nodeConfigurations,
          connections: w.phase1.step5.connections,
        }));
    }

    // Otherwise, return diverse examples covering different patterns
    const workflows = this.dataset.workflows
      .filter(w => w.phase1.step5?.selectedNodes && w.phase1.step5.selectedNodes.length > 0);
    
    // Select diverse examples: simple, medium, complex
    const simple = workflows.filter(w => (w.phase1.step5?.selectedNodes?.length || 0) <= 3);
    const medium = workflows.filter(w => {
      const len = w.phase1.step5?.selectedNodes?.length || 0;
      return len > 3 && len <= 5;
    });
    const complex = workflows.filter(w => (w.phase1.step5?.selectedNodes?.length || 0) > 5);
    
    const selected: TrainingWorkflow[] = [];
    const perType = Math.ceil(limit / 3);
    selected.push(...simple.slice(0, perType));
    selected.push(...medium.slice(0, perType));
    selected.push(...complex.slice(0, perType));
    
    return selected.slice(0, limit).map(w => ({
      goal: w.goal,
      selectedNodes: w.phase1.step5!.selectedNodes,
      nodeConfigurations: w.phase1.step5!.nodeConfigurations,
      connections: w.phase1.step5!.connections,
    }));
  }

  /**
   * Get clarification question examples for few-shot learning
   */
  getClarificationQuestionExamples(userPrompt: string, limit: number = 3): Array<{
    userPrompt: string;
    questions: Array<{ text: string; category: string; options?: string[] }>;
  }> {
    if (!this.dataset || !this.dataset.workflows) {
      return [];
    }

    // Get similar workflows based on user prompt
    const similar = this.getSimilarWorkflows(userPrompt, limit * 2);
    
    return similar
      .filter(w => w.phase1.step2?.clarificationQuestions && w.phase1.step2.clarificationQuestions.length > 0)
      .slice(0, limit)
      .map(w => ({
        userPrompt: w.phase1.step1.userPrompt,
        questions: (w.phase1.step2?.clarificationQuestions || []).map((q: string, idx: number) => {
          // Try to extract category and options from question structure
          const categoryMatch = q.match(/\(([^)]+)\)/);
          const category = categoryMatch ? categoryMatch[1].split(',').map(c => c.trim())[0] : 'other';
          
          // Extract options if they exist in parentheses
          const optionsMatch = q.match(/\(([^)]+)\)/);
          const options = optionsMatch ? optionsMatch[1].split(',').map(o => o.trim()) : undefined;
          
          // Clean question text
          const text = q.replace(/\s*\([^)]+\)\s*$/, '').trim();
          
          return {
            text,
            category,
            options,
          };
        }),
      }));
  }

  /**
   * Get training examples for execution reasoning
   */
  getExecutionExamples(limit: number = 3): Array<{
    goal: string;
    executionLoop: Array<{
      iteration: number;
      state?: string;
      availableActions?: string[];
      reasoning?: string;
      execution: string;
    }>;
    totalIterations: number;
    goalAchieved: boolean;
  }> {
    if (!this.dataset || !this.dataset.workflows) {
      return [];
    }

    return this.dataset.workflows
      .filter(w => w.phase2?.executionLoop && w.phase2.executionLoop.length > 0)
      .slice(0, limit)
      .map(w => ({
        goal: w.goal,
        executionLoop: w.phase2.executionLoop,
        totalIterations: w.phase2.executionFinalization.totalIterations,
        goalAchieved: w.phase2.executionFinalization.goalAchieved,
      }));
  }

  /**
   * Build few-shot prompt for system prompt generation
   */
  buildSystemPromptFewShotPrompt(userPrompt: string): string {
    // Check if dataset is loaded
    if (!this.isLoaded()) {
      console.warn('⚠️  Training dataset not loaded, skipping few-shot examples');
      trainingMonitor.recordUsage('systemPrompt', userPrompt, 0, false);
      return '';
    }

    try {
      const examples = this.getSystemPromptExamples(5);
      
      if (examples.length === 0) {
        trainingMonitor.recordUsage('systemPrompt', userPrompt, 0, false);
        return '';
      }

      let prompt = 'Here are examples of how to generate concise system prompts (20-30 words) from user prompts:\n\n';
      
      examples.forEach((example, idx) => {
        prompt += `Example ${idx + 1}:\n`;
        prompt += `User Prompt: "${example.prompt}"\n`;
        prompt += `System Prompt: "${example.systemPrompt}" (${example.wordCount} words)\n\n`;
      });

      prompt += `Now generate a system prompt for this user prompt:\n`;
      prompt += `User Prompt: "${userPrompt}"\n`;
      prompt += `System Prompt:`;

      trainingMonitor.recordUsage('systemPrompt', userPrompt, examples.length, true);
      return prompt;
    } catch (error) {
      console.error('Error building system prompt few-shot prompt:', error);
      trainingMonitor.recordUsage('systemPrompt', userPrompt, 0, false);
      return '';
    }
  }

  /**
   * Build few-shot prompt for requirements extraction
   */
  buildRequirementsFewShotPrompt(userPrompt: string, systemPrompt: string): string {
    // Check if dataset is loaded
    if (!this.isLoaded()) {
      console.warn('⚠️  Training dataset not loaded, skipping few-shot examples');
      trainingMonitor.recordUsage('requirements', userPrompt, 0, false);
      return '';
    }

    try {
      const examples = this.getRequirementsExamples(5);
      
      if (examples.length === 0) {
        trainingMonitor.recordUsage('requirements', userPrompt, 0, false);
        return '';
      }

      let prompt = 'Here are examples of how to extract structured requirements from user prompts:\n\n';
      
      examples.forEach((example, idx) => {
        prompt += `Example ${idx + 1}:\n`;
        prompt += `User Prompt: "${example.prompt}"\n`;
        prompt += `Requirements: ${JSON.stringify(example.requirements, null, 2)}\n\n`;
      });

      prompt += `Now extract requirements for this user prompt:\n`;
      prompt += `User Prompt: "${userPrompt}"\n`;
      prompt += `System Prompt: "${systemPrompt}"\n`;
      prompt += `Requirements (JSON):`;

      trainingMonitor.recordUsage('requirements', userPrompt, examples.length, true);
      return prompt;
    } catch (error) {
      console.error('Error building requirements few-shot prompt:', error);
      trainingMonitor.recordUsage('requirements', userPrompt, 0, false);
      return '';
    }
  }

  /**
   * Build few-shot prompt for node selection
   */
  buildNodeSelectionFewShotPrompt(requirements: any, availableNodes: string[]): string {
    const userPrompt = requirements.primaryGoal || '';
    const examples = this.getNodeSelectionExamples(5, userPrompt);
    
    if (examples.length === 0) {
      return '';
    }

    let prompt = 'Here are examples of how to select appropriate nodes for workflows:\n\n';
    
    examples.forEach((example, idx) => {
      prompt += `Example ${idx + 1}:\n`;
      prompt += `Goal: "${example.goal}"\n`;
      prompt += `Selected Nodes: ${example.selectedNodes.join(', ')}\n`;
      if (example.connections && example.connections.length > 0) {
        prompt += `Connections: ${example.connections.slice(0, 3).join('; ')}...\n`;
      }
      prompt += `\n`;
    });

    prompt += `Now select nodes for this workflow:\n`;
    prompt += `Requirements: ${JSON.stringify(requirements, null, 2)}\n`;
    prompt += `Available Nodes: ${availableNodes.slice(0, 20).join(', ')}...\n`;
    prompt += `Selected Nodes:`;

    return prompt;
  }

  /**
   * Build few-shot prompt for execution reasoning
   */
  buildExecutionReasoningFewShotPrompt(goal: string, currentState: any, availableActions: any[]): string {
    // Check if dataset is loaded
    if (!this.isLoaded()) {
      console.warn('⚠️  Training dataset not loaded, skipping few-shot examples');
      trainingMonitor.recordUsage('execution', goal, 0, false);
      return '';
    }

    try {
      const examples = this.getExecutionExamples(2);
      
      if (examples.length === 0) {
        trainingMonitor.recordUsage('execution', goal, 0, false);
        return '';
      }

      let prompt = 'Here are examples of how to reason about workflow execution:\n\n';
      
      examples.forEach((example, idx) => {
        prompt += `Example ${idx + 1}:\n`;
        prompt += `Goal: "${example.goal}"\n`;
        prompt += `Execution Steps:\n`;
        example.executionLoop.slice(0, 3).forEach(step => {
          prompt += `  Iteration ${step.iteration}: ${step.state || 'N/A'} → ${step.execution}`;
          if (step.reasoning) {
            prompt += ` (Reasoning: ${step.reasoning})`;
          }
          prompt += `\n`;
        });
        prompt += `Result: Goal achieved in ${example.totalIterations} iterations\n\n`;
      });

      prompt += `Now reason about this execution:\n`;
      prompt += `Goal: "${goal}"\n`;
      prompt += `Current State: ${JSON.stringify(currentState, null, 2)}\n`;
      prompt += `Available Actions: ${availableActions.map(a => a.name).join(', ')}\n`;
      prompt += `Reasoning:`;

      trainingMonitor.recordUsage('execution', goal, examples.length, true);
      return prompt;
    } catch (error) {
      console.error('Error building execution reasoning few-shot prompt:', error);
      trainingMonitor.recordUsage('execution', goal, 0, false);
      return '';
    }
  }

  /**
   * Get workflow by category
   */
  getWorkflowsByCategory(category: string): TrainingWorkflow[] {
    if (!this.dataset || !this.dataset.workflows) {
      return [];
    }

    return this.dataset.workflows.filter(w => 
      w.category.toLowerCase() === category.toLowerCase()
    );
  }

  /**
   * Get all categories
   */
  getAllCategories(): string[] {
    if (!this.dataset || !this.dataset.workflows) {
      return [];
    }

    const categories = new Set<string>();
    this.dataset.workflows.forEach(w => {
      if (w.category) {
        categories.add(w.category);
      }
    });

    return Array.from(categories);
  }

  /**
   * Get training statistics
   */
  getTrainingStats(): any {
    if (!this.dataset) {
      return null;
    }

    // Calculate additional statistics
    const nodeUsage = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    let totalNodes = 0;
    let totalIterations = 0;

    this.dataset.workflows.forEach(workflow => {
      // Count nodes
      if (workflow.phase1.step5?.selectedNodes) {
        workflow.phase1.step5.selectedNodes.forEach(node => {
          nodeUsage.set(node, (nodeUsage.get(node) || 0) + 1);
          totalNodes++;
        });
      }

      // Count categories
      if (workflow.category) {
        categoryCounts.set(workflow.category, (categoryCounts.get(workflow.category) || 0) + 1);
      }

      // Count iterations
      if (workflow.phase2?.executionFinalization?.totalIterations) {
        totalIterations += workflow.phase2.executionFinalization.totalIterations;
      }
    });

    // Get top nodes
    const topNodes = Array.from(nodeUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([node, count]) => ({ node, count }));

    return {
      totalWorkflows: this.dataset.totalWorkflows,
      categories: this.getAllCategories(),
      categoryCounts: Object.fromEntries(categoryCounts),
      metrics: this.dataset.trainingMetrics,
      statistics: {
        totalNodes,
        averageNodesPerWorkflow: totalNodes / this.dataset.totalWorkflows,
        totalIterations,
        averageIterationsPerWorkflow: totalIterations / this.dataset.totalWorkflows,
        uniqueNodes: nodeUsage.size,
        topNodes,
      },
    };
  }

  /**
   * Check if training dataset is loaded
   */
  isLoaded(): boolean {
    return this.dataset !== null && this.dataset.workflows !== undefined;
  }

  /**
   * Get workflow by ID
   */
  getWorkflowById(id: string): TrainingWorkflow | null {
    if (!this.dataset || !this.dataset.workflows) {
      return null;
    }

    return this.dataset.workflows.find(w => w.id === id) || null;
  }

  /**
   * Get all workflow IDs
   */
  getAllWorkflowIds(): string[] {
    if (!this.dataset || !this.dataset.workflows) {
      return [];
    }

    return this.dataset.workflows.map(w => w.id);
  }

  /**
   * STEP-4: Pattern Adaptation Rules
   * Determines what can and cannot be modified when adapting a pattern
   */
  getPatternAdaptationRules(): {
    canModify: string[];
    mustNotModify: string[];
  } {
    return {
      canModify: [
        'App names (Slack → Discord, Gmail → Outlook)',
        'Field mappings (different field names)',
        'Conditions (different thresholds, filters)',
        'Output destinations (Slack → Email → Webhook)',
        'Node configurations (different settings)',
      ],
      mustNotModify: [
        'Core trigger logic (trigger type and behavior)',
        'Authentication flow (OAuth, API key structure)',
        'Error handling structure (error paths, retry logic)',
        'Data flow architecture (input → processing → output)',
        'Node sequence (order of operations)',
      ],
    };
  }

  /**
   * STEP-4: Adapt a reference workflow pattern to new requirements
   */
  adaptPattern(
    referenceWorkflow: TrainingWorkflow,
    newRequirements: {
      appNames?: Record<string, string>;
      fieldMappings?: Record<string, string>;
      conditions?: Record<string, any>;
      outputDestination?: string;
    }
  ): {
    adapted: boolean;
    modifications: string[];
    errors: string[];
  } {
    const modifications: string[] = [];
    const errors: string[] = [];

    if (newRequirements.appNames) {
      modifications.push(`App names: ${JSON.stringify(newRequirements.appNames)}`);
    }

    if (newRequirements.fieldMappings) {
      modifications.push(`Field mappings: ${JSON.stringify(newRequirements.fieldMappings)}`);
    }

    if (newRequirements.conditions) {
      modifications.push(`Conditions: ${JSON.stringify(newRequirements.conditions)}`);
    }

    if (newRequirements.outputDestination) {
      modifications.push(`Output destination: ${newRequirements.outputDestination}`);
    }

    return {
      adapted: errors.length === 0,
      modifications,
      errors,
    };
  }

  /**
   * STEP-4: Validate Core Starter Set (10 recommended workflows)
   */
  validateCoreStarterSet(): {
    valid: boolean;
    missing: string[];
  } {
    if (!this.dataset || !this.dataset.workflows) {
      return { valid: false, missing: ['All core workflows'] };
    }

    const coreWorkflows = [
      { name: 'Gmail → AI Summary → Slack', keywords: ['gmail', 'slack', 'summary', 'ai'] },
      { name: 'Webhook → Validate → Database Insert', keywords: ['webhook', 'validate', 'database'] },
      { name: 'Cron → Fetch API → Google Sheets', keywords: ['cron', 'schedule', 'api', 'sheets'] },
      { name: 'Form Submission → Email Notification', keywords: ['form', 'email', 'notification'] },
      { name: 'New CRM Lead → Slack + Email Alert', keywords: ['crm', 'lead', 'slack', 'email'] },
      { name: 'New File in Drive → Rename → Move Folder', keywords: ['drive', 'file', 'rename', 'move'] },
      { name: 'Error Monitoring → Alert Channel', keywords: ['error', 'monitor', 'alert'] },
      { name: 'AI Classification → Route Data', keywords: ['ai', 'classification', 'route'] },
      { name: 'User Signup → Welcome Email', keywords: ['signup', 'welcome', 'email'] },
      { name: 'Payment Received → Invoice Email', keywords: ['payment', 'invoice', 'email'] },
    ];

    const missing: string[] = [];
    const workflowTexts = this.dataset.workflows.map(w => 
      `${w.goal} ${w.phase1.step1.userPrompt} ${w.category}`.toLowerCase()
    );

    coreWorkflows.forEach(core => {
      const hasMatch = workflowTexts.some(text => 
        core.keywords.some(keyword => text.includes(keyword.toLowerCase()))
      );
      if (!hasMatch) {
        missing.push(core.name);
      }
    });

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * STEP-4: Check if workflow is a candidate for reference (fallback strategy)
   */
  isCandidateReference(workflow: any): {
    isCandidate: boolean;
    reason: string;
    requirements: string[];
  } {
    const requirements: string[] = [];

    if (!workflow.nodes || workflow.nodes.length === 0) {
      return {
        isCandidate: false,
        reason: 'Workflow has no nodes',
        requirements: ['Must have at least one node'],
      };
    }

    if (!workflow.edges || workflow.edges.length === 0) {
      return {
        isCandidate: false,
        reason: 'Workflow has no connections',
        requirements: ['Must have at least one edge/connection'],
      };
    }

    const hasTrigger = workflow.nodes.some((n: any) => 
      (n.data?.type || n.type)?.includes('trigger')
    );
    if (!hasTrigger) {
      requirements.push('Must have a trigger node');
    }

    return {
      isCandidate: hasTrigger && workflow.nodes.length >= 2,
      reason: hasTrigger 
        ? 'Workflow has valid structure' 
        : 'Workflow missing trigger node',
      requirements: requirements.length > 0 ? requirements : ['Workflow structure is valid'],
    };
  }

  /**
   * STEP-4: Get training categories (mandatory categories from STEP-4)
   */
  getMandatoryCategories(): string[] {
    return [
      'Email Automation',
      'Messaging & Notifications',
      'CRM & Sales',
      'Forms & Webhooks',
      'Data Sync & ETL',
      'AI-Powered Automation',
      'Scheduling & Cron',
      'Social Media',
      'File & Storage',
      'Monitoring & Alerts',
    ];
  }

  /**
   * STEP-4: Validate training dataset has all mandatory categories
   */
  validateMandatoryCategories(): {
    valid: boolean;
    missing: string[];
    present: string[];
  } {
    if (!this.dataset || !this.dataset.workflows) {
      return {
        valid: false,
        missing: this.getMandatoryCategories(),
        present: [],
      };
    }

    const mandatory = this.getMandatoryCategories();
    const present = new Set(
      this.dataset.workflows
        .map(w => w.category)
        .filter(Boolean)
        .map(c => c.toLowerCase())
    );

    const missing = mandatory.filter(cat => 
      !Array.from(present).some(p => 
        p.includes(cat.toLowerCase()) || cat.toLowerCase().includes(p)
      )
    );

    return {
      valid: missing.length === 0,
      missing,
      present: Array.from(present),
    };
  }
}

// Export singleton instance
export const workflowTrainingService = new WorkflowTrainingService();

