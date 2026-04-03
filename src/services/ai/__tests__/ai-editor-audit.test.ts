import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logAiEditorEvent, readAiEditorAuditForWorkflow } from '../ai-editor-audit';

describe('ai-editor-audit', () => {
  const prevDir = process.env.AI_EDITOR_AUDIT_LOG_DIR;

  afterEach(() => {
    process.env.AI_EDITOR_AUDIT_LOG_DIR = prevDir;
    if (prevDir === undefined) delete process.env.AI_EDITOR_AUDIT_LOG_DIR;
  });

  test('appends JSONL and can read back by workflowId', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-audit-'));
    process.env.AI_EDITOR_AUDIT_LOG_DIR = tmp;

    logAiEditorEvent({
      action: 'apply',
      userId: 'u1',
      workflowId: 'wf-123',
      operationsSummary: 'add_node',
      validationPassed: true,
    });

    const rows = readAiEditorAuditForWorkflow('wf-123', 10);
    expect(rows.length).toBe(1);
    expect(rows[0].workflowId).toBe('wf-123');
    expect(rows[0].action).toBe('apply');
  });
});
