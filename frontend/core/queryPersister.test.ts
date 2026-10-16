import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';
import { makeQueryPersister, persistOptions } from './queryPersister';

test('a query still loading is never saved, so the next visit restores cleanly', async () => {
  const client = new QueryClient();
  client.setQueryData(['profile', '0xabc'], { name: 'Ada' });
  void client.prefetchQuery({ queryKey: ['balances', '0xabc'], queryFn: () => new Promise(() => {}) });
  const saved = JSON.parse(JSON.stringify(dehydrate(client, persistOptions.dehydrateOptions)));
  assert.deepEqual(saved.queries.map((q: { queryKey: unknown[] }) => q.queryKey[0]), ['profile']);
  assert.doesNotThrow(() => hydrate(new QueryClient(), saved));
  client.clear();
});

test('the server gets a persister too, one that keeps nothing', async () => {
  const persister = makeQueryPersister();
  assert.equal(typeof persister.persistClient, 'function');
  assert.equal(await persister.restoreClient(), undefined);
});

test('the query provider is the same on the server and in the browser', () => {
  // A provider swapped after hydration changes every useId below it, which
  // is what broke the header's language and menu buttons.
  const providers = readFileSync(new URL('../shared/components/AppProviders.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(providers, /persister \?/);
  assert.doesNotMatch(providers, /<QueryClientProvider/);
  assert.match(providers, /<PersistQueryClientProvider/);
});
