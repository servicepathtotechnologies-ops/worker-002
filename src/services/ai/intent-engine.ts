/**
 * Layer 1: Intent Understanding Engine
 * 
 * Semantic decoder that converts user prompts into structured machine goals.
 * Uses hybrid approach: LLM semantic parsing + Domain ontology mapping.
 * 
 * Architecture:
 * Prompt → LLM Semantic Parser → Domain Ontology Matcher → Structured Intent Object
 */

import { ollamaOrchestrator } from './ollama-orchestrator';
import { nodeLibrary } from '../nodes/node-library';
import type { TrainingWorkflow } from './workflow-training-service';

export interface IntentObject {
  goal: string;           // One-line summary: "sales automation"
  actions: string[];      // High-level steps: ["fetch leads", "send email", "follow up"]
  entities: string[];     // Objects involved: ["email", "lead", "crm"]
  constraints: string[];  // Conditions: ["if no reply in 3 days"]
}

export interface DomainOntology {
  action: string;        // e.g., "send email"
  nodeId: string;        // e.g., "google_gmail"
  capability: string;    // e.g., "email.send"
  confidence: number;    // 0.0 - 1.0
}

/**
 * Intent Understanding Engine
 * 
 * Implements hybrid approach:
 * 1. LLM semantic parsing (Qwen2.5 14B) → structured JSON
 * 2. Domain ontology mapping → action → node mapping
 */
export class IntentEngine {
  private ontologyCache: Map<string, DomainOntology[]> = new Map();

  /**
   * Extract structured intent from user prompt
   * 
   * @param prompt - User's natural language prompt
   * @returns Structured IntentObject with goal, actions, entities, constraints
   */
  async extractIntent(prompt: string): Promise<IntentObject> {
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('Prompt is required and must be a non-empty string');
    }

    console.log('[IntentEngine] Extracting intent from prompt...');

    try {
      // Step 1: LLM semantic parsing
      const semanticIntent = await this.semanticParse(prompt);

      // Step 2: Domain ontology mapping (enrich actions with node mappings)
      const enrichedIntent = await this.mapToOntology(semanticIntent);

      // Validate intent structure
      if (!enrichedIntent.goal || !Array.isArray(enrichedIntent.actions)) {
        throw new Error('Invalid intent structure: missing goal or actions');
      }

      console.log(`[IntentEngine] ✅ Intent extracted: ${enrichedIntent.goal}`);
      console.log(`[IntentEngine] Actions: ${enrichedIntent.actions.length}`);
      console.log(`[IntentEngine] Entities: ${enrichedIntent.entities.length}`);

      return enrichedIntent;
    } catch (error) {
      console.error('[IntentEngine] Intent extraction failed:', error);
      // Re-throw with context
      throw new Error(`Intent extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Step 1: LLM Semantic Parsing
   * 
   * Uses Qwen2.5 14B to extract structured goal JSON from natural language.
   * Enhanced with few-shot learning from modern workflow examples.
   */
  private async semanticParse(prompt: string): Promise<IntentObject> {
    // Get similar modern examples for few-shot learning
    let examplesContext = '';
    try {
      const { workflowTrainingService } = require('./workflow-training-service');
      const modernExamples = workflowTrainingService.getModernExamples(3, prompt);
      
      if (modernExamples.length > 0) {
        examplesContext = `\n\nLEARN FROM THESE REAL-WORLD EXAMPLES:\n${modernExamples.map((ex: TrainingWorkflow, i: number) => `
Example ${i + 1}:
User Prompt: "${ex.goal}"
Extracted Intent: {
  "goal": "${ex.goal}",
  "actions": ${JSON.stringify(ex.phase1.step4.requirements.keySteps || [])},
  "entities": ${JSON.stringify(ex.phase1.step4.requirements.platforms || [])},
  "constraints": ${JSON.stringify(ex.constraints || [])}
}
Selected Nodes: ${ex.phase1.step5?.selectedNodes?.join(', ') || 'N/A'}
`).join('\n')}\n`;
      }
    } catch (error) {
      // Modern examples not available, continue without them
      console.log('[IntentEngine] Modern examples not available, using standard parsing');
    }
    
    const semanticPrompt = `You are an AI that extracts structured goals from user requests.

Your task is to analyze the user's prompt and extract:
1. **goal**: A one-line summary of what the user wants to accomplish
2. **actions**: A list of high-level steps needed (e.g., ["send email", "wait for reply", "update crm"])
3. **entities**: Objects/services involved (e.g., ["lead", "email", "crm", "slack"])
4. **constraints**: Any conditions or requirements (e.g., ["if no reply in 3 days", "only during business hours"])
${examplesContext}
User prompt: "${prompt}"

Return ONLY valid JSON in this exact format:
{
  "goal": "one-line summary",
  "actions": ["action1", "action2", "action3"],
  "entities": ["entity1", "entity2"],
  "constraints": ["constraint1", "constraint2"]
}

CRITICAL RULES:
- Return ONLY JSON, no markdown, no code blocks, no explanations
- Actions should be high-level verbs (e.g., "send email", not "gmail.send")
- Entities should be nouns (e.g., "email", "crm", "slack")
- Constraints should be conditions (e.g., "if no reply", "every day at 9am")
- Be specific but not too technical
- Follow the pattern from examples above if similar

JSON:`;

    try {
      const result = await ollamaOrchestrator.processRequest('workflow-generation', {
        prompt: semanticPrompt,
        temperature: 0.2,  // Low temperature for deterministic output
        maxTokens: 500,
      });

      // Parse JSON response
      const content = typeof result === 'string' ? result : JSON.stringify(result);
      
      // Clean up response (remove markdown code blocks if present)
      const cleaned = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const intent = JSON.parse(cleaned) as IntentObject;

      // Validate structure
      if (!intent.goal || !Array.isArray(intent.actions)) {
        throw new Error('Invalid intent structure from LLM');
      }

      return intent;
    } catch (error) {
      console.error('[IntentEngine] Semantic parsing failed:', error);
      
      // Fallback: Extract basic intent from keywords
      return this.fallbackIntentExtraction(prompt);
    }
  }

  /**
   * Step 2: Domain Ontology Mapping
   * 
   * Maps high-level actions to node capabilities using domain ontology.
   * This makes the system deterministic and prevents hallucination.
   */
  private async mapToOntology(intent: IntentObject): Promise<IntentObject> {
    // Build ontology from node library
    const ontology = this.buildOntology();

    // Map actions to node capabilities (for reference, not modifying actions)
    // The actual node selection happens in Layer 3
    const mappedActions = intent.actions.map(action => {
      const match = this.findOntologyMatch(action, ontology);
      if (match) {
        console.log(`[IntentEngine] Action "${action}" maps to node "${match.nodeId}" (confidence: ${match.confidence})`);
      }
      return action; // Keep original action, mapping is for validation
    });

    return {
      ...intent,
      actions: mappedActions, // Actions remain high-level, node mapping happens later
    };
  }

  /**
   * Build domain ontology from node library
   * 
   * Creates action → node mapping registry from available nodes.
   */
  private buildOntology(): DomainOntology[] {
    const ontology: DomainOntology[] = [];
    const schemas = nodeLibrary.getAllSchemas();

    for (const schema of schemas) {
      // Use capabilities if available
      if (schema.capabilities && schema.capabilities.length > 0) {
        for (const capability of schema.capabilities) {
          // Extract action from capability (e.g., "email.send" → "send email")
          const action = this.capabilityToAction(capability);
          
          ontology.push({
            action,
            nodeId: schema.type,
            capability,
            confidence: 0.9, // High confidence for capability-based matches
          });
        }
      }

      // Use keywords if available
      if (schema.keywords && schema.keywords.length > 0) {
        for (const keyword of schema.keywords) {
          ontology.push({
            action: keyword,
            nodeId: schema.type,
            capability: keyword,
            confidence: 0.7, // Medium confidence for keyword matches
          });
        }
      }

      // Use description to extract actions
      const descriptionActions = this.extractActionsFromDescription(schema.description);
      for (const action of descriptionActions) {
        ontology.push({
          action,
          nodeId: schema.type,
          capability: action,
          confidence: 0.6, // Lower confidence for description-based matches
        });
      }
    }

    return ontology;
  }

  /**
   * Find ontology match for an action
   */
  private findOntologyMatch(action: string, ontology: DomainOntology[]): DomainOntology | null {
    const actionLower = action.toLowerCase();

    // Exact match
    const exactMatch = ontology.find(o => o.action.toLowerCase() === actionLower);
    if (exactMatch) return exactMatch;

    // Partial match (action contains ontology action or vice versa)
    const partialMatch = ontology.find(o => 
      actionLower.includes(o.action.toLowerCase()) || 
      o.action.toLowerCase().includes(actionLower)
    );
    if (partialMatch) return partialMatch;

    // Word-based match (check if key words match)
    const actionWords = actionLower.split(/\s+/);
    const wordMatch = ontology.find(o => {
      const ontologyWords = o.action.toLowerCase().split(/\s+/);
      return actionWords.some(w => ontologyWords.includes(w));
    });
    if (wordMatch) return wordMatch;

    return null;
  }

  /**
   * Convert capability to action
   * e.g., "email.send" → "send email"
   */
  private capabilityToAction(capability: string): string {
    const parts = capability.split('.');
    if (parts.length >= 2) {
      return `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}`;
    }
    return capability;
  }

  /**
   * Extract actions from node description
   */
  private extractActionsFromDescription(description: string): string[] {
    const actions: string[] = [];
    const lower = description.toLowerCase();

    // Common action patterns
    const actionPatterns = [
      /send\s+(\w+)/g,
      /receive\s+(\w+)/g,
      /read\s+(\w+)/g,
      /write\s+(\w+)/g,
      /create\s+(\w+)/g,
      /update\s+(\w+)/g,
      /delete\s+(\w+)/g,
      /fetch\s+(\w+)/g,
      /get\s+(\w+)/g,
    ];

    for (const pattern of actionPatterns) {
      const matches = lower.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          actions.push(`${match[0].trim()} ${match[1]}`);
        }
      }
    }

    return actions;
  }

  /**
   * Fallback intent extraction (keyword-based)
   * Used when LLM parsing fails
   */
  private fallbackIntentExtraction(prompt: string): IntentObject {
    const promptLower = prompt.toLowerCase();
    const actions: string[] = [];
    const entities: string[] = [];
    const constraints: string[] = [];

    // Extract actions from keywords
    if (promptLower.includes('send') && promptLower.includes('email')) {
      actions.push('send email');
      entities.push('email');
    }
    if (promptLower.includes('fetch') || promptLower.includes('get')) {
      actions.push('fetch data');
    }
    if (promptLower.includes('follow up') || promptLower.includes('follow-up')) {
      actions.push('follow up');
    }
    if (promptLower.includes('wait') || promptLower.includes('delay')) {
      actions.push('wait');
    }

    // Extract entities
    if (promptLower.includes('gmail') || promptLower.includes('email')) entities.push('email');
    if (promptLower.includes('slack')) entities.push('slack');
    if (promptLower.includes('crm') || promptLower.includes('hubspot')) entities.push('crm');
    if (promptLower.includes('sheet') || promptLower.includes('spreadsheet')) entities.push('spreadsheet');
    if (promptLower.includes('lead')) entities.push('lead');

    // Extract constraints
    if (promptLower.includes('if') || promptLower.includes('when')) {
      constraints.push('conditional execution');
    }
    if (promptLower.includes('daily') || promptLower.includes('weekly')) {
      constraints.push('scheduled execution');
    }

    return {
      goal: prompt.substring(0, 100), // Use first 100 chars as goal
      actions: actions.length > 0 ? actions : ['process request'],
      entities: entities.length > 0 ? entities : ['data'],
      constraints: constraints.length > 0 ? constraints : [],
    };
  }
}

export const intentEngine = new IntentEngine();
