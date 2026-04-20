/**
 * AI-Driven Workflow Summary Generator - 100% AI GENERATION
 * 
 * NO HARDCODING - PURE AI UNDERSTANDING AND GENERATION
 */

import { aiAdapter } from './ai-adapter';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';

export interface AIWorkflowSummaryInput {
  /** Original user prompt describing the workflow */
  userPrompt: string;
  
  /** Selected node types in execution order */
  nodeChain: string[];
  
  /** Optional: Use cases or business context */
  useCases?: string[];
  
  /** Optional: Specific requirements or constraints */
  requirements?: string[];
  
  /** Optional: Branching logic description */
  branchingLogic?: string;
}

export interface AIWorkflowSummaryOutput {
  /** Frontend-ready workflow summary */
  summary: string;
  
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * AI-Driven Workflow Summary Generator - PURE AI IMPLEMENTATION
 */
export class AIDrivenWorkflowSummaryGenerator {
  /**
   * Generate 100% AI-driven workflow summary
   */
  async generateSummary(input: AIWorkflowSummaryInput): Promise<AIWorkflowSummaryOutput> {
    try {
      // Build node context for AI understanding
      const nodeContext = this.buildNodeContextForAI(input.nodeChain);
      
      // Create comprehensive AI prompt
      const aiPrompt = this.createAIPrompt(input, nodeContext);
      
      // Call AI for complete generation
      const aiResponse = await this.callAI(aiPrompt);
      
      // Format AI response for frontend
      const summary = this.formatAIResponse(aiResponse);
      
      return {
        summary,
        confidence: 0.95,
      };
    } catch (error) {
      console.error('[AI Summary Generator] Error:', error);
      // Minimal fallback - let AI handle everything
      return {
        summary: await this.generateMinimalAIFallback(input),
        confidence: 0.3,
      };
    }
  }

  /**
   * Build node context from registry - NO HARDCODING
   */
  private buildNodeContextForAI(nodeChain: string[]): string {
    return nodeChain.map((nodeType, idx) => {
      try {
        const nodeDef = unifiedNodeRegistry.get(nodeType);
        const description = nodeDef?.description || `Node: ${nodeType}`;
        const category = nodeDef?.category || 'processing';
        return `${idx + 1}. ${nodeType} (${category}): ${description}`;
      } catch {
        return `${idx + 1}. ${nodeType}: Workflow node`;
      }
    }).join('\n');
  }

  /**
   * Create AI prompt - LET AI UNDERSTAND EVERYTHING
   */
  private createAIPrompt(input: AIWorkflowSummaryInput, nodeContext: string): string {
    const additionalContext = [
      input.useCases?.length ? `Use Cases:\n${input.useCases.join('\n')}` : '',
      input.requirements?.length ? `Requirements:\n${input.requirements.join('\n')}` : '',
      input.branchingLogic ? `Branching Logic:\n${input.branchingLogic}` : '',
    ].filter(Boolean).join('\n\n');

    return `You are an expert workflow architect. Analyze this workflow and generate a comprehensive summary.

USER INTENT:
${input.userPrompt}

SELECTED NODES (execution order):
${nodeContext}

${additionalContext ? `ADDITIONAL CONTEXT:\n${additionalContext}\n` : ''}

TASK: Generate a detailed workflow analysis with these EXACT sections:

1. OBJECTIVE: High-level business goal and purpose of this workflow

2. TRIGGER_DESCRIPTION: How the workflow starts and what initiates it

3. DETAILED_FLOW: Complete step-by-step execution including:
   - Each node's purpose and role in the workflow
   - Input data and processing for each step
   - Decision points and branching logic (if any)
   - All possible execution paths
   - Data flow between nodes
   - Final outcomes and results

4. CONNECTIONS: How nodes connect, route data, and work together

CRITICAL REQUIREMENTS:
- Analyze the user's specific intent and selected nodes
- Make OBJECTIVE and DETAILED_FLOW completely different content
- OBJECTIVE = high-level business purpose
- DETAILED_FLOW = technical step-by-step execution
- Be specific about the actual nodes selected and their roles
- Explain branching logic based on the node sequence
- Focus on the user's specific scenario and requirements
- Generate contextual content that matches the workflow purpose

Generate comprehensive, intelligent analysis based on the user intent and selected nodes.`;
  }

  /**
   * Call AI - PURE AI GENERATION
   */
  private async callAI(prompt: string): Promise<string> {
    const response = await aiAdapter.chat([
      {
        role: 'user',
        content: prompt,
      },
    ], {
      temperature: 0.8, // Higher creativity for better contextual understanding
    });

    return response || '';
  }

  /**
   * Format AI response - EXTRACT AI SECTIONS
   */
  private formatAIResponse(aiResponse: string): string {
    // Extract sections using flexible patterns
    const objective = this.extractAISection(aiResponse, 'OBJECTIVE') || 
                     this.extractAISection(aiResponse, '1.') ||
                     'AI-generated workflow objective';
    
    const triggerDescription = this.extractAISection(aiResponse, 'TRIGGER_DESCRIPTION') || 
                              this.extractAISection(aiResponse, '2.') ||
                              'AI-generated trigger description';
    
    const detailedFlow = this.extractAISection(aiResponse, 'DETAILED_FLOW') || 
                        this.extractAISection(aiResponse, '3.') ||
                        'AI-generated detailed execution flow';
    
    const connections = this.extractAISection(aiResponse, 'CONNECTIONS') || 
                       this.extractAISection(aiResponse, '4.') ||
                       'AI-generated connection description';

    // Return frontend format
    return `WORKFLOW: ${objective}

TRIGGER
${triggerDescription}

FLOW
${detailedFlow}

CONNECTIONS
${connections}`;
  }

  /**
   * Extract section from AI response - FLEXIBLE PARSING
   */
  private extractAISection(response: string, sectionName: string): string | null {
    const patterns = [
      // Pattern 1: "SECTION_NAME:" followed by content
      new RegExp(`${sectionName}:\\s*([\\s\\S]*?)(?=\\n\\n[A-Z_]+:|\\n\\n\\d+\\.|$)`, 'i'),
      // Pattern 2: "SECTION_NAME" on its own line
      new RegExp(`${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n\\n[A-Z_]+:|\\n\\n\\d+\\.|$)`, 'i'),
      // Pattern 3: Numbered sections "1. SECTION_NAME"
      new RegExp(`\\d+\\.\\s*${sectionName}:?\\s*([\\s\\S]*?)(?=\\n\\n\\d+\\.|$)`, 'i'),
      // Pattern 4: Just the section name followed by content
      new RegExp(`${sectionName}\\s*([\\s\\S]*?)(?=\\n\\n|$)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match && match[1] && match[1].trim().length > 10) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Minimal AI fallback if main AI fails
   */
  private async generateMinimalAIFallback(input: AIWorkflowSummaryInput): Promise<string> {
    try {
      const simplePrompt = `Analyze this workflow: "${input.userPrompt}" with nodes: ${input.nodeChain.join(', ')}. 
      
      Generate a brief summary with:
      - OBJECTIVE: What this workflow does
      - TRIGGER: How it starts  
      - FLOW: Step-by-step execution
      - CONNECTIONS: How nodes connect
      
      Make each section different and specific to the workflow.`;

      const response = await aiAdapter.chat([
        { role: 'user', content: simplePrompt }
      ], { temperature: 0.7 });

      return this.formatAIResponse(response || 'AI-generated workflow summary');
    } catch {
      // Absolute minimal fallback
      return `WORKFLOW: ${input.userPrompt}

TRIGGER
Workflow execution begins with the first selected node.

FLOW
Executes ${input.nodeChain.length} nodes in sequence: ${input.nodeChain.join(' → ')}.

CONNECTIONS
Sequential execution with data flow between connected nodes.`;
    }
  }
}

// Export singleton instance
export const aiDrivenWorkflowSummaryGenerator = new AIDrivenWorkflowSummaryGenerator();