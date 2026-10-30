import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createPayOutsideFlags } from './payOutsideFlags.js';

/// What the team sees when someone asks to be paid outside Karwan (view 32).

const DAY = 86_400_000;
const ADA = '0x00000000000000000000000000000000000000a1';

test('one flag per message, newest first, a third in 30 days marks a repeat, and it survives a restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pay-outside-'));
  try {
    const file = join(dir, 'flags.json');
    const flags = createPayOutsideFlags(file);
    const now = Date.UTC(2026, 9, 30);
    flags.record({ address: ADA, jobId: 'job_1', messageId: 'm1', body: 'send it to my account', at: now - 40 * DAY });
    flags.record({ address: ADA, jobId: 'job_1', messageId: 'm2', body: 'pay me directly', at: now - 2 * DAY });
    flags.record({ address: ADA, jobId: 'job_1', messageId: 'm2', body: 'pay me directly', at: now - 2 * DAY });
    flags.record({ address: ADA.toUpperCase().replace('0X', '0x'), jobId: 'job_2', messageId: 'm3', body: 'opay transfer', at: now - DAY });
    let rows = flags.list(now);
    assert.deepEqual(rows.map((r) => r.messageId), ['m3', 'm2', 'm1']);
    // Only two fall inside the last 30 days.
    assert.equal(rows[0]!.repeat, false);
    flags.record({ address: ADA, jobId: 'job_3', messageId: 'm4', body: 'no need for escrow', at: now });
    rows = createPayOutsideFlags(file).list(now);
    assert.equal(rows.length, 4);
    assert.equal(rows[0]!.repeat, true);
    assert.equal(rows[0]!.address, ADA);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
