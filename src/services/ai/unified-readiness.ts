type BlockingReasonCode =
  | 'structural_unresolved'
  | 'credential_missing'
  | 'ownership_selection_required';

export interface UnifiedReadiness {
  phase: string;
  structuralUnresolved: Array<{ kind: string; message: string; nodeId?: string; fieldName?: string }>;
  valueFields: Array<{
    id: string;
    nodeId?: string;
    nodeType?: string;
    nodeLabel?: string;
    fieldName?: string;
    required?: boolean;
    fillModeDefault?: string;
    supportsRuntimeAI?: boolean;
    ownershipClass?: string;
  }>;
  credentials: {
    missing: Array<Record<string, any>>;
    satisfied: Array<Record<string, any>>;
  };
  blockingReasons: Array<{ code: BlockingReasonCode; message: string; count?: number }>;
  summary: {
    unresolvedStructuralCount: number;
    valueFieldCount: number;
    missingCredentialCount: number;
    blockingCount: number;
  };
}

function toArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function buildUnifiedReadiness(params: {
  phase: string;
  structuralDiagnostics?: { errors?: string[]; warnings?: string[]; unresolved?: Array<any> };
  comprehensiveQuestions?: Array<any>;
  discoveredCredentials?: Array<any>;
  credentialStatuses?: Array<any>;
}): UnifiedReadiness {
  const structuralErrors = toArray<string>(params.structuralDiagnostics?.errors);
  const structuralUnresolvedFromDiag = toArray<any>(params.structuralDiagnostics?.unresolved).map((u) => ({
    kind: 'missing_structural_value',
    message: `${u?.nodeType || 'node'}:${u?.fieldName || 'field'} unresolved`,
    nodeId: u?.nodeId,
    fieldName: u?.fieldName,
  }));
  const structuralUnresolvedFromErrors = structuralErrors.map((msg) => ({
    kind: 'structural_error',
    message: String(msg),
  }));

  const questions = toArray<any>(params.comprehensiveQuestions);
  const structuralFromQuestions = questions
    .filter((q) => q?.ownershipClass === 'structural')
    .map((q) => ({
      kind: 'structural_question',
      message: `${q?.nodeLabel || q?.nodeId || 'node'}:${q?.fieldName || 'field'}`,
      nodeId: q?.nodeId,
      fieldName: q?.fieldName,
    }));

  const structuralUnresolved = [
    ...structuralUnresolvedFromErrors,
    ...structuralUnresolvedFromDiag,
    ...structuralFromQuestions,
  ];

  const valueFields = questions
    .filter((q) => q?.category !== 'credential' && q?.ownershipClass !== 'credential' && q?.ownershipClass !== 'structural')
    .filter((q) => !(String(q?.nodeType || '').toLowerCase() === 'log_output' && String(q?.fieldName || '').toLowerCase() === 'level'))
    .map((q) => ({
      id: q?.id || `${q?.nodeId || 'node'}_${q?.fieldName || 'field'}`,
      nodeId: q?.nodeId,
      nodeType: q?.nodeType,
      nodeLabel: q?.nodeLabel,
      fieldName: q?.fieldName,
      required: Boolean(q?.required),
      fillModeDefault: q?.fillModeDefault,
      supportsRuntimeAI: q?.supportsRuntimeAI !== false,
      ownershipClass: q?.ownershipClass || 'value',
    }));

  const discoveredCreds = toArray<any>(params.discoveredCredentials);
  const credentialStatuses = toArray<any>(params.credentialStatuses);
  const missingByStatus = credentialStatuses.filter((s) => String(s?.status || '') === 'required_missing');
  const missingFromDiscovery = discoveredCreds.filter((c) => {
    const status = String(c?.status || '').toLowerCase();
    if (status) return status.includes('missing') || status === 'required';
    if (typeof c?.satisfied === 'boolean') return !c.satisfied;
    return true;
  });
  const missingCredentials = missingByStatus.length > 0 ? missingByStatus : missingFromDiscovery;
  const satisfiedCredentials = credentialStatuses.filter((s) => String(s?.status || '') === 'resolved_connected');

  const blockingReasons: UnifiedReadiness['blockingReasons'] = [];
  if (structuralUnresolved.length > 0) {
    blockingReasons.push({
      code: 'structural_unresolved',
      message: 'Structural inputs are incomplete.',
      count: structuralUnresolved.length,
    });
  }
  if (missingCredentials.length > 0) {
    blockingReasons.push({
      code: 'credential_missing',
      message: 'Required credentials are missing.',
      count: missingCredentials.length,
    });
  }
  if (valueFields.length > 0) {
    blockingReasons.push({
      code: 'ownership_selection_required',
      message: 'User must choose ownership for unresolved value fields.',
      count: valueFields.length,
    });
  }

  return {
    phase: params.phase,
    structuralUnresolved,
    valueFields,
    credentials: {
      missing: missingCredentials,
      satisfied: satisfiedCredentials,
    },
    blockingReasons,
    summary: {
      unresolvedStructuralCount: structuralUnresolved.length,
      valueFieldCount: valueFields.length,
      missingCredentialCount: missingCredentials.length,
      blockingCount: blockingReasons.length,
    },
  };
}
