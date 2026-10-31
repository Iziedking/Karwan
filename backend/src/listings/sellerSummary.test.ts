import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicPassport } from '../sealed/passport.js';
import { sellerSummaries } from './sellerSummary.js';

const ada = { displayName: 'Ada Obi', tag: 'ada', country: 'NG', rating: { kind: 'rated', value: 4.8, count: 23 } } as unknown as PublicPassport;

test('each seller is read once and a failure leaves only that seller blank', async () => {
  const calls: string[] = [];
  const map = await sellerSummaries(['0xA', '0xa', '0xB'], {
    passport: async (a) => {
      calls.push(a);
      if (a === '0xb') throw new Error('down');
      return ada;
    },
    level: async () => 'person_verified',
  });
  assert.deepEqual(calls, ['0xa', '0xb']);
  assert.deepEqual(map.get('0xa'), { name: 'Ada Obi', tag: 'ada', verified: true, rating: { kind: 'rated', value: 4.8, count: 23 }, country: 'NG' });
  assert.equal(map.get('0xb'), null);
});

test('a registered seller is not marked verified, and a blank name stays blank', async () => {
  const map = await sellerSummaries(['0xd'], {
    passport: async () => ({ ...ada, displayName: '  ', tag: null }) as PublicPassport,
    level: async () => 'registered',
  });
  assert.deepEqual(map.get('0xd'), { name: null, tag: null, verified: false, rating: ada.rating, country: 'NG' });
});

test('a slow seller does not hold the market', async () => {
  const map = await sellerSummaries(['0xc'], { passport: () => new Promise(() => {}), level: async () => 'registered' }, 50);
  assert.equal(map.get('0xc'), null);
});
