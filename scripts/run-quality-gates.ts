import fs from 'node:fs';
import path from 'node:path';
import { applyDeterministicFieldContracts } from '../src/core/execution/field-contract-engine';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function checkNodeVersion(): void {
  const major = Number(process.versions.node.split('.')[0]);
  assert(Number.isFinite(major), 'Unable to parse Node.js version');
  // Long-term baseline gate for reproducible local/CI behavior.
  assert(major >= 20, `Node.js ${process.version} is too old. Use Node 20+.`);
}

function checkFieldContracts(): void {
  const repaired = applyDeterministicFieldContracts(
    { operation: 'read', range: 'Planned workflow for: read and summarize' },
    {
      nodeType: 'google_sheets',
      userIntent: 'read sheet and summarize rows',
      upstreamPayload: {},
      config: {},
      inputSchema: {},
    }
  );
  assert(repaired.resolvedInputs.range === 'A1:Z1000', 'google_sheets range contract repair failed');

  const aiFallback = applyDeterministicFieldContracts(
    {},
    {
      nodeType: 'ai_chat_model',
      userIntent: 'summarize content',
      upstreamPayload: { text: 'Example row data' },
      config: {},
      inputSchema: {},
    }
  );
  assert(typeof aiFallback.resolvedInputs.prompt === 'string', 'AI node prompt fallback contract failed');
}

function checkEnvTemplateSanitized(): void {
  const envPath = path.resolve(__dirname, '../env.example');
  const content = fs.readFileSync(envPath, 'utf8');
  const forbiddenSecretPatterns = [
    /AIza[0-9A-Za-z\-_]{20,}/,
    /eyJ[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}/,
    /secret_[A-Za-z0-9]{8,}/,
    /Supabase%40123/i,
    /nvrrqvlqnnvlihtlgmzn\.db\.co/i,
  ];
  for (const pattern of forbiddenSecretPatterns) {
    assert(!pattern.test(content), `env.example appears to contain a secret-like value matching ${pattern}`);
  }
}

function main(): void {
  checkNodeVersion();
  checkFieldContracts();
  checkEnvTemplateSanitized();
  console.log('[QualityGates] ✅ All quality gates passed');
}

main();

