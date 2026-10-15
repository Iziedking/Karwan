import assert from 'node:assert/strict';
import test from 'node:test';

delete process.env.DATABASE_URL;

const { surveyRoutes } = await import('./survey.js');
const { listResearchAnswers, summarizeResearchAnswers } = await import('../db/researchAnswers.js');

let ip = 0;
const post = (body: unknown, address = `10.0.0.${++ip}`) =>
  surveyRoutes.request('/research', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': address },
    body: JSON.stringify(body),
  });

const answer = {
  locale: 'en',
  role: 'seller',
  checks: ['reviews', 'vouch'],
  trustMost: 'vouch',
  easiestFake: 'reviews',
  share: 'if_i_choose',
  payer: 'checker',
};

test('a complete answer is kept, with the time and language and nothing about the sender', async () => {
  const res = await post({ ...answer, contact: '  ada@example.com ' });
  assert.equal(res.status, 200);
  const rows = await listResearchAnswers();
  const row = rows.at(-1)!;
  assert.equal(row.role, 'seller');
  assert.deepEqual(row.checks, ['reviews', 'vouch']);
  assert.equal(row.contact, 'ada@example.com');
  assert.equal(row.locale, 'en');
  assert.equal(typeof row.createdAt, 'number');
  assert.equal(JSON.stringify(row).includes('10.0.0.'), false, 'no address is stored');
});

test('every question is required except the follow-up contact', async () => {
  for (const key of ['role', 'checks', 'trustMost', 'easiestFake', 'share', 'payer'] as const) {
    const { [key]: _drop, ...rest } = answer;
    assert.equal((await post(rest)).status, 400, `missing ${key}`);
  }
  assert.equal((await post({ ...answer, checks: [] })).status, 400, 'at least one check');
  assert.equal((await post({ ...answer, role: 'robot' })).status, 400, 'only the offered answers');
  assert.equal((await post({ ...answer, trustMost: 'nothing' })).status, 400, 'trust picks come from the real signals');
  assert.equal((await post(answer)).status, 200, 'no contact is fine');
});

test('free text is short and only kept when "something else" was picked', async () => {
  assert.equal((await post({ ...answer, checks: ['other'], otherText: 'x'.repeat(141) })).status, 400);
  const before = (await listResearchAnswers()).length;
  assert.equal((await post({ ...answer, checks: ['reviews'], otherText: 'ignored' })).status, 200);
  const rows = await listResearchAnswers();
  assert.equal(rows.length, before + 1);
  assert.equal(rows.at(-1)!.otherText, null);
  assert.equal((await post({ ...answer, contact: 'y'.repeat(121) })).status, 400);
});

test('a bot that fills the hidden field is told it worked, and nothing is kept', async () => {
  const before = (await listResearchAnswers()).length;
  const res = await post({ ...answer, website: 'http://spam.example' });
  assert.equal(res.status, 200);
  assert.equal((await listResearchAnswers()).length, before);
});

test('one address can send a handful, then waits', async () => {
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await post(answer, '192.0.2.77')).status);
  assert.deepEqual(statuses.slice(0, 5), [200, 200, 200, 200, 200]);
  assert.equal(statuses.at(-1), 429);
});

test('the summary counts each answer, and multi-pick checks count once per person', () => {
  const summary = summarizeResearchAnswers([
    { id: 'a', createdAt: 1, locale: 'en', role: 'seller', checks: ['reviews', 'vouch'], otherText: null, trustMost: 'vouch', easiestFake: 'reviews', share: 'yes', payer: 'checker', contact: null },
    { id: 'b', createdAt: 2, locale: 'fr', role: 'buyer', checks: ['reviews'], otherText: null, trustMost: 'id', easiestFake: 'reviews', share: 'no', payer: 'free', contact: 'x' },
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.role.seller, 1);
  assert.equal(summary.checks.reviews, 2);
  assert.equal(summary.easiestFake.reviews, 2);
  assert.equal(summary.withContact, 1);
});
