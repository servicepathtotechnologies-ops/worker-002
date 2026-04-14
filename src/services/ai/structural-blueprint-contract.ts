export interface StructuralBlueprintContract {
  architectureOrder: string[];
  branchingRules: string[];
  dataFlowMap: string[];
  fieldOwnershipPlan: string[];
  validationChecks: string[];
}

const REQUIRED_HEADERS = [
  'ARCHITECTURE_ORDER',
  'BRANCHING_RULES',
  'DATA_FLOW_MAP',
  'FIELD_OWNERSHIP_PLAN',
  'VALIDATION_CHECKS',
] as const;

type HeaderName = typeof REQUIRED_HEADERS[number];

function normalizeLine(line: string): string {
  return line.replace(/^\s*[-*]\s*/, '').trim();
}

function isBranchingNone(lines: string[]): boolean {
  return lines.length === 1 && normalizeLine(lines[0]).toLowerCase() === 'none';
}

export function parseStructuralBlueprintContract(raw: string): StructuralBlueprintContract | null {
  const text = String(raw || '').trim();
  if (!text) return null;

  const lines = text.split(/\r?\n/);
  const byHeader = new Map<HeaderName, string[]>();
  let current: HeaderName | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const header = REQUIRED_HEADERS.find((h) => trimmed === `${h}:`) || null;
    if (header) {
      current = header;
      if (!byHeader.has(header)) byHeader.set(header, []);
      continue;
    }
    if (!current) continue;
    if (!trimmed) continue;
    byHeader.get(current)!.push(trimmed);
  }

  for (const h of REQUIRED_HEADERS) {
    const section = byHeader.get(h);
    if (!section || section.length === 0) {
      return null;
    }
  }

  const architectureOrder = byHeader.get('ARCHITECTURE_ORDER')!.map(normalizeLine).filter(Boolean);
  const branchingRules = byHeader.get('BRANCHING_RULES')!.map(normalizeLine).filter(Boolean);
  const dataFlowMap = byHeader.get('DATA_FLOW_MAP')!.map(normalizeLine).filter(Boolean);
  const fieldOwnershipPlan = byHeader.get('FIELD_OWNERSHIP_PLAN')!.map(normalizeLine).filter(Boolean);
  const validationChecks = byHeader.get('VALIDATION_CHECKS')!.map(normalizeLine).filter(Boolean);

  if (architectureOrder.length < 2) return null;
  if (!isBranchingNone(branchingRules) && branchingRules.length === 0) return null;
  if (dataFlowMap.length === 0) return null;
  if (fieldOwnershipPlan.length === 0) return null;
  if (validationChecks.length === 0) return null;

  return {
    architectureOrder,
    branchingRules,
    dataFlowMap,
    fieldOwnershipPlan,
    validationChecks,
  };
}

