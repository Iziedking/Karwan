import assert from 'node:assert/strict';
import test from 'node:test';
import { adminWagmiConfig } from './adminWagmi';

test('the desk wallet keeps nothing, so it never tries to restore a kept session on mount', () => {
  const internal = (adminWagmiConfig as unknown as { _internal: { ssr: boolean; store: { persist?: unknown } } })._internal;
  assert.equal(internal.store.persist, undefined, 'no storage on the desk wallet');
  assert.equal(internal.ssr, false, 'ssr on wagmi rehydrates a store that has no storage and throws on every desk load');
});
