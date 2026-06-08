import {
  ErrorCode,
  createError,
  isRecoverableError,
  type StructuredError,
} from '../error-codes';

describe('ErrorCode enum', () => {
  it('contains graph error codes', () => {
    expect(ErrorCode.GRAPH_PARSE_ERROR).toBe('GRAPH_PARSE_ERROR');
    expect(ErrorCode.GRAPH_INVALID_STRUCTURE).toBe('GRAPH_INVALID_STRUCTURE');
    expect(ErrorCode.GRAPH_DUPLICATE_NODE_ID).toBe('GRAPH_DUPLICATE_NODE_ID');
    expect(ErrorCode.GRAPH_INVALID_EDGE_REFERENCE).toBe('GRAPH_INVALID_EDGE_REFERENCE');
  });

  it('contains node error codes', () => {
    expect(ErrorCode.NODE_SCHEMA_INVALID).toBe('NODE_SCHEMA_INVALID');
    expect(ErrorCode.NODE_TYPE_UNKNOWN).toBe('NODE_TYPE_UNKNOWN');
    expect(ErrorCode.NODE_MISSING_REQUIRED_FIELD).toBe('NODE_MISSING_REQUIRED_FIELD');
  });

  it('contains input error codes', () => {
    expect(ErrorCode.MISSING_INPUT).toBe('MISSING_INPUT');
    expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
    expect(ErrorCode.INPUT_CREDENTIAL_FIELD_REJECTED).toBe('INPUT_CREDENTIAL_FIELD_REJECTED');
  });

  it('contains credential error codes', () => {
    expect(ErrorCode.MISSING_CREDENTIAL).toBe('MISSING_CREDENTIAL');
    expect(ErrorCode.CREDENTIAL_INJECTION_FAILED).toBe('CREDENTIAL_INJECTION_FAILED');
    expect(ErrorCode.OAUTH_NOT_CONNECTED).toBe('OAUTH_NOT_CONNECTED');
    expect(ErrorCode.GOOGLE_AUTH_REQUIRED).toBe('GOOGLE_AUTH_REQUIRED');
  });

  it('contains workflow error codes', () => {
    expect(ErrorCode.WORKFLOW_NOT_FOUND).toBe('WORKFLOW_NOT_FOUND');
    expect(ErrorCode.WORKFLOW_ALREADY_EXECUTING).toBe('WORKFLOW_ALREADY_EXECUTING');
    expect(ErrorCode.WORKFLOW_VALIDATION_FAILED).toBe('WORKFLOW_VALIDATION_FAILED');
  });

  it('contains execution error codes', () => {
    expect(ErrorCode.EXECUTION_FAILED).toBe('EXECUTION_FAILED');
    expect(ErrorCode.EXECUTION_MISSING_CREDENTIALS).toBe('EXECUTION_MISSING_CREDENTIALS');
    expect(ErrorCode.RUN_ALREADY_ACTIVE).toBe('RUN_ALREADY_ACTIVE');
    expect(ErrorCode.EXECUTION_TIMEOUT).toBe('EXECUTION_TIMEOUT');
  });

  it('contains topology mutation guard codes', () => {
    expect(ErrorCode.TOPOLOGY_MUTATION_BLOCKED_CONFIGURING_INPUTS).toBe(
      'TOPOLOGY_MUTATION_BLOCKED_CONFIGURING_INPUTS'
    );
    expect(ErrorCode.TOPOLOGY_MUTATION_BLOCKED_ATTACH_CREDENTIALS).toBe(
      'TOPOLOGY_MUTATION_BLOCKED_ATTACH_CREDENTIALS'
    );
  });
});

describe('createError', () => {
  it('returns object with code and message', () => {
    const err = createError(ErrorCode.INTERNAL_ERROR, 'something broke');
    expect(err.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(err.message).toBe('something broke');
  });

  it('sets recoverable to false by default', () => {
    const err = createError(ErrorCode.BAD_REQUEST, 'bad');
    expect(err.recoverable).toBe(false);
  });

  it('sets recoverable to true when specified', () => {
    const err = createError(ErrorCode.EXECUTION_TIMEOUT, 'timeout', undefined, true);
    expect(err.recoverable).toBe(true);
  });

  it('populates details when provided', () => {
    const details = { field: 'email', value: null };
    const err = createError(ErrorCode.MISSING_INPUT, 'missing field', details);
    expect(err.details).toEqual(details);
  });

  it('leaves details undefined when not provided', () => {
    const err = createError(ErrorCode.UNAUTHORIZED, 'not allowed');
    expect(err.details).toBeUndefined();
  });

  it('returns a plain StructuredError object (not a class instance)', () => {
    const err = createError(ErrorCode.INTERNAL_ERROR, 'test');
    expect(Object.keys(err)).toEqual(
      expect.arrayContaining(['code', 'message', 'recoverable'])
    );
  });
});

describe('isRecoverableError', () => {
  it('returns true when recoverable is true', () => {
    const err: StructuredError = {
      code: ErrorCode.EXECUTION_TIMEOUT,
      message: 'timeout',
      recoverable: true,
    };
    expect(isRecoverableError(err)).toBe(true);
  });

  it('returns false when recoverable is false', () => {
    const err: StructuredError = {
      code: ErrorCode.GRAPH_PARSE_ERROR,
      message: 'parse error',
      recoverable: false,
    };
    expect(isRecoverableError(err)).toBe(false);
  });

  it('returns false when recoverable is undefined', () => {
    const err: StructuredError = {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'unknown',
    };
    expect(isRecoverableError(err)).toBe(false);
  });

  it('round-trips through createError with recoverable=true', () => {
    const err = createError(ErrorCode.MISSING_CREDENTIAL, 'no creds', undefined, true);
    expect(isRecoverableError(err)).toBe(true);
  });

  it('round-trips through createError with default recoverable (false)', () => {
    const err = createError(ErrorCode.WORKFLOW_NOT_FOUND, 'not found');
    expect(isRecoverableError(err)).toBe(false);
  });
});
