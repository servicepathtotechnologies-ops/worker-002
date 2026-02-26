import { WorkflowNode } from '../builder/graphBuilder';

export interface FieldQuestion {
  nodeId: string;
  field: string;
  askOrder: number;
  required: boolean;
  dependsOn?: string;
  example?: string;
}

export interface QuestionPlan {
  questions: FieldQuestion[];
}

// Very small demo catalog of field requirements
const NODE_FIELD_DEFINITIONS: Record<
  string,
  Array<Omit<FieldQuestion, 'nodeId'>>
> = {
  'google_sheets.read': [
    { field: 'sheet_id', askOrder: 1, required: true, example: '1abc123...' },
    { field: 'range', askOrder: 2, required: true, example: 'Sheet1!A:C' },
  ],
  'hubspot.create_contact': [
    { field: 'email', askOrder: 1, required: true, example: 'user@example.com' },
    { field: 'first_name', askOrder: 2, required: false, example: 'Jane' },
    { field: 'last_name', askOrder: 3, required: false, example: 'Doe' },
  ],
};

export function buildQuestionPlan(nodes: WorkflowNode[]): QuestionPlan {
  const questions: FieldQuestion[] = [];

  for (const node of nodes) {
    const key = `${node.type}.${node.operation}`;
    const defs = NODE_FIELD_DEFINITIONS[key];
    if (!defs) continue;

    for (const def of defs) {
      questions.push({
        nodeId: node.id,
        field: def.field,
        askOrder: def.askOrder,
        required: def.required,
        dependsOn: def.dependsOn,
        example: def.example,
      });
    }
  }

  questions.sort((a, b) => a.askOrder - b.askOrder);

  return { questions };
}

export default {
  buildQuestionPlan,
};

