import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { makeQueryPersister } from './queryPersister';

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
