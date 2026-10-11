import test from 'node:test';
import { createMemoryDeletionStore } from './store.js';
import { checkDeletionStore } from './storeContract.js';

test('the memory deletion store keeps one open request per account and moves it only from the expected state', async () => {
  await checkDeletionStore(createMemoryDeletionStore());
});
