import { readFileSync } from 'fs';
import { join } from 'path';
import { unifiedNodeRegistry } from '../unified-node-registry';

describe('legacy execution migration waves', () => {
  it('log_output registry override does not import executeViaLegacyExecutor', () => {
    const def = unifiedNodeRegistry.get('log_output');
    expect(def?.execute).toBeDefined();
    const p = join(__dirname, '../overrides/log-output.ts');
    const src = readFileSync(p, 'utf8');
    expect(src.includes('executeViaLegacyExecutor')).toBe(false);
  });

  it('slack_message override still delegates via legacy adapter (wave 2 backlog)', () => {
    const p = join(__dirname, '../overrides/slack-message.ts');
    const src = readFileSync(p, 'utf8');
    expect(src.includes('executeViaLegacyExecutor')).toBe(true);
  });
});
