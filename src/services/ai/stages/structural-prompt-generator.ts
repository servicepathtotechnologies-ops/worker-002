/**
 * Structural Prompt Generator — Stage 2
 *
 * Converts resolved nodes + structured intent into a human-readable,
 * non-repetitive, numbered workflow description.
 *
 * Registry-driven — no Gemini call. Uses UnifiedNodeRegistry.label for
 * every display name so internal type strings never reach the user.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.9, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { unifiedNodeRegistry } from '../../../core/registry/unified-node-registry';
import type {
  StructuralPrompt,
  StructuralPromptInput,
  StructuralStep,
  StructuralCondition,
} from '../../../core/types/pipeline-contracts';
import type { SelectedNode } from '../system-prompt-builder';

const MAX_TEXT_LENGTH = 4000;

export class StructuralPromptGenerator {
  /**
   * Generate a StructuralPrompt from resolved nodes and structured intent.
   * Pure function — same inputs always produce the same output.
   */
  generate(input: StructuralPromptInput): StructuralPrompt {
    const { resolvedNodes, structuredIntent } = input;

    if (!resolvedNodes || resolvedNodes.length === 0) {
      return {
        text: structuredIntent.intent || 'No workflow steps could be determined.',
        steps: [],
        conditions: [],
        triggerDescription: 'Workflow trigger',
        terminalAction: 'Workflow complete',
      };
    }

    // Deduplicate nodes for linear paths — branching nodes keep all instances
    const deduplicatedNodes = this.deduplicateLinearNodes(resolvedNodes);

    // Build steps in execution order with action-aware descriptions
    const steps = this.buildSteps(deduplicatedNodes, structuredIntent);

    // Build conditions for branching nodes
    const conditions = this.buildConditions(deduplicatedNodes, structuredIntent);

    // Trigger description from first node
    const triggerNode = deduplicatedNodes.find((n) => n.role === 'trigger') ?? deduplicatedNodes[0];
    const triggerLabel = this.getDisplayName(triggerNode.type);
    const triggerTypeLabel = this.formatTriggerType(structuredIntent.triggerType);
    const triggerDescription = `${triggerLabel} — triggered ${triggerTypeLabel}`;

    // Terminal action from last node
    const terminalNode = deduplicatedNodes[deduplicatedNodes.length - 1];
    const terminalLabel = this.getDisplayName(terminalNode.type);
    const terminalAction = `${terminalLabel} completes the workflow`;

    // Compose full text
    const text = this.composeText(steps, conditions, triggerDescription, terminalAction, structuredIntent.intent);

    return { text, steps, conditions, triggerDescription, terminalAction };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * For linear paths, remove duplicate canonical types (keep first occurrence).
   * Branching paths are exempt — duplicate types are required per branch.
   */
  private deduplicateLinearNodes(nodes: SelectedNode[]): SelectedNode[] {
    const hasBranching = nodes.some((n) => {
      const def = unifiedNodeRegistry.get(n.type);
      return def?.isBranching === true;
    });

    if (hasBranching) return nodes;

    const seen = new Set<string>();
    return nodes.filter((n) => {
      const canonical = unifiedNodeRegistry.resolveAlias(n.type) || n.type;
      if (seen.has(canonical)) return false;
      seen.add(canonical);
      return true;
    });
  }

  private buildSteps(nodes: SelectedNode[], intent: StructuralPromptInput['structuredIntent']): StructuralStep[] {
    // Map actions to nodes by matching keywords
    const actionByNode = new Map<string, string>();
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const displayName = this.getDisplayName(node.type).toLowerCase();
      const nodeType = node.type.toLowerCase();
      
      // Find the action that mentions this node
      const matchedAction = intent.actions.find((action) => {
        const actionLower = action.toLowerCase();
        return actionLower.includes(displayName) || actionLower.includes(nodeType.replace(/_/g, ' '));
      });
      
      if (matchedAction) {
        actionByNode.set(node.nodeId, matchedAction);
      }
    }

    // Track display name occurrences for branch labeling
    const displayNameCount = new Map<string, number>();
    for (const node of nodes) {
      const name = this.getDisplayName(node.type);
      displayNameCount.set(name, (displayNameCount.get(name) ?? 0) + 1);
    }

    const displayNameIndex = new Map<string, number>();
    return nodes.map((node, idx) => {
      const displayName = this.getDisplayName(node.type);
      const count = displayNameCount.get(displayName) ?? 1;
      const action = actionByNode.get(node.nodeId);

      let description: string;
      
      // Use the action text if available — this is the user's intent in their own words
      if (action) {
        description = action;
      } else if (count > 1) {
        // Multiple instances of same display name — label by branch
        const branchIdx = (displayNameIndex.get(displayName) ?? 0) + 1;
        displayNameIndex.set(displayName, branchIdx);
        const branchLabel = this.branchLabel(branchIdx);
        description = `${branchLabel}: ${displayName} ${this.describeRole(node.role)}`;
      } else {
        description = `${displayName} ${this.describeRole(node.role)}`;
      }

      return {
        stepNumber: idx + 1,
        nodeType: node.type,
        displayName,
        description,
      };
    });
  }

  private buildConditions(nodes: SelectedNode[], intent: StructuralPromptInput['structuredIntent']): StructuralCondition[] {
    const conditions: StructuralCondition[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const def = unifiedNodeRegistry.get(node.type);
      if (!def?.isBranching) continue;

      // For switch nodes: extract case-specific outcomes from actions
      // For if_else nodes: extract true/false outcomes from actions
      const downstreamNodes = nodes.slice(i + 1);
      
      // Find actions that mention the downstream nodes
      const branchOutcomes: string[] = [];
      for (const downstream of downstreamNodes) {
        const downstreamName = this.getDisplayName(downstream.type).toLowerCase();
        const matchedAction = intent.actions.find((action) => {
          const actionLower = action.toLowerCase();
          return actionLower.includes(downstreamName) || actionLower.includes(downstream.type.replace(/_/g, ' '));
        });
        if (matchedAction) {
          branchOutcomes.push(matchedAction);
        }
      }

      // Use data flows if available
      const relevantFlows = intent.dataFlows.filter(
        (f) => f.from.toLowerCase().includes(node.type.toLowerCase()) ||
               f.from.toLowerCase().includes(def.label?.toLowerCase() ?? '')
      );

      const trueOutcome = branchOutcomes[0] || relevantFlows[0]?.dataDescription || 'condition is met';
      const falseOutcome = branchOutcomes[1] || relevantFlows[1]?.dataDescription || 'condition is not met';

      conditions.push({
        branchNodeType: node.type,
        trueOutcome,
        falseOutcome,
      });
    }

    return conditions;
  }

  private composeText(
    steps: StructuralStep[],
    conditions: StructuralCondition[],
    triggerDescription: string,
    terminalAction: string,
    intentSummary: string,
  ): string {
    const lines: string[] = [];

    // WORKFLOW line — AI-generated description, not the raw user prompt
    const triggerNode = steps.find(s => {
      const def = unifiedNodeRegistry.get(s.nodeType);
      return def?.category === 'trigger' || unifiedNodeRegistry.isTrigger(s.nodeType);
    });
    lines.push(`WORKFLOW: Automate ${intentSummary.trim().toLowerCase().replace(/^create |^build |^make |^set up /i, '')}`);
    lines.push('');

    // TRIGGER section
    lines.push(`TRIGGER: ${triggerDescription}`);
    lines.push('');

    // FLOW section with branch-aware descriptions
    lines.push('FLOW:');
    const branchingStepNumbers = new Set<number>();
    for (const step of steps) {
      const def = unifiedNodeRegistry.get(step.nodeType);
      if (def?.isBranching) branchingStepNumbers.add(step.stepNumber);
    }

    // Group downstream nodes by their branch
    const branchingStepIdx = steps.findIndex(s => branchingStepNumbers.has(s.stepNumber));
    const hasBranching = branchingStepIdx >= 0;

    if (hasBranching) {
      // Pre-branching steps
      for (let i = 0; i < branchingStepIdx; i++) {
        const step = steps[i];
        lines.push(`${step.stepNumber}. ${step.displayName} — ${step.description}`);
      }

      // Branching step with cases
      const branchStep = steps[branchingStepIdx];
      lines.push(`${branchStep.stepNumber}. ${branchStep.displayName} — evaluates conditions and routes to the appropriate branch`);

      // Downstream branch nodes — each gets its own case line
      const downstreamSteps = steps.slice(branchingStepIdx + 1);
      const displayNameCount = new Map<string, number>();
      for (const s of downstreamSteps) {
        displayNameCount.set(s.displayName, (displayNameCount.get(s.displayName) ?? 0) + 1);
      }
      const displayNameIdx = new Map<string, number>();
      for (const step of downstreamSteps) {
        const idx = (displayNameIdx.get(step.displayName) ?? 0) + 1;
        displayNameIdx.set(step.displayName, idx);
        const caseLabel = `case_${idx}`;
        lines.push(`  → Case "${caseLabel}": ${step.displayName} — ${step.description}`);
      }
    } else {
      // Linear flow
      for (const step of steps) {
        lines.push(`${step.stepNumber}. ${step.displayName} — ${step.description}`);
      }
    }

    lines.push('');

    // CONNECTIONS section
    lines.push('CONNECTIONS: ' + (hasBranching
      ? `${triggerNode?.displayName ?? 'Trigger'} outputs data → ${steps[branchingStepIdx]?.displayName ?? 'Switch'} reads the routing field to determine which branch executes → each branch node receives the full upstream payload.`
      : steps.slice(0, -1).map((s, i) => `${s.displayName} → ${steps[i + 1]?.displayName}`).join(' → ')
    ));

    let text = lines.join('\n').trim();

    // Enforce 4000 char limit
    if (text.length > MAX_TEXT_LENGTH) {
      const truncated = text.slice(0, MAX_TEXT_LENGTH);
      const lastSentenceEnd = Math.max(truncated.lastIndexOf('. '), truncated.lastIndexOf('.\n'));
      text = lastSentenceEnd > 0
        ? truncated.slice(0, lastSentenceEnd + 1) + '…'
        : truncated.slice(0, MAX_TEXT_LENGTH - 1) + '…';
    }

    return text;
  }

  /** Get display name from registry label — never returns raw type string to user. */
  private getDisplayName(nodeType: string): string {
    const canonical = unifiedNodeRegistry.resolveAlias(nodeType) || nodeType;
    const def = unifiedNodeRegistry.get(canonical);
    if (def?.label) return def.label;
    // Fallback: humanize the type string (e.g. google_gmail → Google Gmail)
    return canonical
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private describeRole(role: SelectedNode['role']): string {
    switch (role) {
      case 'trigger': return 'starts the workflow';
      case 'action': return 'processes and forwards data';
      case 'logic': return 'evaluates conditions and routes data';
      case 'terminal': return 'completes the workflow';
      default: return 'runs';
    }
  }

  private branchLabel(index: number): string {
    const labels = ['Branch A', 'Branch B', 'Branch C', 'Branch D', 'Branch E'];
    return labels[index - 1] ?? `Branch ${index}`;
  }

  private formatTriggerType(triggerType: string): string {
    const map: Record<string, string> = {
      schedule: 'on a schedule',
      webhook: 'via webhook',
      form: 'on form submission',
      chat_trigger: 'on chat message',
      manual_trigger: 'manually',
    };
    return map[triggerType] ?? `via ${triggerType}`;
  }
}

export const structuralPromptGenerator = new StructuralPromptGenerator();
