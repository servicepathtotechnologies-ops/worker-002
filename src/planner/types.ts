export type TriggerType = 'manual' | 'schedule' | 'webhook' | 'event';

export interface WorkflowSpec {
  trigger: TriggerType;
  data_sources: string[];
  actions: string[];
  storage: string[];
  transformations: string[];
  mentioned_only: string[];
  entities: string[];
  fields: string[];
  clarifications: string[];
}

export interface PlannerResult {
  spec: WorkflowSpec;
  rawResponse: string;
}

