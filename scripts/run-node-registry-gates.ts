/**
 * Exit 1 if registry gate violations exist (for CI / pre-commit).
 */
import { formatGateViolations, runNodeRegistryGates } from '../src/core/utils/node-registry-gates';

const v = runNodeRegistryGates();
if (v.length > 0) {
  console.error(formatGateViolations(v));
  console.error(`\nTotal: ${v.length} violation(s)`);
  process.exit(1);
}
console.log(formatGateViolations(v));
process.exit(0);
