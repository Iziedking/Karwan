import { randomUUID } from 'node:crypto';
import { listDealsForAddress } from '../db/deals.js';
import { claimUnique, getRecord, holderOf, listRecords, putRecord, releaseUnique } from '../db/evidence.js';
import { getProfile } from '../db/profiles.js';
import { createCacReview, type CacRequest } from './cac.js';
import { createClientConfirm, type ConfirmRequest } from './clientConfirm.js';
import { addFact, factsFor, revokeFact, type EvidenceDeps, type StoredFact } from './evidence.js';
import { ladderFor, type Ladder } from './ladder.js';

/// The verification services on the real stores. Shared by the routes, the
/// WhatsApp agent and the assistant tools.
export const evidenceDeps: EvidenceDeps = {
  getStored: async (address) => (await getRecord<StoredFact[]>('facts', address)) ?? [],
  putStored: (address, facts) => putRecord('facts', address, facts),
  profile: (address) => getProfile(address),
  settledDeals: async (address) => {
    const me = address.toLowerCase();
    const deals = await listDealsForAddress(me);
    return deals.filter((d) => d.settledAt && !d.cancelledAt && (d.buyer.toLowerCase() === me || d.seller.toLowerCase() === me)).length;
  },
};

export async function levelOf(address: string, now = Date.now()): Promise<Ladder> {
  return ladderFor(await factsFor(address, evidenceDeps, now), now);
}

export function addVerifiedFact(address: string, fact: StoredFact): Promise<boolean> {
  return addFact(address, fact, evidenceDeps);
}

export function claimNullifier(nullifier: string, address: string): Promise<boolean> {
  return claimUnique('nullifier', nullifier, address);
}

export function cacReview(tell: (address: string, text: string) => Promise<void>) {
  return createCacReview({
    now: Date.now,
    newId: () => `cac-${randomUUID()}`,
    get: (id) => getRecord<CacRequest>('cac', id),
    put: (r) => putRecord('cac', r.id, r),
    list: async () => (await listRecords<CacRequest>('cac')).map((r) => r.data),
    addFact: addVerifiedFact,
    tell,
    holderOf: (rc) => holderOf('rc', rc),
    claim: (rc, address) => claimUnique('rc', rc, address),
    release: (rc, address) => releaseUnique('rc', rc, address),
    revokeFact: (address, factId, at) => revokeFact(address, factId, at, evidenceDeps),
  });
}

/// Past-client confirmations on the real stores. `hash` is the number hasher
/// the WhatsApp agent uses, so a client's number maps to their account.
export function clientConfirmations(ports: {
  hash: (number: string) => string;
  numberHashOf: (address: string) => Promise<string | null>;
  addressOfNumberHash: (numberHash: string) => Promise<string | null>;
  sendTemplate: (to: string, params: string[], buttonIds: string[]) => Promise<void>;
}) {
  return createClientConfirm({
    now: Date.now,
    newId: () => `cw-${randomUUID()}`,
    hashNumber: ports.hash,
    numberHashOf: ports.numberHashOf,
    getRequest: (id) => getRecord<ConfirmRequest>('confirm', id),
    putRequest: (r) => putRecord('confirm', r.id, r),
    listRequests: async () => (await listRecords<ConfirmRequest>('confirm')).map((r) => r.data),
    sendTemplate: ports.sendTemplate,
    isPersonVerified: async (clientHash) => {
      const address = await ports.addressOfNumberHash(clientHash);
      if (!address) return false;
      const level = await levelOf(address);
      return level !== 'registered';
    },
    isAddressPersonVerified: async (address) => (await levelOf(address)) !== 'registered',
    addFact: addVerifiedFact,
    corroborate: async (address, invoiceFactId) => {
      const stored = await evidenceDeps.getStored(address.toLowerCase());
      await evidenceDeps.putStored(
        address.toLowerCase(),
        stored.map((f) => (f.id === invoiceFactId ? { ...f, corroborated: true } : f)),
      );
    },
  });
}
