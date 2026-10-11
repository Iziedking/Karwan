import assert from 'node:assert/strict';
import test from 'node:test';
import { createOpenLinks } from './openLink.js';

function setup() {
  let now = 1_000_000;
  const store = new Map<string, unknown>();
  let n = 0;
  const links = createOpenLinks({
    now: () => now,
    newToken: () => `tok${++n}`,
    put: async (k, v) => {
      store.set(k, v);
    },
    take: async (k) => {
      const v = store.get(k);
      store.delete(k);
      return (v as never) ?? null;
    },
  });
  return { links, advance: (ms: number) => (now += ms) };
}

test('a link opens once, as the account it was made for, at the page it names', async () => {
  const { links } = setup();
  const token = await links.mint('0xADA', '/verify/person');
  assert.deepEqual(await links.redeem(token!), { address: '0xada', path: '/verify/person' });
  assert.equal(await links.redeem(token!), null);
});

test('a link expires after ten minutes', async () => {
  const { links, advance } = setup();
  const token = await links.mint('0xada', '/profile');
  advance(10 * 60_000 + 1);
  assert.equal(await links.redeem(token!), null);
});

test('only known pages can be opened', async () => {
  const { links } = setup();
  assert.equal(await links.mint('0xada', '/admin'), null);
  assert.equal(await links.mint('0xada', 'https://evil.example'), null);
  assert.equal(await links.mint('0xada', '//evil.example'), null);
});

test('money steps open on their own pages, matched exactly', async () => {
  const { links } = setup();
  const id = `0x${'ab'.repeat(32)}`;
  for (const path of [`/deals/${id}`, `/jobs/${id}`, '/account', '/stake', '/bridge?direction=in', '/bridge?direction=out']) {
    assert.ok(await links.mint('0xada', path), path);
  }
  for (const path of ['/deals/0xabc', `/deals/${id}/extra`, `/deals/${id}?next=//evil.example`, '/bridge?direction=sideways', '/accounts']) {
    assert.equal(await links.mint('0xada', path), null, path);
  }
});

test('an unknown token opens nothing', async () => {
  const { links } = setup();
  assert.equal(await links.redeem('nope'), null);
});
