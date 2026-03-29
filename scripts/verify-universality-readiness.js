/* eslint-disable no-console */
const { spawnSync } = require('child_process');

function runStep(name, command, args, env = {}) {
  console.log(`\n[universality] STEP: ${name}`);
  console.log(`[universality] CMD: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  return result.status === 0;
}

function main() {
  const checks = [
    {
      id: 'type-check',
      name: 'Type safety gate',
      command: 'npm',
      args: ['run', 'type-check'],
    },
    {
      id: 'intent-guards',
      name: 'Lifecycle intent guard regressions',
      command: 'npx',
      args: ['jest', '--coverage=false', 'src/services/__tests__/workflow-lifecycle-intent-guards.test.ts', '--runInBand'],
      env: { NODE_OPTIONS: '--max-old-space-size=8192' },
    },
    {
      id: 'branch-preservation',
      name: 'Branch preservation and switch/case regressions',
      command: 'npx',
      args: [
        'jest',
        '--coverage=false',
        'src/services/ai/__tests__/structured-summary-branching.test.ts',
        'src/services/ai/__tests__/switch-case-plan.test.ts',
        '--runInBand',
      ],
      env: { NODE_OPTIONS: '--max-old-space-size=8192' },
    },
    {
      id: 'entrypoint-authority',
      name: 'Entrypoint plan-chain authority regressions',
      command: 'npx',
      args: ['jest', '--coverage=false', 'src/api/__tests__/generate-workflow-plan-chain.test.ts', '--runInBand'],
      env: { NODE_OPTIONS: '--max-old-space-size=8192' },
    },
  ];

  const results = checks.map((c) => ({
    id: c.id,
    ok: runStep(c.name, c.command, c.args, c.env),
  }));

  console.log('\n[universality] ===== READINESS SUMMARY =====');
  results.forEach((r) => {
    console.log(`[universality] ${r.ok ? 'PASS' : 'FAIL'}: ${r.id}`);
  });

  const allPass = results.every((r) => r.ok);
  console.log(
    `[universality] OVERALL: ${allPass ? 'PASS (hardening gates satisfied)' : 'FAIL (one or more gates failed)'}`
  );

  process.exit(allPass ? 0 : 1);
}

main();
