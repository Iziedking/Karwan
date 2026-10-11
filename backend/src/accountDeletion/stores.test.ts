import test from 'node:test';
import { checkAccountStores } from './storesContract.js';

test('each account store deletes one account and leaves the next one whole (memory and files)', { skip: !!process.env.DATABASE_URL }, async () => {
  await checkAccountStores();
});
