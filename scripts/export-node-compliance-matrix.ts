/**
 * Export node compliance matrix (registry × input fields × credentials × execute override).
 *
 * Usage (from worker/):
 *   npx ts-node scripts/export-node-compliance-matrix.ts
 *   npx ts-node scripts/export-node-compliance-matrix.ts --out-dir tmp/compliance-matrix
 *   npx ts-node scripts/export-node-compliance-matrix.ts --csv-only tmp/matrix.csv
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  buildNodeComplianceMatrix,
  complianceMatrixToCsv,
} from '../src/core/utils/node-compliance-matrix';

function main() {
  const outDirIdx = process.argv.indexOf('--out-dir');
  const csvOnlyIdx = process.argv.indexOf('--csv-only');
  const outDir =
    outDirIdx >= 0 ? process.argv[outDirIdx + 1] : path.join(process.cwd(), 'tmp', 'node-compliance-matrix');
  const csvOnlyPath = csvOnlyIdx >= 0 ? process.argv[csvOnlyIdx + 1] : undefined;

  const matrix = buildNodeComplianceMatrix();

  if (csvOnlyPath) {
    const abs = path.isAbsolute(csvOnlyPath) ? csvOnlyPath : path.join(process.cwd(), csvOnlyPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, complianceMatrixToCsv(matrix), 'utf8');
    console.log(`Wrote CSV (${matrix.fieldRowCount} rows) to ${abs}`);
    return;
  }

  const absDir = path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir);
  fs.mkdirSync(absDir, { recursive: true });

  const jsonPath = path.join(absDir, 'node-compliance-matrix.json');
  const csvPath = path.join(absDir, 'node-compliance-matrix-fields.csv');
  const nodesPath = path.join(absDir, 'node-compliance-matrix-nodes.json');

  fs.writeFileSync(jsonPath, JSON.stringify(matrix, null, 2), 'utf8');
  fs.writeFileSync(csvPath, complianceMatrixToCsv(matrix), 'utf8');
  fs.writeFileSync(
    nodesPath,
    JSON.stringify(
      {
        generatedAt: matrix.generatedAt,
        nodeCount: matrix.nodeCount,
        overrideTypeCount: matrix.overrideTypeCount,
        nodes: matrix.nodes,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`Node compliance matrix (${matrix.nodeCount} nodes, ${matrix.fieldRowCount} field rows)`);
  console.log(`  JSON:  ${jsonPath}`);
  console.log(`  CSV:   ${csvPath}`);
  console.log(`  Nodes: ${nodesPath}`);
}

main();
