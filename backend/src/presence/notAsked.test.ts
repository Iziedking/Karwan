import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('..', import.meta.url));

/// The only places that may ask a person to confirm: the three actions of
/// view 27 and the wiring around them. Everything else, every deal step and
/// every agent signer, runs without asking.
const MAY_ASK = new Set([
  'index.ts',
  'accountDeletion/live.ts',
  'routes/confirm.ts',
  'routes/cashout.ts',
  'routes/gateway.ts',
  'routes/bridge.ts',
  'routes/activation.ts',
  'routes/vault.ts',
  // Putting up a deal guarantee is the confirmed action deal insurance was (view 37).
  'routes/guaranteeLive.ts',
]);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

test('only_the_confirmed_actions_import_the_check', () => {
  const asking = sources(SRC)
    .map((path) => relative(SRC, path).replaceAll('\\', '/'))
    .filter((file) => !file.startsWith('presence/'))
    .filter((file) => /from '[^']*presence\/(live|check|moveOut)\.js'/.test(readFileSync(join(SRC, file), 'utf8')));
  assert.ok(asking.includes('routes/cashout.ts') && asking.includes('routes/vault.ts'), 'the scan sees the routes that ask');
  assert.deepEqual(asking.filter((file) => !MAY_ASK.has(file)), []);
});

test('deal_fund_release_and_dispute_are_not_asked', () => {
  for (const file of ['routes/deals.ts', 'routes/milestones.ts', 'routes/jobs.ts', 'routes/offers.ts']) {
    assert.doesNotMatch(readFileSync(join(SRC, file), 'utf8'), /presence\//, file);
  }
});

test('in_process_signers_never_import_the_check', () => {
  for (const dir of ['agents', 'x402', 'deals', 'agentRail', 'channels', 'telegram']) {
    for (const path of sources(join(SRC, dir))) {
      assert.doesNotMatch(readFileSync(path, 'utf8'), /presence\/(check|live|moveOut)\.js/, relative(SRC, path));
    }
  }
});
