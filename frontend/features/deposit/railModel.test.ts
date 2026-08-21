import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultRail, railsFor, reconcileRail } from './railModel';

const ids = (method: 'circle' | 'web3', direction: 'in' | 'out') =>
  railsFor({ method, direction }).map((rail) => rail.id);

test('both account types are offered a way in, and it is the same first rail', () => {
  // The complaint this answers: an email account saw no rail choice at all.
  assert.deepEqual(ids('circle', 'in'), ['direct', 'gateway', 'onramp']);
  assert.deepEqual(ids('web3', 'in'), ['direct', 'gateway', 'cctp', 'onramp']);
  assert.equal(ids('circle', 'in')[0], ids('web3', 'in')[0]);
});

test('an email account is never dropped onto a rail it cannot use', () => {
  const rails = railsFor({ method: 'circle', direction: 'in' });
  assert.equal(defaultRail(rails), 'direct');
  // Gateway needs a wallet to sign with, so it is shown as coming, not as broken.
  assert.equal(rails.find((r) => r.id === 'gateway')?.state, 'soon');
  assert.equal(rails.find((r) => r.id === 'onramp')?.state, 'soon');
});

test('a wallet account gets gateway and CCTP as real options', () => {
  const rails = railsFor({ method: 'web3', direction: 'in' });
  assert.equal(rails.find((r) => r.id === 'gateway')?.state, 'ready');
  assert.equal(rails.find((r) => r.id === 'cctp')?.state, 'ready');
});

test('withdrawing leads with the rail that works for everyone', () => {
  assert.deepEqual(ids('circle', 'out'), ['cctp', 'gateway', 'onramp']);
  assert.deepEqual(ids('web3', 'out'), ['cctp', 'gateway', 'onramp']);
  assert.equal(defaultRail(railsFor({ method: 'circle', direction: 'out' })), 'cctp');
});

test('a direct deposit address is not a way out', () => {
  assert.ok(!ids('circle', 'out').includes('direct'));
  assert.ok(!ids('web3', 'out').includes('direct'));
});

test('a deep link is honoured only when that rail is usable', () => {
  const web3 = railsFor({ method: 'web3', direction: 'in' });
  assert.equal(defaultRail(web3, 'gateway'), 'gateway');
  const circle = railsFor({ method: 'circle', direction: 'in' });
  // ?rail=gateway on an email account would have opened a coming-soon notice
  // as the first thing on the page.
  assert.equal(defaultRail(circle, 'gateway'), 'direct');
  assert.equal(defaultRail(circle, 'nonsense'), 'direct');
});

test('flipping direction keeps a valid rail', () => {
  const out = railsFor({ method: 'web3', direction: 'out' });
  // Direct deposit does not exist on the way out, so it has to land elsewhere.
  assert.equal(reconcileRail('direct', out), 'cctp');
  // Anything still on offer is left alone.
  assert.equal(reconcileRail('gateway', out), 'gateway');
});

test('an unknown account method is treated as the more restricted one', () => {
  // `method` is null while auth resolves. Offering a rail that needs a wallet
  // before we know there is one is how a page flashes an unusable panel, so an
  // unresolved account sees exactly what an email account sees.
  const rails = railsFor({ method: null, direction: 'in' });
  assert.deepEqual(rails.map((rail) => rail.id), ['direct', 'gateway', 'onramp']);
  assert.equal(defaultRail(rails), 'direct');
  assert.equal(rails.find((rail) => rail.id === 'gateway')?.state, 'soon');
});
