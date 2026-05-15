/**
 * Type 1 Node Test Fixtures
 *
 * Each fixture defines a synthetic input + config for a node that requires NO external
 * credentials. The test runner calls nodeDef.execute() directly with this data and
 * verifies success + expected output keys.
 *
 * Only nodes that are registered in the unified-node-registry (154 canonical types)
 * and have no credentialSchema are included here.
 */

export interface NodeTestFixture {
  /** Synthetic upstream payload (simulates previous node output) */
  input: unknown;
  /** Minimal valid config the node needs to run */
  config: Record<string, any>;
  /** Whether execute() should return success:true */
  expectSuccess: boolean;
  /** Output keys that must be present when expectSuccess=true */
  expectOutputKeys?: string[];
  /** Human-readable note about what this test verifies */
  description?: string;
}

// Convenience sample text for AI nodes
const SAMPLE_TEXT = 'Artificial intelligence is transforming how businesses operate. ' +
  'Companies are adopting machine learning models to automate repetitive tasks, ' +
  'improve customer service, and analyze large datasets. The pace of adoption is ' +
  'accelerating, with investment in AI startups reaching record highs in 2025.';

export const nodeTestFixtures: Record<string, NodeTestFixture> = {

  // ─── TRIGGER NODES ───────────────────────────────────────────────────────────

  manual_trigger: {
    input: {},
    config: {},
    expectSuccess: true,
    description: 'Trigger with no payload should succeed',
  },

  schedule: {
    input: {},
    config: { cron: '0 9 * * *' },
    expectSuccess: true,
    description: 'Valid cron expression should succeed',
  },

  interval: {
    input: {},
    config: { interval: 1, unit: 'seconds' },
    expectSuccess: true,
  },

  chat_trigger: {
    input: { message: 'Hello!', userId: 'u_test_001' },
    config: {},
    expectSuccess: true,
    expectOutputKeys: ['message'],
  },

  error_trigger: {
    input: { error: 'Something went wrong', code: 'ERR_001', nodeId: 'n_prev' },
    config: {},
    expectSuccess: true,
    expectOutputKeys: ['error_message'],
    description: 'error_trigger outputs error_message, not error',
  },

  workflow_trigger: {
    input: { parentWorkflowId: 'wf_parent_001', payload: { userId: 'u1' } },
    config: {},
    expectSuccess: true,
    description: 'workflow_trigger passes through — no specific output keys enforced',
  },

  form: {
    input: { name: 'Alice', email: 'alice@example.com' },
    config: {
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
      ],
    },
    expectSuccess: true,
    description: 'form trigger passes through — output depends on runtime form submission',
  },

  whatsapp_trigger: {
    input: { from: '+15555555555', body: 'Hi there', messageId: 'wamid.001' },
    config: {},
    expectSuccess: true,
    expectOutputKeys: ['triggered'],
    description: 'whatsapp_trigger outputs triggered flag',
  },

  instagram_trigger: {
    input: { sender_id: 'ig_user_001', text: 'Hello Instagram', timestamp: Date.now() },
    config: {},
    expectSuccess: true,
    expectOutputKeys: ['triggered'],
    description: 'instagram_trigger outputs triggered flag',
  },

  // ─── LOGIC / CONTROL FLOW NODES ─────────────────────────────────────────────

  if_else: {
    input: { age: 25 },
    config: {
      conditions: [{ field: '$json.age', operator: 'greater_than_or_equal', value: 18 }],
    },
    expectSuccess: true,
    expectOutputKeys: ['condition_result'],
    description: 'age 25 >= 18 should be true; output key is condition_result (snake_case)',
  },

  switch: {
    input: { status: 'active' },
    config: {
      expression: '$json.status',
      cases: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }],
    },
    expectSuccess: true,
    expectOutputKeys: ['matchedCase'],
  },

  filter: {
    input: [{ age: 25 }, { age: 15 }, { age: 30 }],
    config: { conditions: [{ field: '$json.age', operator: 'greater_than_or_equal', value: 18 }] },
    expectSuccess: true,
    description: 'filter runs without crashing; actual filtered output depends on runtime',
  },

  loop: {
    input: { items: [1, 2, 3] },
    config: { items: '{{$json.items}}' },
    expectSuccess: true,
    expectOutputKeys: ['loop'],
    description: 'loop outputs a loop object, not individual item/index',
  },

  split_in_batches: {
    input: [1, 2, 3, 4, 5],
    config: { batchSize: 2 },
    expectSuccess: true,
    expectOutputKeys: ['batches', 'totalBatches'],
  },

  merge: {
    input: [{ a: 1 }, { b: 2 }],
    config: { mode: 'mergeByIndex' },
    expectSuccess: true,
    description: 'merge runs without crashing',
  },

  merge_data: {
    input: { x: 1 },
    config: { fields: [{ name: 'y', value: '2' }] },
    expectSuccess: true,
    expectOutputKeys: ['x'],
    description: 'merge_data is a passthrough — input data flows through unchanged',
  },

  wait: {
    input: { msg: 'hello' },
    config: { duration: 0, unit: 'milliseconds' },
    expectSuccess: true,
    expectOutputKeys: ['msg'],
    description: 'wait passes through input data unchanged',
  },

  noop: {
    input: { x: 42, label: 'test' },
    config: {},
    expectSuccess: true,
    expectOutputKeys: ['x'],
    description: 'noop passes through input data unchanged',
  },

  stop_and_error: {
    input: {},
    config: { message: 'Test stop error', errorCode: 'TEST_STOP' },
    expectSuccess: false,
    description: 'stop_and_error intentionally fails — verify it returns an error',
  },

  error_handler: {
    input: { _error: 'Something failed', _errorCode: 'ERR_500', _nodeType: 'http_request' },
    config: {},
    expectSuccess: true,
    expectOutputKeys: ['handled'],
    description: 'error_handler marks the error as handled',
  },

  // ─── DATA MANIPULATION NODES ─────────────────────────────────────────────────

  set: {
    input: { x: 1 },
    config: { fields: [{ name: 'y', value: '42' }] },
    expectSuccess: true,
    expectOutputKeys: ['y'],
    description: 'set adds field y=42 to the input object',
  },

  set_variable: {
    input: { name: 'Alice' },
    config: { values: [{ name: 'greeting', value: 'Hello {{$json.name}}' }] },
    expectSuccess: true,
    expectOutputKeys: ['greeting'],
    description: 'set_variable resolves {{$json.name}} and adds greeting to output',
  },

  edit_fields: {
    input: { firstName: 'Alice', lastName: 'Smith' },
    config: { fields: [{ name: 'fullName', value: '{{$json.firstName}} {{$json.lastName}}' }] },
    expectSuccess: true,
    expectOutputKeys: ['fullName'],
    description: 'edit_fields maps firstName+lastName to fullName',
  },

  rename_keys: {
    input: { old_key: 'value123' },
    config: { mappings: [{ name: 'old_key', value: 'new_key' }] },
    expectSuccess: true,
    expectOutputKeys: ['new_key'],
    description: 'rename_keys renames old_key to new_key; old_key should be absent',
  },

  aggregate: {
    input: { items: [{ val: 10 }, { val: 20 }, { val: 30 }] },
    config: { field: 'val', operation: 'sum' },
    expectSuccess: true,
    expectOutputKeys: ['aggregate'],
    description: 'aggregate sums val field; result is in output.aggregate (= 60)',
  },

  sort: {
    input: [{ n: 3 }, { n: 1 }, { n: 2 }],
    config: { field: 'n', direction: 'asc' },
    expectSuccess: true,
    description: 'sort runs without crashing; returns sorted items',
  },

  limit: {
    input: [1, 2, 3, 4, 5],
    config: { count: 3 },
    expectSuccess: true,
    description: 'limit runs without crashing; returns at most 3 items',
  },

  function: {
    input: { x: 5 },
    config: { code: 'return { doubled: $json.x * 2 };' },
    expectSuccess: true,
    expectOutputKeys: ['doubled'],
  },

  function_item: {
    input: [{ x: 1 }, { x: 2 }],
    config: { code: 'return { ...item, y: item.x + 1 };' },
    expectSuccess: true,
  },

  javascript: {
    input: { name: 'Bob' },
    config: { code: 'return { greeting: "Hi " + $json.name };' },
    expectSuccess: true,
    expectOutputKeys: ['greeting'],
  },

  json_parser: {
    input: {},
    config: { json: '{"key":"val","num":42}' },
    expectSuccess: true,
    description: 'json_parser expects raw json in config.json field, not a field reference',
  },

  csv: {
    input: { raw: 'name,age\nAlice,30\nBob,25' },
    config: { field: 'raw', operation: 'parse' },
    expectSuccess: true,
    expectOutputKeys: ['items'],
    description: 'csv parse produces an items array',
  },

  xml: {
    input: {},
    config: { xml: '<root><name>Alice</name><age>30</age></root>', operation: 'parse' },
    expectSuccess: true,
    expectOutputKeys: ['data'],
    description: 'xml expects raw xml in config.xml field; output is {data: parsed_object}',
  },

  text_formatter: {
    input: { name: 'Alice', orderId: '1234' },
    config: { template: 'Order #{{$json.orderId}} for {{$json.name}}' },
    expectSuccess: true,
    description: 'text_formatter returns a formatted string (not an object with result key)',
  },

  math: {
    input: {},
    config: { value1: '6', value2: '2', operation: 'add' },
    expectSuccess: true,
    expectOutputKeys: ['result'],
    description: 'math adds 6+2=8; result is in output.result (config keys are value1/value2, not a/b)',
  },

  // ─── UTILITY NODES ───────────────────────────────────────────────────────────

  date_time: {
    input: {},
    config: { operation: 'now', format: 'ISO' },
    expectSuccess: true,
    expectOutputKeys: ['datetime'],
  },

  read_binary_file: {
    input: {},
    config: { filePath: 'package.json' },
    expectSuccess: true,
    description: 'reads package.json which exists in the worker directory',
  },

  write_binary_file: {
    input: { data: 'dGVzdA==' },
    config: { filePath: 'test_output_fixture.txt', content: 'ctrlchecks fixture test' },
    expectSuccess: true,
    description: 'writes a test file to the worker directory',
  },

  respond_to_webhook: {
    input: { message: 'ok' },
    config: { statusCode: 200, body: { ok: true }, headers: { 'Content-Type': 'application/json' } },
    expectSuccess: true,
    description: 'respond_to_webhook runs — statusCode in output depends on execution context',
  },

  http_request: {
    input: {},
    config: { url: 'https://httpbin.org/get', method: 'GET', headers: {}, qs: {} },
    expectSuccess: true,
    description: 'http_request makes a real GET to httpbin.org',
  },

  // ─── AI / INTERNAL AI NODES ──────────────────────────────────────────────────

  text_summarizer: {
    input: { text: SAMPLE_TEXT },
    config: { maxLength: 100 },
    expectSuccess: true,
    expectOutputKeys: ['response'],
    description: 'text_summarizer returns {response, text, model} — key is response not summary',
  },

  sentiment_analyzer: {
    input: { text: 'I absolutely love this product! It works perfectly.' },
    config: {},
    expectSuccess: true,
    expectOutputKeys: ['response'],
    description: 'sentiment_analyzer returns {response, text, model} — sentiment is inside response JSON',
  },

  memory: {
    input: {},
    config: { operation: 'set', key: 'test_mem', value: 'hello' },
    expectSuccess: true,
    expectOutputKeys: ['sessionId'],
    description: 'memory node initializes a session and returns sessionId',
  },

  chat_model: {
    input: {},
    config: { message: 'Say hello', maxTokens: 20 },
    expectSuccess: true,
    expectOutputKeys: ['_chat_model_config'],
    description: 'chat_model in isolation returns its config as _chat_model_config (used by ai_agent)',
  },

  ai_agent: {
    input: { userInput: 'Reply with just the word: pong' },
    config: { maxTokens: 20, systemPrompt: 'You are a concise assistant. Reply only with what is asked.' },
    expectSuccess: true,
    expectOutputKeys: ['response_text'],
    description: 'ai_agent uses GEMINI_API_KEY from env; outputs response_text (no explicit apiKey needed)',
  },

  // ─── OUTPUT NODES ────────────────────────────────────────────────────────────

  log_output: {
    input: { event: 'test_event', userId: 'u_001' },
    config: { level: 'info', message: 'Test log entry from fixture' },
    expectSuccess: true,
    description: 'log_output returns the formatted log string (not an object with logged key)',
  },

};

/**
 * Returns all Type 1 node types that have fixtures defined.
 */
export function getType1NodeTypesWithFixtures(): string[] {
  return Object.keys(nodeTestFixtures);
}
