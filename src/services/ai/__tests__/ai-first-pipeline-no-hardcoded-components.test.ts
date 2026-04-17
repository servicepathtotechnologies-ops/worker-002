// Feature: intelligent-workflow-generation-pipeline
// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 9.1, 9.3

import * as fs from 'fs';
import * as path from 'path';

const WORKER_SRC = path.resolve(__dirname, '../../..');
const AI_SRC = path.resolve(__dirname, '..');
const STAGES_SRC = path.resolve(__dirname, '../stages');
const PIPELINE_SRC = path.resolve(__dirname, '../pipeline');
const API_SRC = path.resolve(__dirname, '../../../api');

// ─── Generation path files ────────────────────────────────────────────────────

const GENERATION_PATH_FILES: Record<string, string> = {
  'generate-workflow.ts': path.join(API_SRC, 'generate-workflow.ts'),
  'workflow-generation-pipeline.ts': path.join(PIPELINE_SRC, 'workflow-generation-pipeline.ts'),
  'intent-stage.ts': path.join(STAGES_SRC, 'intent-stage.ts'),
  'node-selection-stage.ts': path.join(STAGES_SRC, 'node-selection-stage.ts'),
  'edge-reasoning-stage.ts': path.join(STAGES_SRC, 'edge-reasoning-stage.ts'),
  'validation-stage.ts': path.join(STAGES_SRC, 'validation-stage.ts'),
  'system-prompt-builder.ts': path.join(AI_SRC, 'system-prompt-builder.ts'),
  'node-catalog-builder.ts': path.join(AI_SRC, 'node-catalog-builder.ts'),
};

function readGenerationFile(name: string): string {
  const filePath = GENERATION_PATH_FILES[name];
  if (!fs.existsSync(filePath)) {
    throw new Error(`Generation path file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

// ─── 1. Deleted files are gone ────────────────────────────────────────────────

describe('1. Deleted files are gone (Requirements 7.1, 7.2, 7.3, 7.4)', () => {
  it('workflow-pipeline-orchestrator.ts does not exist', () => {
    const filePath = path.join(AI_SRC, 'workflow-pipeline-orchestrator.ts');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('WORKFLOW_GENERATION_SYSTEM_PROMPT.md does not exist', () => {
    const filePath = path.join(AI_SRC, 'WORKFLOW_GENERATION_SYSTEM_PROMPT.md');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('WORKFLOW_PLANNING_SYSTEM_PROMPT.md does not exist', () => {
    const filePath = path.join(AI_SRC, 'WORKFLOW_PLANNING_SYSTEM_PROMPT.md');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('ULTIMATE_WORKFLOW_SYSTEM_PROMPT.md does not exist', () => {
    const filePath = path.join(AI_SRC, 'ULTIMATE_WORKFLOW_SYSTEM_PROMPT.md');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('FINAL_WORKFLOW_SYSTEM_PROMPT.md does not exist', () => {
    const filePath = path.join(AI_SRC, 'FINAL_WORKFLOW_SYSTEM_PROMPT.md');
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

// ─── 2. No import references to deleted components ────────────────────────────

describe('2. No import references to deleted components in generation path (Requirements 7.1, 7.4)', () => {
  const FORBIDDEN_IMPORTS = [
    'workflow-pipeline-orchestrator',
    'WorkflowPipelineOrchestrator',
    'WORKFLOW_GENERATION_SYSTEM_PROMPT',
    'WORKFLOW_PLANNING_SYSTEM_PROMPT',
    'ULTIMATE_WORKFLOW_SYSTEM_PROMPT',
    'FINAL_WORKFLOW_SYSTEM_PROMPT',
  ];

  for (const [fileName] of Object.entries(GENERATION_PATH_FILES)) {
    for (const forbidden of FORBIDDEN_IMPORTS) {
      it(`${fileName} does not import "${forbidden}"`, () => {
        const source = readGenerationFile(fileName);
        expect(source).not.toContain(forbidden);
      });
    }
  }
});

// ─── 3. No node.type switch/if patterns in generation path ────────────────────

describe('3. No if(node.type===) or switch(node.type) patterns in generation path (Requirements 7.1, 7.2, 7.3)', () => {
  const NODE_TYPE_IF_PATTERN = /if.*node\.type.*===/;
  const NODE_TYPE_SWITCH_PATTERN = /switch.*node\.type/;

  for (const [fileName] of Object.entries(GENERATION_PATH_FILES)) {
    it(`${fileName} has no "if (node.type === ...)" pattern`, () => {
      const source = readGenerationFile(fileName);
      expect(NODE_TYPE_IF_PATTERN.test(source)).toBe(false);
    });

    it(`${fileName} has no "switch (node.type)" pattern`, () => {
      const source = readGenerationFile(fileName);
      expect(NODE_TYPE_SWITCH_PATTERN.test(source)).toBe(false);
    });
  }
});

// ─── 4. No keyword filter in node selection path ──────────────────────────────

describe('4. No keyword filter in node selection path (Requirement 7.1)', () => {
  it('node-selection-stage.ts does not reference keyword-node-selector', () => {
    const source = readGenerationFile('node-selection-stage.ts');
    expect(source).not.toContain('keyword-node-selector');
  });

  it('node-selection-stage.ts does not reference enhanced-keyword-matcher', () => {
    const source = readGenerationFile('node-selection-stage.ts');
    expect(source).not.toContain('enhanced-keyword-matcher');
  });

  it('node-selection-stage.ts does not reference keywordVariations', () => {
    const source = readGenerationFile('node-selection-stage.ts');
    expect(source).not.toContain('keywordVariations');
  });

  it('node-selection-stage.ts does not reference KeywordFilter', () => {
    const source = readGenerationFile('node-selection-stage.ts');
    expect(source).not.toContain('KeywordFilter');
  });
});

// ─── 5. No topological sort in edge reasoning path ────────────────────────────

describe('5. No topological sort in edge reasoning path (Requirement 7.2)', () => {
  it('edge-reasoning-stage.ts does not reference getTopologicalOrder', () => {
    const source = readGenerationFile('edge-reasoning-stage.ts');
    expect(source).not.toContain('getTopologicalOrder');
  });

  it('edge-reasoning-stage.ts does not reference topologicalSort', () => {
    const source = readGenerationFile('edge-reasoning-stage.ts');
    expect(source).not.toContain('topologicalSort');
  });

  it('edge-reasoning-stage.ts does not import execution-order-enforcer', () => {
    const source = readGenerationFile('edge-reasoning-stage.ts');
    expect(source).not.toContain('execution-order-enforcer');
  });
});

// ─── 6. No hardcoded validation rules in validation path ─────────────────────

describe('6. No hardcoded validation rules in validation path (Requirement 7.3)', () => {
  it('validation-stage.ts does not reference Registry_Contract_Validator', () => {
    const source = readGenerationFile('validation-stage.ts');
    expect(source).not.toContain('Registry_Contract_Validator');
  });

  it('validation-stage.ts does not reference RegistryContractValidator', () => {
    const source = readGenerationFile('validation-stage.ts');
    expect(source).not.toContain('RegistryContractValidator');
  });

  it('validation-stage.ts does not contain hardcoded validation pattern', () => {
    const source = readGenerationFile('validation-stage.ts');
    expect(/hardcoded.*validation/i.test(source)).toBe(false);
  });
});

// ─── 7. generate-workflow.ts uses WorkflowGenerationPipeline directly ────────

describe('7. generate-workflow.ts uses WorkflowGenerationPipeline directly (Requirements 9.1, 9.3)', () => {
  it('contains WorkflowGenerationPipeline', () => {
    const source = readGenerationFile('generate-workflow.ts');
    expect(source).toContain('WorkflowGenerationPipeline');
  });

  it('does not contain WorkflowPipelineOrchestrator', () => {
    const source = readGenerationFile('generate-workflow.ts');
    expect(source).not.toContain('WorkflowPipelineOrchestrator');
  });

  it('does not contain ENABLE_AI_FIRST_PIPELINE feature flag', () => {
    const source = readGenerationFile('generate-workflow.ts');
    expect(source).not.toContain('ENABLE_AI_FIRST_PIPELINE');
  });

  it('does not contain conditional pipeline selection', () => {
    const source = readGenerationFile('generate-workflow.ts');
    expect(/if\s*\(.*pipeline/i.test(source)).toBe(false);
  });
});
