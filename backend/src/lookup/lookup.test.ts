import assert from 'node:assert/strict';
import test from 'node:test';
import { vetAdvice } from './advice.js';
import { checkPerson, type CheckPersonDeps } from './checkPerson.js';
import { resolveLookup, type ResolveDeps } from './resolve.js';

/// Looking someone up by Karwan tag or Telegram name: the public record, with
/// plain advice from the asker's agent and never a number.
///
///   npx tsx --test src/lookup/lookup.test.ts

const resolveDeps = (over: Partial<ResolveDeps> = {}): ResolveDeps => ({
  byTag: async (tag) => (tag === 'ada' ? '0xada' : null),
  byTelegram: async (name) => (name === 'ada_tg' ? { address: '0xtg', findable: true } : name === 'hidden' ? { address: '0xhid', findable: false } : null),
  ...over,
});

test('a Karwan tag is found with or without the @ and in any case', async () => {
  assert.deepEqual(await resolveLookup('@ADA', resolveDeps()), { address: '0xada', via: 'tag' });
  assert.deepEqual(await resolveLookup(' ada ', resolveDeps()), { address: '0xada', via: 'tag' });
});

test('a Telegram name is found when the person allowed it', async () => {
  assert.deepEqual(await resolveLookup('@ada_tg', resolveDeps()), { address: '0xtg', via: 'telegram' });
});

test('a Telegram name is not found when the person did not allow it', async () => {
  assert.equal(await resolveLookup('@hidden', resolveDeps()), null);
});

test('the Karwan tag wins when a tag and a Telegram name are the same', async () => {
  const r = await resolveLookup('ada', resolveDeps({ byTelegram: async () => ({ address: '0xother', findable: true }) }));
  assert.deepEqual(r, { address: '0xada', via: 'tag' });
});

test('nothing at all is not found', async () => {
  assert.equal(await resolveLookup('', resolveDeps()), null);
  assert.equal(await resolveLookup('nobody', resolveDeps()), null);
});

test('vetAdvice maps tiers and levels as pinned', () => {
  assert.equal(vetAdvice({ tier: 'ELITE', level: 'registered' }), 'good');
  assert.equal(vetAdvice({ tier: 'STRONG', level: 'registered' }), 'good');
  assert.equal(vetAdvice({ tier: 'ESTABLISHED', level: 'registered' }), 'start_small');
  assert.equal(vetAdvice({ tier: 'COLD', level: 'work_verified' }), 'start_small');
  assert.equal(vetAdvice({ tier: 'COLD', level: 'id_verified' }), 'start_small');
  assert.equal(vetAdvice({ tier: 'COLD', level: 'person_verified' }), 'new');
  assert.equal(vetAdvice({ tier: 'NEW', level: 'id_verified' }), 'new');
});

const checkDeps = (over: Partial<CheckPersonDeps> = {}): CheckPersonDeps => ({
  resolve: async (raw) => (raw.replace('@', '') === 'ada' ? { address: '0xada', via: 'tag' } : null),
  passport: async () => ({
    sealed: true,
    address: '0xada',
    displayName: 'Ada Obi',
    tag: 'ada',
    tier: 'ESTABLISHED',
    reasons: ['HAS_COMPLETED_DEALS', 'USUALLY_ON_TIME'],
    memberSince: 1,
    country: 'NG',
    rating: { kind: 'rated', value: 4.8, count: 23 },
  }),
  level: async () => 'work_verified',
  ...over,
});

test('check_person returns only the public record and advice, never numbers or the address', async () => {
  const r = await checkPerson('@ada', checkDeps());
  assert.deepEqual(Object.keys(r).sort(), ['advice', 'country', 'found', 'name', 'rating', 'reasons', 'tag', 'tier']);
  assert.deepEqual(r, {
    found: true,
    name: 'Ada Obi',
    tag: '@ada',
    tier: 'ESTABLISHED',
    reasons: ['HAS_COMPLETED_DEALS', 'USUALLY_ON_TIME'],
    advice: 'start_small',
    country: 'NG',
    rating: '4.8 from 23 deals',
  });
});

test('someone not on Karwan gets the deal-link offer', async () => {
  assert.deepEqual(await checkPerson('@nobody', checkDeps()), { found: false, next: 'Offer to send them a deal link.' });
});
