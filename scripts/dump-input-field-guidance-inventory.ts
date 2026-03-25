/**
 * Diagnostic: dump all node input fields with registry help metadata, credential questions, and unified join.
 *
 * Usage:
 *   npx ts-node scripts/dump-input-field-guidance-inventory.ts [--json] [--out-file path.json]
 *
 * Full audit (base JSON + frontend guide preview): from repo root, run worker script then:
 *   cd ctrl_checks && npx tsx scripts/enrich-field-guidance-inventory.ts ../worker/tmp/field-guidance-inventory.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { buildFieldGuidanceInventoryPayload } from '../src/core/utils/field-guidance-inventory';

function main() {
  const asJson = process.argv.includes('--json');
  const outIdx = process.argv.indexOf('--out-file');
  const outFile = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;

  const payload = buildFieldGuidanceInventoryPayload();

  if (outFile) {
    const abs = path.isAbsolute(outFile) ? outFile : path.join(process.cwd(), outFile);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Wrote ${payload.fieldRowCount} field rows + ${payload.credentialQuestionCount} credential questions to ${abs}`);
  }

  if (asJson && !outFile) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (!outFile) {
    console.log(
      `Nodes: ${payload.nodeCount}, field rows: ${payload.fieldRowCount}, credential questions: ${payload.credentialQuestionCount}`
    );
    console.log('Sample unified (first 12 rows):');
    console.table(
      payload.unifiedFields.slice(0, 12).map((r) => ({
        nodeType: r.nodeType,
        fieldName: r.fieldName,
        helpCategory: r.helpCategory,
        credQCat: r.credentialQuestionCategory,
        wizardAsks: r.willAskCredentialQuestion,
      }))
    );
  }
}

main();
