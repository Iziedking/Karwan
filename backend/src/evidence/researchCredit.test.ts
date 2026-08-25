import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryResearchCreditStore,
  ResearchCreditInsufficientError,
} from './researchCredit.js';

const OWNER = '0x1111111111111111111111111111111111111111';

test('research credit reservations are exact, idempotent, and settle once', async () => {
  const store = new InMemoryResearchCreditStore();
  assert.equal((await store.ensureAccount({ owner: OWNER, initialCreditUsdc: '1.000000', now: 100 })).created, true);
  const first = await store.reserve({
    id: 'reservation-1', reservationKey: 'research:purchase-1', owner: OWNER,
    amountUsdc: '0.250001', now: 110,
  });
  const replay = await store.reserve({
    id: 'reservation-1', reservationKey: 'research:purchase-1', owner: OWNER,
    amountUsdc: '0.250001', now: 120,
  });
  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(replay.reservation.version, 1);
  assert.deepEqual(replay.account, first.account);
  assert.deepEqual(await store.getAccount(OWNER), {
    owner: OWNER,
    balanceMicros: '1000000',
    reservedMicros: '250001',
    version: 2,
    createdAt: 100,
    updatedAt: 110,
    data: {},
  });
  const settled = await store.settle({
    reservationKey: 'research:purchase-1', expectedVersion: 1, spentUsdc: '0.200001', now: 130,
  });
  assert.equal(settled.reservation.state, 'settled');
  assert.equal(settled.account.balanceMicros, '799999');
  assert.equal(settled.account.reservedMicros, '0');
  assert.deepEqual(await store.settle({ reservationKey: 'research:purchase-1', expectedVersion: 1, now: 140 }), settled);
});

test('research credit holds unknown purchases and releases failed reservations', async () => {
  const store = new InMemoryResearchCreditStore();
  await store.ensureAccount({ owner: OWNER, initialCreditUsdc: '0.500000', now: 100 });
  const reservation = await store.reserve({
    id: 'reservation-unknown', reservationKey: 'research:unknown', owner: OWNER,
    amountUsdc: '0.400000', now: 110,
  });
  assert.equal((await store.getAccount(OWNER))?.reservedMicros, '400000');
  const released = await store.release({ reservationKey: reservation.reservation.reservationKey, expectedVersion: reservation.reservation.version, now: 120 });
  assert.equal(released.reservation.state, 'released');
  assert.equal(released.account.balanceMicros, '500000');
  assert.equal(released.account.reservedMicros, '0');
});

test('insufficient research credit never creates a reservation or overspends', async () => {
  const store = new InMemoryResearchCreditStore();
  await store.ensureAccount({ owner: OWNER, initialCreditUsdc: '0.250000', now: 100 });
  await assert.rejects(
    () => store.reserve({ id: 'reservation-too-large', reservationKey: 'research:too-large', owner: OWNER, amountUsdc: '0.250001', now: 110 }),
    ResearchCreditInsufficientError,
  );
  assert.equal(await store.getReservation('research:too-large'), null);
  assert.equal((await store.getAccount(OWNER))?.reservedMicros, '0');
});

test('concurrent in-memory reservations have one winner for the remaining balance', async () => {
  const store = new InMemoryResearchCreditStore();
  await store.ensureAccount({ owner: OWNER, initialCreditUsdc: '0.500000', now: 100 });
  const results = await Promise.allSettled([
    store.reserve({ id: 'reservation-a', reservationKey: 'research:a', owner: OWNER, amountUsdc: '0.400000', now: 110 }),
    store.reserve({ id: 'reservation-b', reservationKey: 'research:b', owner: OWNER, amountUsdc: '0.400000', now: 110 }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason instanceof ResearchCreditInsufficientError).length, 1);
  assert.equal((await store.getAccount(OWNER))?.reservedMicros, '400000');
});

test('research credit audit listing is deduplicated, filtered, and read-only', async () => {
  const store = new InMemoryResearchCreditStore();
  const other = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  await store.ensureAccount({ owner: OWNER, initialCreditUsdc: '2', now: 1 });
  await store.ensureAccount({ owner: other, initialCreditUsdc: '1', now: 1 });
  await store.reserve({ id: 'reservation-1', reservationKey: 'key-1', owner: OWNER, amountUsdc: '0.25', now: 2 });
  await store.reserve({ id: 'reservation-2', reservationKey: 'key-2', owner: OWNER, amountUsdc: '0.5', now: 3 });
  const accounts = await store.listAccounts({ owner: OWNER, limit: 10 });
  assert.deepEqual(accounts.map((account) => account.owner), [OWNER]);
  assert.equal(accounts[0]?.balanceMicros, '2000000');
  const reservations = await store.listReservations({ owner: OWNER, state: 'reserved', limit: 10 });
  assert.deepEqual(reservations.map((reservation) => reservation.reservationKey), ['key-2', 'key-1']);
  assert.equal((await store.getAccount(OWNER))?.reservedMicros, '750000');
});
