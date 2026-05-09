/**
 * AI-Driven Workflow Summary Generator - 100% AI GENERATION
 * 
 * NO HARDCODING - PURE AI UNDERSTANDING AND GENERATION
 */

import { aiAdapter } from './ai-adapter';
import { unifiedNodeRegistry } from '../../core/registry/unified-node-registry';
import type { Workflow, WorkflowSummaryV2, WorkflowEdge } from '../../core/types/ai-types';
import { compileSummaryV2FromWorkflow } from './summary-v2-compiler';

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
  
  /** Optional: Workflow graph structure for branching analysis */
  workflow?: Workflow;
  
  /** Optional: Workflow edges for branching analysis */
  edges?: WorkflowEdge[];
}

export interface BranchingAnalysis {
  /** Whether the workflow contains branching logic */
  hasBranching: boolean;
  
  /** Array of branching nodes with their cases */
  branches: BranchInfo[];
  
  /** Array of node IDs where branches reconverge */
  mergePoints: string[];
}

export interface BranchInfo {
  /** Node ID of the branching node */
  nodeId: string;
  
  /** Node type (if_else, switch) */
  nodeType: string;
  
  /** Type of branching: binary (if_else) or multi-case (switch) */
  branchType: 'binary' | 'multi-case';
  
  /** Array of branch cases with their targets */
  cases: Array<{
    /** Case key (true/false for if_else, case_N for switch) */
    caseKey: string;
    
    /** Target node ID for this case */
    targetNodeId: string;
    
    /** Edge type (main, true, false, case value) */
    edgeType?: string;
  }>;
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
  generateSummaryV2FromWorkflow(workflow: Workflow, userPrompt: string): WorkflowSummaryV2 {
    return compileSummaryV2FromWorkflow(workflow, userPrompt);
  }

  /**
   * Generate 100% AI-driven workflow summary
   */
  async generateSummary(input: AIWorkflowSummaryInput): Promise<AIWorkflowSummaryOutput> {
    try {
      // 1. Analyze workflow structure for branching
      const branchingAnalysis = this.analyzeBranchingStructure(input.workflow, input.edges);
      
      // 2. Build enhanced node context with branching metadata
      const nodeContext = this.buildNodeContextWithBranching(input.nodeChain, branchingAnalysis);
      
      // 3. Create AI prompt with branch-aware instructions
      const aiPrompt = this.createBranchAwareAIPrompt(input, nodeContext, branchingAnalysis);
      
      // 4. Call AI for generation
      const aiResponse = await this.callAI(aiPrompt);
      
      // 5. Format response with branch explanations
      const summary = this.formatAIResponseWithBranches(aiResponse, branchingAnalysis);
      
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
   * Analyze workflow structure to identify branches, edges, and merge points
   */
  private analyzeBranchingStructure(
    workflow?: Workflow,
    edges?: WorkflowEdge[]
  ): BranchingAnalysis {
    if (!workflow || !edges) {
      return { hasBranching: false, branches: [], mergePoints: [] };
    }

    const branches: BranchInfo[] = [];
    const mergePoints: string[] = [];
    
    // Identify branching nodes (if_else, switch)
    for (const node of workflow.nodes) {
      const nodeType = node.data?.type || node.type;
      const nodeDef = unifiedNodeRegistry.get(nodeType);
      
      if (nodeDef?.isBranching) {
        const outgoingEdges = edges.filter(e => e.source === node.id);
        branches.push({
          nodeId: node.id,
          nodeType,
          branchType: nodeType === 'if_else' ? 'binary' : 'multi-case',
          cases: outgoingEdges.map(e => ({
            caseKey: e.branchName || e.sourceHandle || e.type || 'default',
            targetNodeId: e.target,
            edgeType: e.type
          }))
        });
      }
    }
    
    // Identify merge points (nodes with multiple incoming edges)
    const incomingCount = new Map<string, number>();
    for (const edge of edges) {
      incomingCount.set(edge.target, (incomingCount.get(edge.target) || 0) + 1);
    }
    for (const [nodeId, count] of incomingCount.entries()) {
      if (count > 1) {
        mergePoints.push(nodeId);
      }
    }
    
    return {
      hasBranching: branches.length > 0,
      branches,
      mergePoints
    };
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
   * Build node context with branching metadata
   */
  private buildNodeContextWithBranching(
    nodeChain: string[],
    branchingAnalysis: BranchingAnalysis
  ): string {
    const baseContext = this.buildNodeContextForAI(nodeChain);
    
    if (!branchingAnalysis.hasBranching) {
      return baseContext;
    }

    // Add branching metadata
    const branchingInfo = branchingAnalysis.branches.map(branch => {
      const casesInfo = branch.cases.map(c => 
        `    • ${c.caseKey} → ${c.targetNodeId}`
      ).join('\n');
      
      return `  - ${branch.nodeType} (${branch.nodeId}): ${branch.branchType} branching\n${casesInfo}`;
    }).join('\n');

    const mergeInfo = branchingAnalysis.mergePoints.length > 0
      ? `\n  Merge Points: ${branchingAnalysis.mergePoints.join(', ')}`
      : '';

    return `${baseContext}\n\nBRANCHING STRUCTURE:\n${branchingInfo}${mergeInfo}`;
  }

  /**
   * Create branch-aware AI prompt with explicit branching instructions
   */
  private createBranchAwareAIPrompt(
    input: AIWorkflowSummaryInput,
    nodeContext: string,
    branchingAnalysis: BranchingAnalysis
  ): string {
    const additionalContext = [
      input.useCases?.length ? `Use Cases:\n${input.useCases.join('\n')}` : '',
      input.requirements?.length ? `Requirements:\n${input.requirements.join('\n')}` : '',
      input.branchingLogic ? `Branching Logic:\n${input.branchingLogic}` : '',
    ].filter(Boolean).join('\n\n');

    // Build branching-specific instructions
    const branchingInstructions = branchingAnalysis.hasBranching
      ? this.buildBranchingInstructions(branchingAnalysis)
      : '';

    return `You are an expert workflow architect. Produce a concise, theoretically precise workflow blueprint.

USER INTENT:
${input.userPrompt}

SELECTED NODES (execution order):
${nodeContext}

${additionalContext ? `ADDITIONAL CONTEXT:\n${additionalContext}\n` : ''}

OUTPUT these EXACT four sections. Each section header must appear on its own line exactly as shown.

OBJECTIVE:
One sentence — the business outcome this workflow automates. Focus on WHY it exists, not HOW it works.

TRIGGER_DESCRIPTION:
One to two sentences — what event starts execution, what data the trigger captures and passes downstream.

DETAILED_FLOW:
Numbered steps, one per node. For each step write: "N. [Node label] — [what it receives] → [what it does] → [what it outputs]".
If the workflow branches (if_else or switch node), show each branch on its own indented line starting with "→ [Condition]: [downstream path]".
Be specific: name the data fields being passed (e.g., "passes email subject and sender to next step").

CONNECTIONS:
Two to four sentences describing how data travels end-to-end: which field triggers each step, how branch routing is decided, and what the final output is.
${branchingAnalysis.hasBranching ? 'Explicitly state which node reads the routing field, what values map to which branch, and what each branch produces.' : ''}

RULES:
- OBJECTIVE must be one sentence and focus on business value (WHY), not steps (HOW).
- DETAILED_FLOW must describe each node in the selected list — do not add nodes that are not selected.
- Use plain English — avoid jargon. A non-technical user should understand the flow.
- For branching: each branch path must be described separately with its condition and outcome.
${branchingAnalysis.hasBranching ? '- EXPLAIN EACH BRANCH PATH SEPARATELY AND COMPLETELY' : ''}

Generate precise, minimal analysis grounded in the selected nodes and user intent.`;
  }

  /**
   * Build branching-specific instructions for AI prompt
   */
  private buildBranchingInstructions(branchingAnalysis: BranchingAnalysis): string {
    const instructions: string[] = [];

    for (const branch of branchingAnalysis.branches) {
      if (branch.branchType === 'binary') {
        instructions.push(`
   - For IF_ELSE node (${branch.nodeId}):
     * Explain the TRUE branch path: what happens when condition is true
     * Explain the FALSE branch path: what happens when condition is false
     * Describe the condition being evaluated
     * Show how data flows through each branch`);
      } else if (branch.branchType === 'multi-case') {
        const caseList = branch.cases.map(c => c.caseKey).join(', ');
        instructions.push(`
   - For SWITCH node (${branch.nodeId}):
     * Explain ALL ${branch.cases.length} case branches: ${caseList}
     * Describe what each case represents
     * Show what happens in each case path
     * Explain how the switch value is determined`);
      }
    }

    if (branchingAnalysis.mergePoints.length > 0) {
      instructions.push(`
   - For MERGE points (${branchingAnalysis.mergePoints.join(', ')}):
     * Explain where branches reconverge
     * Describe how data from different branches is combined
     * Show the unified execution path after merge`);
    }

    return instructions.join('\n');
  }

  /**
   * Create AI prompt - LET AI UNDERSTAND EVERYTHING (Legacy method for backward compatibility)
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
   * Format AI response with branch explanations
   */
  private formatAIResponseWithBranches(
    aiResponse: string,
    branchingAnalysis: BranchingAnalysis
  ): string {
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

    // Validate that OBJECTIVE and DETAILED_FLOW are distinct
    if (objective === detailedFlow || this.areSectionsSimilar(objective, detailedFlow)) {
      console.warn('[AI Summary Generator] OBJECTIVE and DETAILED_FLOW are too similar, AI may not have followed instructions');
    }

    // Validate that CONNECTIONS section includes edge information if branching exists
    if (branchingAnalysis.hasBranching && !this.containsEdgeInformation(connections)) {
      console.warn('[AI Summary Generator] CONNECTIONS section missing edge routing information for branching workflow');
    }

    // Return frontend format — section headers must include colons so CapabilityReviewStep parser detects structured mode
    return `WORKFLOW: ${objective}

TRIGGER: ${triggerDescription}

FLOW: ${detailedFlow}

CONNECTIONS: ${connections}`;
  }

  /**
   * Check if two sections are too similar (potential AI instruction failure)
   */
  private areSectionsSimilar(section1: string, section2: string): boolean {
    const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const normalized1 = normalize(section1);
    const normalized2 = normalize(section2);
    
    // Check if one section is a substring of the other (too similar)
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return true;
    }
    
    // Check word overlap (if >70% words are the same, sections are too similar)
    const words1 = new Set(normalized1.split(/\s+/));
    const words2 = new Set(normalized2.split(/\s+/));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const overlapRatio = intersection.size / Math.min(words1.size, words2.size);
    
    return overlapRatio > 0.7;
  }

  /**
   * Check if connections section contains edge routing information
   */
  private containsEdgeInformation(connections: string): boolean {
    const edgeKeywords = [
      'true branch', 'false branch', 'case', 'branch', 'edge', 'route', 'path',
      'condition', 'merge', 'reconverge', 'true path', 'false path'
    ];
    
    const normalized = connections.toLowerCase();
    return edgeKeywords.some(keyword => normalized.includes(keyword));
  }

  /**
   * Format AI response - EXTRACT AI SECTIONS (Legacy method for backward compatibility)
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

    // Return frontend format — section headers must include colons so CapabilityReviewStep parser detects structured mode
    return `WORKFLOW: ${objective}

TRIGGER: ${triggerDescription}

FLOW: ${detailedFlow}

CONNECTIONS: ${connections}`;
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