import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/// Every request, offer, counter and accept goes through the market board
/// (view 40), so `MARKET_BOARD` alone decides where they are kept. Only the
/// board itself, operator scripts and the readers of the old board's history
/// may name its calls.

const SRC = fileURLToPath(new URL('..', import.meta.url));
const WRITES = /'(postJob|submitBid|counterOffer|respondToCounter|acceptBid)\(/;
const MAY_WRITE = new Set(['marketplace/chainBoard.ts']);
const MAY_READ_LOGS = new Set(['marketplace/chainBoard.ts', 'chain/eventBackfill.ts', 'chain/lifetimeStats.ts', 'chain/networkStats.ts']);

async function sources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await sources(p)));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

test('only the board writes to the old request board', async () => {
  const offenders: string[] = [];
  for (const file of await sources(SRC)) {
    const rel = relative(SRC, file).replaceAll('\\', '/');
    if (rel.startsWith('scripts/') || MAY_WRITE.has(rel)) continue;
    if (WRITES.test(await readFile(file, 'utf8'))) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});

test('only the board and the history readers watch or scan the old board', async () => {
  const offenders: string[] = [];
  for (const file of await sources(SRC)) {
    const rel = relative(SRC, file).replaceAll('\\', '/');
    if (rel.startsWith('scripts/') || MAY_READ_LOGS.has(rel)) continue;
    const text = await readFile(file, 'utf8');
    if (/address: jobBoard\.address/.test(text) || /jobBoard\.read\.jobs\(/.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});
