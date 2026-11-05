import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// The morning brief and the agent's live note, on Telegram and by email
/// (view 52, step 4).
///
///   npx tsx --test src/telegram/briefMessage.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-brief-message-')));
delete process.env.DATABASE_URL;
const { summaryFor, recipientsFor } = await import('./notifier.js');
const { contentFor } = await import('../emails/dealNotifier.js');

const OWNER = '0x00000000000000000000000000000000000000c4';
const brief = {
  type: 'agent.brief', actor: 'platform', ts: 0,
  payload: { user: OWNER, sellerUser: OWNER, heading: 'Your morning brief', lines: ['Logo: 2 new offers, the best 40 USDC.', '1 deal is waiting on you.'], openLabel: 'Open Karwan' },
} as never;

test('Telegram renders the brief as a bold heading and one bullet per line, to its owner only', async () => {
  assert.deepEqual(await recipientsFor(brief), [{ address: OWNER, role: 'self' }]);
  assert.equal(summaryFor(brief, 'self')!.text, '*Your morning brief*\n• Logo: 2 new offers, the best 40 USDC.\n• 1 deal is waiting on you.');
});

test('a live note links to its request; an empty one sends nothing', async () => {
  const note = { type: 'agent.note', actor: 'platform', ts: 0, payload: { user: OWNER, sellerUser: OWNER, heading: 'Your agent noticed', lines: ['Logo: 2 sellers charge less.'], jobId: '0xjob' } } as never;
  assert.deepEqual(await recipientsFor(note), [{ address: OWNER, role: 'self' }]);
  assert.match(summaryFor(note, 'self')!.text, /^\*Your agent noticed\*\n• Logo: 2 sellers charge less\.$/);
  const empty = { type: 'agent.brief', actor: 'platform', ts: 0, payload: { user: OWNER, lines: [] } } as never;
  assert.equal(summaryFor(empty, 'self'), null);
});

test('the email carries the heading, the lines and one button', () => {
  const c = contentFor(brief, 'seller', null)!;
  assert.equal(c.subject, 'Your morning brief');
  assert.equal(c.heading, 'Your morning brief');
  assert.equal(c.body, 'Logo: 2 new offers, the best 40 USDC. 1 deal is waiting on you.');
  assert.equal(c.ctaLabel, 'Open Karwan');
});
