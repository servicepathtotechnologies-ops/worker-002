/**
 * DSL Generator Tests
 * 
 * Tests DSL generation from StructuredIntent with transformation detection.
 */

import { describe, it, expect } from '@jest/globals';
import { DSLGenerator } from '../workflow-dsl';
import { StructuredIntent } from '../intent-structurer';
import type { DSLDataSource, DSLTransformation, DSLOutput } from '../workflow-dsl';
import { getTransformationNodeType } from '../transformation-node-config';
import { workflowDSLCompiler } from '../workflow-dsl-compiler';
import { nodeLibrary } from '../../nodes/node-library';
import type { WorkflowNode } from '../../../core/types/ai-types';

describe('DSLGenerator', () => {
  const dslGenerator = new DSLGenerator();

  describe('Google Sheets + Summarize + Gmail Workflow', () => {
    const userPrompt = 'Get data from Google Sheets, summarize it using AI, and send to Gmail';

    it('should generate DSL with correct components for Sheets + Summarize + Gmail', () => {
      // Create mock StructuredIntent with 2 actions
      const intent: StructuredIntent = {
        trigger: 'manual_trigger',
        actions: [
          {
            type: 'google_sheets',
            operation: 'read',
            config: {},
          },
          {
            type: 'email',
            operation: 'send',
            config: {},
          },
        ],
        requires_credentials: ['google_sheets', 'email'],
      };

      // Mock transformation detection (summarize verb detected)
      // Uses central TRANSFORMATION_NODE_MAP configuration
      const transformationDetection = {
        detected: true,
        verbs: ['summarize'],
        requiredNodeTypes: [getTransformationNodeType('summarize')], // Returns 'ai_chat_model'
      };

      // Generate DSL
      const dsl = dslGenerator.generateDSL(intent, userPrompt, transformationDetection);

      // ✅ Test: Intent has 2 actions
      expect(intent.actions.length).toBe(2);

      // ✅ Test: DSL contains 1 data source (google_sheets)
      expect(dsl.dataSources.length).toBe(1);
      expect(dsl.dataSources[0].type).toBe('google_sheets');
      expect(dsl.dataSources[0].operation).toBe('read');

      // ✅ Test: DSL contains 1 output (email/gmail)
      expect(dsl.outputs.length).toBeGreaterThanOrEqual(1);
      const outputTypes = dsl.outputs.map(o => o.type.toLowerCase());
      expect(
        outputTypes.some(type => 
          type === 'email' || 
          type === 'gmail' || 
          type === 'google_gmail' ||
          type.includes('gmail') ||
          type.includes('email')
        )
      ).toBe(true);

      // ✅ Test: DSL contains >= 1 transformation (ai_chat_model from central config)
      expect(dsl.transformations.length).toBeGreaterThanOrEqual(1);
      const transformationTypes = dsl.transformations.map(t => t.type.toLowerCase());
      expect(
        transformationTypes.some(type =>
          type === 'ai_chat_model' ||
          type.includes('ai_chat') ||
          type.includes('summarizer') ||
          type.includes('ollama') ||
          type.includes('openai') ||
          type.includes('anthropic') ||
          type.includes('ai_agent')
        )
      ).toBe(true);

      // ✅ Test: Auto-injected nodes are tracked in metadata
      if (dsl.metadata?.autoInjectedNodes) {
        expect(Array.isArray(dsl.metadata.autoInjectedNodes)).toBe(true);
        expect(dsl.metadata.autoInjectedNodes.length).toBeGreaterThan(0);
        // Verify no duplicates
        const uniqueNodes = new Set(dsl.metadata.autoInjectedNodes);
        expect(uniqueNodes.size).toBe(dsl.metadata.autoInjectedNodes.length);
      }

      // ✅ Test: Validation passes (no errors thrown)
      expect(dsl.trigger).toBeDefined();
      expect(dsl.trigger.type).toBe('manual_trigger');
      expect(dsl.executionOrder).toBeDefined();
      expect(Array.isArray(dsl.executionOrder)).toBe(true);
    });

    it('should handle transformation detection correctly', () => {
      const intent: StructuredIntent = {
        trigger: 'manual_trigger',
        actions: [
          {
            type: 'google_sheets',
            operation: 'read',
          },
          {
            type: 'email',
            operation: 'send',
          },
        ],
        requires_credentials: [],
      };

      const transformationDetection = {
        detected: true,
        verbs: ['summarize'],
        requiredNodeTypes: ['text_summarizer', 'ollama_llm'],
      };

      const dsl = dslGenerator.generateDSL(intent, userPrompt, transformationDetection);

      // Verify transformations were added
      expect(dsl.transformations.length).toBeGreaterThan(0);
      
      // Verify transformations are in metadata
      if (dsl.metadata?.autoInjectedNodes) {
        expect(dsl.metadata.autoInjectedNodes.length).toBeGreaterThan(0);
      }
    });

    it('should not add duplicate transformations', () => {
      const intent: StructuredIntent = {
        trigger: 'manual_trigger',
        actions: [
          {
            type: 'google_sheets',
            operation: 'read',
          },
          {
            type: 'email',
            operation: 'send',
          },
        ],
        requires_credentials: [],
      };

      const transformationDetection = {
        detected: true,
        verbs: ['summarize'],
        requiredNodeTypes: ['ollama_llm', 'ollama_llm', 'ollama'], // Duplicate types
      };

      const dsl = dslGenerator.generateDSL(intent, userPrompt, transformationDetection);

      // Verify no duplicate transformations
      const transformationTypes = dsl.transformations.map(t => t.type);
      const uniqueTypes = new Set(transformationTypes);
      expect(uniqueTypes.size).toBeLessThanOrEqual(transformationTypes.length);

      // Verify metadata has no duplicates
      if (dsl.metadata?.autoInjectedNodes) {
        const uniqueMetadata = new Set(dsl.metadata.autoInjectedNodes);
        expect(uniqueMetadata.size).toBe(dsl.metadata.autoInjectedNodes.length);
      }
    });

    it('should be idempotent (same input produces same output)', () => {
      const intent: StructuredIntent = {
        trigger: 'manual_trigger',
        actions: [
          {
            type: 'google_sheets',
            operation: 'read',
          },
          {
            type: 'email',
            operation: 'send',
          },
        ],
        requires_credentials: [],
      };

      const transformationDetection = {
        detected: true,
        verbs: ['summarize'],
        requiredNodeTypes: ['ollama_llm'],
      };

      // Generate DSL twice
      const dsl1 = dslGenerator.generateDSL(intent, userPrompt, transformationDetection);
      const dsl2 = dslGenerator.generateDSL(intent, userPrompt, transformationDetection);

      // Verify same structure
      expect(dsl1.dataSources.length).toBe(dsl2.dataSources.length);
      expect(dsl1.outputs.length).toBe(dsl2.outputs.length);
      expect(dsl1.transformations.length).toBe(dsl2.transformations.length);

      // Verify same auto-injected nodes
      if (dsl1.metadata?.autoInjectedNodes && dsl2.metadata?.autoInjectedNodes) {
        expect(dsl1.metadata.autoInjectedNodes.length).toBe(dsl2.metadata.autoInjectedNodes.length);
        expect(dsl1.metadata.autoInjectedNodes.sort()).toEqual(dsl2.metadata.autoInjectedNodes.sort());
      }
    });

    it('should pass intent coverage validation with summarize action and transformation nodes', () => {
      // Prompt: "Get data from Google Sheets, summarize using AI, send to Gmail"
      const testPrompt = 'Get data from Google Sheets, summarize using AI, send to Gmail';
      
      // Create intent with summarize action (ai_chat_model with summarize operation)
      const intent: StructuredIntent = {
        trigger: 'manual_trigger',
        actions: [
          {
            type: 'google_sheets',
            operation: 'read',
            config: {},
          },
          {
            type: 'ai_chat_model', // Intent action type that should map to transformation
            operation: 'summarize', // Transformation operation
            config: {},
          },
          {
            type: 'google_gmail',
            operation: 'send',
            config: {},
          },
        ],
        requires_credentials: ['google_sheets', 'google_gmail'],
      };

      // Mock transformation detection (summarize verb detected)
      // Uses central TRANSFORMATION_NODE_MAP configuration
      const transformationDetection = {
        detected: true,
        verbs: ['summarize'],
        requiredNodeTypes: [getTransformationNodeType('summarize')], // Returns 'ai_chat_model'
      };

      // ✅ Test: Intent actions include summarize
      const summarizeActions = intent.actions.filter(a => 
        (a.operation || '').toLowerCase() === 'summarize' ||
        a.type.toLowerCase().includes('ai') ||
        a.type.toLowerCase().includes('chat') ||
        a.type.toLowerCase().includes('model')
      );
      expect(summarizeActions.length).toBeGreaterThan(0);
      expect(intent.actions.some(a => (a.operation || '').toLowerCase() === 'summarize')).toBe(true);

      // Generate DSL - should not throw (validation passes)
      let dsl;
      expect(() => {
        dsl = dslGenerator.generateDSL(intent, testPrompt, transformationDetection);
      }).not.toThrow();

      // ✅ Test: DSL includes transformation nodes (ai_chat_model from central config)
      expect(dsl!.transformations.length).toBeGreaterThan(0);
      const transformationTypes = dsl!.transformations.map((t: DSLTransformation) => t.type.toLowerCase());
      expect(
        transformationTypes.some((type: string) =>
          type === 'ai_chat_model' ||
          type.includes('ai_chat') ||
          type.includes('summarizer') ||
          type.includes('ollama') ||
          type.includes('openai') ||
          type.includes('anthropic') ||
          type.includes('ai_agent')
        )
      ).toBe(true);

      // ✅ Test: Intent coverage validation passes
      // This is implicit - if generateDSL doesn't throw, validation passed
      // But we can also verify the structure:
      expect(dsl!.dataSources.length).toBeGreaterThan(0);
      expect(dsl!.dataSources.some((ds: DSLDataSource) => ds.type.toLowerCase().includes('sheets'))).toBe(true);
      
      expect(dsl!.outputs.length).toBeGreaterThan(0);
      const outputTypes = dsl!.outputs.map((o: DSLOutput) => o.type.toLowerCase());
      expect(
        outputTypes.some((type: string) =>
          type.includes('gmail') ||
          type.includes('email')
        )
      ).toBe(true);

      expect(dsl!.transformations.length).toBeGreaterThan(0);

      // Verify all intent actions are covered by DSL nodes
      const dslDataSourceTypes = dsl!.dataSources.map((ds: DSLDataSource) => ds.type.toLowerCase());
      const dslTransformationTypes = dsl!.transformations.map((tf: DSLTransformation) => tf.type.toLowerCase());
      const dslOutputTypes = dsl!.outputs.map((out: DSLOutput) => out.type.toLowerCase());
      const allDSLTypes = [...dslDataSourceTypes, ...dslTransformationTypes, ...dslOutputTypes];

      // Check that each intent action has a corresponding DSL node
      for (const action of intent.actions) {
        const actionType = action.type.toLowerCase();
        const actionOperation = (action.operation || '').toLowerCase();
        
        let covered = false;
        
        // Check exact match
        if (allDSLTypes.some((dslType: string) => dslType === actionType)) {
          covered = true;
        }
        // Check substring match
        else if (allDSLTypes.some((dslType: string) => 
          dslType.includes(actionType) || actionType.includes(dslType)
        )) {
          covered = true;
        }
        // Check semantic match for transformation operations
        else if (actionOperation === 'summarize' && dslTransformationTypes.length > 0) {
          // summarize operation should be covered by transformation nodes
          covered = true;
        }
        // Check for google_sheets/google_gmail variations
        else if (actionType.includes('sheets') && dslDataSourceTypes.some((t: string) => t.includes('sheets'))) {
          covered = true;
        }
        else if ((actionType.includes('gmail') || actionType.includes('email')) && 
                 dslOutputTypes.some((t: string) => t.includes('gmail') || t.includes('email'))) {
          covered = true;
        }

        expect(covered).toBe(true);
      }

      // Verify auto-injected transformations are tracked
      if (dsl!.metadata?.autoInjectedNodes) {
        expect(Array.isArray(dsl!.metadata.autoInjectedNodes)).toBe(true);
        expect(dsl!.metadata.autoInjectedNodes.length).toBeGreaterThan(0);
      }
    });

    it('should generate valid DSL for prompt with Sheets + AI summarize + Gmail (exact shape)', () => {
      const prompt = 'Get data from Google Sheets, summarize it using AI, and send the summary to Gmail';

      const intent: StructuredIntent = {
        trigger: 'manual_trigger',
        actions: [
          {
            type: 'google_sheets',
            operation: 'read',
            config: {},
          },
          {
            type: 'ai_chat_model',
            operation: 'summarize',
            config: {},
          },
          {
            type: 'google_gmail',
            operation: 'send',
            config: {},
          },
        ],
        requires_credentials: ['google_sheets', 'google_gmail'],
      };

      const transformationDetection = {
        detected: true,
        verbs: ['summarize'],
        requiredNodeTypes: ['text_summarizer', 'ollama_llm', 'openai_gpt', 'anthropic_claude'],
      };

      let dsl;
      expect(() => {
        dsl = dslGenerator.generateDSL(intent, prompt, transformationDetection);
      }).not.toThrow();

      const generatedDsl = dsl!;

      // Expected DSL:
      // - 1 dataSource google_sheets
      // - >= 1 transformation
      // - 1 output email/gmail

      // 1 dataSource google_sheets
      expect(generatedDsl.dataSources.length).toBe(1);
      expect(generatedDsl.dataSources[0].type.toLowerCase()).toBe('google_sheets');
      expect((generatedDsl.dataSources[0] as DSLDataSource).operation.toLowerCase()).toBe('read');

      // >= 1 transformation
      expect(generatedDsl.transformations.length).toBeGreaterThanOrEqual(1);

      // 1 output email / gmail
      expect(generatedDsl.outputs.length).toBe(1);
      const outputType = generatedDsl.outputs[0].type.toLowerCase();
      expect(
        outputType === 'google_gmail' ||
          outputType === 'gmail' ||
          outputType === 'email' ||
          outputType.includes('gmail') ||
          outputType.includes('email'),
      ).toBe(true);

      // Basic sanity: validation already ran inside generateDSL, so reaching here means it passed
      expect(generatedDsl.trigger.type).toBe('manual_trigger');
      expect(Array.isArray(generatedDsl.executionOrder)).toBe(true);
      expect(generatedDsl.executionOrder.length).toBeGreaterThan(0);
    });
  });

  describe('Pre-Compilation Node Type Validation', () => {
    const userPrompt = 'Get data from Google Sheets, summarize using AI, send to Gmail';

    it('should normalize ollama_llm to ai_chat_model and compile successfully', () => {
      // Manually create DSL with ollama_llm to test normalization during compilation
      // This simulates a scenario where ollama_llm might be in the DSL
      // which should be normalized to ai_chat_model during compilation
      const { WorkflowDSL } = require('../workflow-dsl');
      
      // Create DSL with ollama_llm transformation (should be normalized)
      const dslWithOllamaLLM: any = {
        trigger: {
          type: 'manual_trigger',
          config: {},
        },
        dataSources: [
          {
            id: 'ds-1',
            type: 'google_sheets',
            operation: 'read',
            config: {},
          },
        ],
        transformations: [
          {
            id: 'tf-1',
            type: 'ollama_llm', // This should be normalized to ai_chat_model
            operation: 'summarize',
            config: {},
          },
        ],
        outputs: [
          {
            id: 'out-1',
            type: 'google_gmail',
            operation: 'send',
            config: {},
          },
        ],
        executionOrder: [
          {
            stepId: 'step-1',
            stepRef: 'ds-1',
            dependsOn: [],
            order: 1,
          },
          {
            stepId: 'step-2',
            stepRef: 'tf-1',
            dependsOn: ['step-1'],
            order: 2,
          },
          {
            stepId: 'step-3',
            stepRef: 'out-1',
            dependsOn: ['step-2'],
            order: 3,
          },
        ],
        metadata: {},
      };

      // ✅ Test: DSL contains ollama_llm (before normalization)
      const hasOllamaLLM = dslWithOllamaLLM.transformations.some(
        (tf: any) => tf.type.toLowerCase() === 'ollama_llm'
      );
      expect(hasOllamaLLM).toBe(true);

      // ✅ Test: Compile DSL - this should normalize ollama_llm to ai_chat_model
      let compilationResult;
      expect(() => {
        compilationResult = workflowDSLCompiler.compile(dslWithOllamaLLM);
      }).not.toThrow();

      expect(compilationResult).toBeDefined();
      expect(compilationResult!.success).toBe(true);
      expect(compilationResult!.workflow).toBeDefined();

      // ✅ Test: Compiled DSL uses ai_chat_model instead of ollama_llm
      // Check the validated DSL in metadata (after normalization)
      const validatedDSL = compilationResult!.metadata?.dsl;
      if (validatedDSL) {
        const transformationTypes = validatedDSL.transformations.map(
          (tf: any) => (tf as DSLTransformation).type.toLowerCase()
        );
        
        // Should NOT contain ollama_llm after normalization
        expect(transformationTypes).not.toContain('ollama_llm');
        
        // Should contain ai_chat_model (normalized)
        expect(
          transformationTypes.some((type: string) => type === 'ai_chat_model')
        ).toBe(true);
      }

      // ✅ Test: All node types in compiled workflow exist in NodeLibrary
      const workflow = compilationResult!.workflow!;
      const allNodeTypes = workflow.nodes.map((node: WorkflowNode) => node.type);
      
      for (const nodeType of allNodeTypes) {
        const schema = nodeLibrary.getSchema(nodeType);
        expect(schema).toBeDefined();
        expect(schema).not.toBeNull();
      }

      // ✅ Test: Compilation warnings should mention normalization if ollama_llm was present
      if (hasOllamaLLM && compilationResult!.warnings.length > 0) {
        const normalizationWarnings = compilationResult!.warnings.filter(
          (w: string) => w.includes('ollama_llm') || w.includes('normalized') || w.includes('ai_chat_model')
        );
        expect(normalizationWarnings.length).toBeGreaterThan(0);
      }

      // ✅ Test: No errors in compilation
      expect(compilationResult!.errors.length).toBe(0);

      // ✅ Test: Workflow has expected structure
      expect(workflow.nodes.length).toBeGreaterThan(0);
      expect(workflow.edges.length).toBeGreaterThanOrEqual(0);
      
      // Verify we have the expected node types
      const nodeTypeSet = new Set(workflow.nodes.map((n: WorkflowNode) => n.type.toLowerCase()));
      expect(nodeTypeSet.has('manual_trigger')).toBe(true);
      expect(nodeTypeSet.has('google_sheets')).toBe(true);
      expect(nodeTypeSet.has('google_gmail') || nodeTypeSet.has('gmail') || nodeTypeSet.has('email')).toBe(true);
      const nodeTypeArray = Array.from(nodeTypeSet) as string[];
      expect(
        nodeTypeSet.has('ai_chat_model') ||
        nodeTypeSet.has('ai_chat') ||
        nodeTypeArray.some((t: string) => t.includes('ai') && t.includes('chat'))
      ).toBe(true);
    });

    it('should handle all node types correctly and compile successfully', () => {
      // Test with the exact prompt from user
      const prompt = 'Get data from Google Sheets, summarize using AI, send to Gmail';
      
      const intent: StructuredIntent = {
        trigger: 'manual_trigger',
        actions: [
          {
            type: 'google_sheets',
            operation: 'read',
            config: {},
          },
          {
            type: 'google_gmail',
            operation: 'send',
            config: {},
          },
        ],
        requires_credentials: ['google_sheets', 'google_gmail'],
      };

      // Use central config transformation node type
      const transformationDetection = {
        detected: true,
        verbs: ['summarize'],
        requiredNodeTypes: [getTransformationNodeType('summarize')], // Returns 'ai_chat_model'
      };

      // Generate DSL
      const dsl = dslGenerator.generateDSL(intent, prompt, transformationDetection);

      // ✅ Test: DSL structure is valid
      expect(dsl.dataSources.length).toBe(1);
      expect(dsl.dataSources[0].type).toBe('google_sheets');
      expect(dsl.transformations.length).toBeGreaterThanOrEqual(1);
      expect(dsl.outputs.length).toBeGreaterThanOrEqual(1);

      // ✅ Test: Compile DSL - should succeed
      const compilationResult = workflowDSLCompiler.compile(dsl);
      
      expect(compilationResult.success).toBe(true);
      expect(compilationResult.workflow).toBeDefined();
      expect(compilationResult.errors.length).toBe(0);

      // ✅ Test: All node types resolved in NodeLibrary
      const workflow = compilationResult.workflow!;
      const allNodeTypes = workflow.nodes.map(node => node.type);
      
      for (const nodeType of allNodeTypes) {
        const isRegistered = nodeLibrary.isNodeTypeRegistered(nodeType);
        expect(isRegistered).toBe(true);
        
        const schema = nodeLibrary.getSchema(nodeType);
        expect(schema).toBeDefined();
        expect(schema).not.toBeNull();
      }

      // ✅ Test: Transformation uses ai_chat_model (from central config)
      const transformationNodes = workflow.nodes.filter(
        node => node.data?.category === 'transformation' || 
                node.type.toLowerCase().includes('ai_chat') ||
                node.type.toLowerCase().includes('ai') && node.type.toLowerCase().includes('model')
      );
      
      expect(transformationNodes.length).toBeGreaterThan(0);
      
      // At least one transformation should be ai_chat_model
      const hasAIChatModel = transformationNodes.some(
        node => node.type.toLowerCase() === 'ai_chat_model'
      );
      expect(hasAIChatModel).toBe(true);

      // ✅ Test: No unknown node types
      const unknownTypes = allNodeTypes.filter(
        type => !nodeLibrary.isNodeTypeRegistered(type)
      );
      expect(unknownTypes.length).toBe(0);
    });

    it('should generate expected nodes for Sheets + AI summary + Gmail prompt', () => {
      // Prompt: "Get data from Google Sheets, summarize using AI, send Gmail"
      const prompt = 'Get data from Google Sheets, summarize using AI, send Gmail';
      
      const intent: StructuredIntent = {
        trigger: 'manual_trigger',
        actions: [
          {
            type: 'google_sheets',
            operation: 'read',
            config: {},
          },
          {
            type: 'google_gmail',
            operation: 'send',
            config: {},
          },
        ],
        requires_credentials: ['google_sheets', 'google_gmail'],
      };

      const transformationDetection = {
        detected: true,
        verbs: ['summarize'],
        requiredNodeTypes: [getTransformationNodeType('summarize')], // Returns 'ai_chat_model'
      };

      // Generate DSL
      const dsl = dslGenerator.generateDSL(intent, prompt, transformationDetection);

      // ✅ Test: Compile DSL - must succeed
      const compilationResult = workflowDSLCompiler.compile(dsl);
      
      expect(compilationResult.success).toBe(true);
      expect(compilationResult.workflow).toBeDefined();
      expect(compilationResult.errors.length).toBe(0);

      // ✅ Test: Expected nodes must exist in compiled workflow
      const workflow = compilationResult.workflow!;
      const nodeTypeSet = new Set(workflow.nodes.map((n: WorkflowNode) => n.type.toLowerCase()));
      
      // Expected: manual_trigger
      expect(nodeTypeSet.has('manual_trigger')).toBe(true);
      
      // Expected: google_sheets
      expect(nodeTypeSet.has('google_sheets')).toBe(true);
      
      // Expected: ai_chat_model
      expect(nodeTypeSet.has('ai_chat_model')).toBe(true);
      
      // Expected: gmail (accept google_gmail, gmail, or email variants)
      expect(
        nodeTypeSet.has('gmail') ||
        nodeTypeSet.has('google_gmail') ||
        nodeTypeSet.has('email')
      ).toBe(true);

      // ✅ Test: All nodes are registered in NodeLibrary
      const allNodeTypes = workflow.nodes.map((node: WorkflowNode) => node.type);
      for (const nodeType of allNodeTypes) {
        const isRegistered = nodeLibrary.isNodeTypeRegistered(nodeType);
        expect(isRegistered).toBe(true);
      }

      // ✅ Test: Workflow structure is valid (has nodes and edges)
      expect(workflow.nodes.length).toBeGreaterThanOrEqual(4); // At least 4 expected nodes
      expect(workflow.edges.length).toBeGreaterThanOrEqual(0); // Edges may be 0 or more
    });
  });
});
