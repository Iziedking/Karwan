import assert from 'node:assert/strict';
import test from 'node:test';
import type { PassportShare } from '../db/passportShares.js';
import { createShare, hashShareToken, MAX_LIVE_SHARES, shareOpens, type ShareDeps } from './passportShares.js';
import { passportShareTools } from '../assistant/passportShareTools.js';

/// The full passport opens only for whom the owner chose, only until it ends.
///
///   npx tsx --test src/sealed/passportShares.test.ts

const OWNER = '0xa045e8104bc066fff5bfc673abf354871edc03c5';
const LAWFUL = '0x2222222222222222222222222222222222222222';
const NOW = 1_760_000_000_000;
const call = { toolCallId: 't1', messages: [] };

function setup() {
  const rows: PassportShare[] = [];
  const deps: ShareDeps & { stop: (s: string, id: string, now: number) => Promise<boolean> } = {
    now: () => NOW,
    live: async (subject, now) => rows.filter((r) => r.subject === subject && r.stoppedAt === null && r.expiresAt > now),
    insert: async (r) => { rows.push(r); },
    findByTag: async (tag) => (tag === 'lawful' ? { address: LAWFUL, handle: 'lawful' } : tag === 'kingizie' ? { address: OWNER, handle: 'kingizie' } : null),
    frontendBase: 'https://testnet.karwan.site/',
    stop: async (subject, id, now) => {
      const r = rows.find((x) => x.id === id && x.subject === subject && x.stoppedAt === null);
      if (!r) return false;
      r.stoppedAt = now;
      return true;
    },
  };
  return { rows, deps };
}

const tokenOf = (link: string) => new URL(link).searchParams.get('share')!;

test('a share for a named person opens only for them, signed in', async () => {
  const { deps } = setup();
  const r = await createShare(OWNER, { withTag: '@lawful', hours: 24 }, deps);
  assert.ok(r.ok);
  assert.match(r.link, /^https:\/\/testnet\.karwan\.site\/credit-passport\/0xa045[0-9a-f]+\?share=[A-Za-z0-9_-]{43}$/);
  assert.equal(r.share.tokenHash, hashShareToken(tokenOf(r.link)));
  assert.notEqual(r.share.tokenHash, tokenOf(r.link));
  assert.equal(shareOpens(r.share, OWNER, LAWFUL, NOW), true);
  assert.equal(shareOpens(r.share, OWNER, LAWFUL.toUpperCase().replace('0X', '0x'), NOW), true);
  assert.equal(shareOpens(r.share, OWNER, null, NOW), false, 'a forwarded link shows nothing more');
  assert.equal(shareOpens(r.share, OWNER, '0x3333333333333333333333333333333333333333', NOW), false);
  assert.equal(shareOpens(r.share, LAWFUL, LAWFUL, NOW), false, 'the token opens one passport only');
});

test('a link for anyone opens for anyone, until it ends or is stopped', async () => {
  const { deps } = setup();
  const r = await createShare(OWNER, { hours: 168 }, deps);
  assert.ok(r.ok);
  assert.equal(r.share.expiresAt, NOW + 7 * 86_400_000);
  assert.equal(shareOpens(r.share, OWNER, null, NOW + 86_400_000), true);
  assert.equal(shareOpens(r.share, OWNER, null, r.share.expiresAt), false);
  assert.equal(shareOpens({ ...r.share, stoppedAt: NOW + 1 }, OWNER, null, NOW + 2), false);
  assert.equal(shareOpens(null, OWNER, null, NOW), false);
});

test('only 24 hours or 7 days, never yourself, never an unknown tag, at most five at once', async () => {
  const { deps } = setup();
  assert.deepEqual(await createShare(OWNER, { hours: 48 }, deps), { ok: false, error: 'A share lasts 24 hours or 7 days.' });
  assert.deepEqual(await createShare(OWNER, { withTag: 'kingizie', hours: 24 }, deps), { ok: false, error: 'You already see your own full passport.' });
  assert.deepEqual(await createShare(OWNER, { withTag: 'nobody', hours: 24 }, deps), { ok: false, error: 'No one on Karwan has that tag.' });
  for (let i = 0; i < MAX_LIVE_SHARES; i++) assert.ok((await createShare(OWNER, { hours: 24 }, deps)).ok);
  assert.equal((await createShare(OWNER, { hours: 24 }, deps)).ok, false);
});

test('the assistant shares, lists and stops, and never shows the token twice', async () => {
  const { deps, rows } = setup();
  const tools = passportShareTools(OWNER, deps);
  const out = (await tools.share_my_passport.execute!({ with: 'lawful', days: 7 }, call)) as Record<string, unknown>;
  assert.equal(out.shared, true);
  assert.equal(out.for, '@lawful, signed in');
  assert.match(String(out.link), /\?share=/);
  const listed = (await tools.my_passport_shares.execute!({}, call)) as { shares: Array<Record<string, unknown>> };
  assert.equal(listed.shares.length, 1);
  assert.equal(listed.shares[0]!.with, '@lawful');
  assert.doesNotMatch(JSON.stringify(listed), /share=|tokenHash/);
  const stopped = (await tools.stop_passport_share.execute!({ all: true }, call)) as Record<string, unknown>;
  assert.equal(stopped.stopped, 1);
  assert.notEqual(rows[0]!.stoppedAt, null);
  assert.equal(((await tools.stop_passport_share.execute!({ id: rows[0]!.id }, call)) as Record<string, unknown>).stopped, 0);
});
