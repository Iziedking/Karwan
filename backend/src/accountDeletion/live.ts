import { randomUUID } from 'node:crypto';
import { parseUnits, type Address } from 'viem';
import { getBuyerSnapshot } from '../agents/buyer.js';
import { getSellerSnapshot } from '../agents/seller.js';
import { CCTP_CHAINS, CIRCLE_WALLET_CHAIN_KEYS } from '../chain/cctpChains.js';
import { vaultAbi } from '../chain/abis/vault.js';
import { publicClient } from '../chain/client.js';
import { readSourceUsdcBalance } from '../chain/cctpClients.js';
import { readUsdcBalance } from '../chain/contracts.js';
import { readSolanaHolding } from '../chain/solanaBalances.js';
import { findChatAccountByAddress } from '../channels/accountsLive.js';
import { tellAccount } from '../channels/sender.js';
import { config } from '../config.js';
import { deleteActivityFor } from '../db/activityLog.js';
import { deleteAgentWallets, getAgentWallets } from '../db/agentWallets.js';
import { deleteReadsFor } from '../db/recordReads.js';
import { deleteAssistantUsage } from '../db/assistantUsage.js';
import { deleteBriefsByPoster, listAllBriefs } from '../db/briefs.js';
import { pgEnabled, withPostgresTransaction } from '../db/client.js';
import { getDeal, listDealsForAddress } from '../db/deals.js';
import { deleteRecord, keysHeldBy, listRecords, releaseUnique } from '../db/evidence.js';
import { deleteFeedbackFromWallet } from '../db/feedback.js';
import { deleteListingsBySeller, listListingsForSeller, listingStatus } from '../db/listings.js';
import { deleteProfile } from '../db/profiles.js';
import { deleteTelegramAccountByAddress } from '../db/telegramAccounts.js';
import { removeTelegramLink } from '../db/telegramLinks.js';
import { deleteUserDurably, getUserByAddress } from '../db/users.js';
import { deleteWhatsappAccountByAddress } from '../db/whatsapp.js';
import { readUserGatewayBalance } from '../gateway/balance.js';
import { logger } from '../logger.js';
import { liveDirect } from '../messages/live.js';
import { scrubNotesBy } from '../db/ratings.js';
import { moneyOutStore } from '../moneyOut/live.js';
import { deleteConversationsFor } from '../support/store.js';
import { evidenceDeps } from '../verification/live.js';
import { revokeFact } from '../verification/evidence.js';
import { gatewayAvailableUsd } from '../x402/buyerClient.js';
import { holdingsOf } from './holdings.js';
import type { Standing } from './rules.js';
import { createAccountDeletion, type Eraser } from './service.js';
import { createMemoryDeletionStore, createPostgresDeletionStore } from './store.js';
import { forgetWorldIdSessions, releasePersonCheckNullifiers } from './worldId.js';

const SWEEP_MS = 10 * 60_000;
// PositionState in KarwanVault: None, Active, Cooling, Withdrawn.
const POSITION_ACTIVE = 1;
const POSITION_COOLING = 2;
const micros = (usdc: string | number) => parseUnits(typeof usdc === 'number' ? usdc.toFixed(6) : usdc, 6);

const chains = CIRCLE_WALLET_CHAIN_KEYS.map((key) => ({ key, circleBlockchain: CCTP_CHAINS[key].circleBlockchain! }));

async function standing(address: string): Promise<Standing> {
  const record = await getAgentWallets(address);
  const parties = [address, record?.buyerAddress, record?.sellerAddress].filter((a): a is string => !!a);
  const open = new Set<string>();
  for (const party of parties) {
    for (const d of await listDealsForAddress(party)) if (!d.cancelledAt && !d.settledAt) open.add(d.jobId);
  }
  const requests = record?.buyerAddress
    ? getBuyerSnapshot(record.buyerAddress).jobs.filter((j) => !j.cancelledAt && !j.finalized && !j.expiredAt && !j.negotiationEndedAt)
    : [];
  const bids = record?.sellerAddress ? getSellerSnapshot(record.sellerAddress).activeBids.filter((b) => !b.finalized) : [];

  return {
    openDeals: open.size,
    liveOffers: listListingsForSeller(address).filter((l) => listingStatus(l) === 'open').length,
    openRequests: requests.length,
    activeBids: bids.length,
    holdings: await holdingsOf(address, record, chains, {
      arc: readUsdcBalance,
      chain: async (key, a) => {
        const v = await readSourceUsdcBalance(key as (typeof CIRCLE_WALLET_CHAIN_KEYS)[number], a);
        if (v === null) throw new Error(`${key} balance unreadable`);
        return micros(v);
      },
      solana: async (a) => {
        const h = await readSolanaHolding(a);
        if (h.usdc === null) throw new Error('solana balance unreadable');
        return micros(h.usdc);
      },
      unified: async (identity) => micros((await readUserGatewayBalance(identity))?.available ?? 0),
      gatewayDeposit: async (depositor) => micros(await gatewayAvailableUsd(depositor)),
      // Every live position, cooling ones included, read straight from the
      // vault: the reputation summary reads a failed call as no stake, and
      // here a failed read must count as money.
      stake: async (identity) => {
        const address = config.KARWAN_VAULT_ADDR as Address | undefined;
        if (!address) return 0n;
        const owner = identity as Address;
        const count = await publicClient.readContract({ address, abi: vaultAbi, functionName: 'positionCountOf', args: [owner] });
        let total = 0n;
        for (let i = 0n; i < count; i++) {
          const id = await publicClient.readContract({ address, abi: vaultAbi, functionName: 'ownerPositionIds', args: [owner, i] });
          const p = await publicClient.readContract({ address, abi: vaultAbi, functionName: 'positions', args: [id] });
          if (p[5] === POSITION_ACTIVE || p[5] === POSITION_COOLING) total += p[1];
        }
        return total;
      },
    }),
  };
}

async function walletIds(address: string): Promise<string[]> {
  const record = await getAgentWallets(address);
  const byChain = (m?: Record<string, { walletId: string }>) => Object.values(m ?? {}).map((w) => w.walletId);
  const ids = [
    getUserByAddress(address)?.circleIdentityWalletId,
    record?.buyerWalletId,
    record?.sellerWalletId,
    record?.x402Wallet?.walletId,
    record?.gatewayWallet?.walletId,
    ...byChain(record?.bridgeWallets),
    ...byChain(record?.buyerBridgeWallets),
    ...byChain(record?.sellerBridgeWallets),
    ...Object.values(record?.legacyBridgeWallets ?? {}).flat().map((w) => w.walletId),
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}

const eraser: Eraser = {
  walletIds,
  revokeFacts: async (address) => {
    const now = Date.now();
    for (const f of await evidenceDeps.getStored(address.toLowerCase())) {
      if (f.revokedAt === undefined) await revokeFact(address, f.id, now, evidenceDeps);
    }
  },
  factsSettled: async (address) =>
    (await evidenceDeps.getStored(address.toLowerCase())).every((f) => !f.onchain || f.onchain.revokedTxHash !== undefined),
  dropFacts: (address) => deleteRecord('facts', address.toLowerCase()),
  stores: [
    {
      name: 'verification requests',
      run: async (address) => {
        const a = address.toLowerCase();
        for (const r of await listRecords<{ address?: string }>('cac')) if (r.data.address?.toLowerCase() === a) await deleteRecord('cac', r.key);
        for (const r of await listRecords<{ subject?: string }>('confirm')) if (r.data.subject?.toLowerCase() === a) await deleteRecord('confirm', r.key);
      },
    },
    {
      name: 'invoice and registration claims',
      run: async (address) => {
        for (const kind of ['fp', 'rc'] as const) {
          for (const key of await keysHeldBy(kind, address)) await releaseUnique(kind, key, address);
        }
      },
    },
    {
      name: 'World ID session',
      run: async (address) => {
        if (pgEnabled) await forgetWorldIdSessions(withPostgresTransaction, address);
      },
    },
    { name: 'saved addresses', run: (address) => moneyOutStore.forget(address) },
    { name: 'activity', run: deleteActivityFor },
    { name: 'assistant usage', run: deleteAssistantUsage },
    {
      name: 'offers and requests',
      run: async (address) => {
        const a = address.toLowerCase();
        deleteListingsBySeller(a, (l) => l.matchedAt !== undefined);
        const withDeal = new Set<string>();
        for (const b of listAllBriefs()) {
          if (b.postedBy.toLowerCase() === a && (await getDeal(b.jobId))) withDeal.add(b.jobId);
        }
        deleteBriefsByPoster(a, (b) => withDeal.has(b.jobId));
      },
    },
    {
      name: 'support and feedback',
      run: async (address) => {
        deleteConversationsFor(address);
        deleteFeedbackFromWallet(address);
      },
    },
    { name: 'profile', run: deleteProfile },
    { name: 'account', run: deleteUserDurably },
    { name: 'agent wallets', run: deleteAgentWallets },
    { name: 'record reads', run: async (address) => { await deleteReadsFor(address); } },
    { name: 'direct messages', run: (address) => liveDirect.forget(address) },
    { name: 'rating notes', run: (address) => scrubNotesBy(address) },
    { name: 'delivery questions', run: (address) => deleteRecord('delivery-q', address.toLowerCase()) },
  ],
  dropChatAccount: async (address) => {
    await removeTelegramLink(address);
    await deleteTelegramAccountByAddress(address);
    await deleteWhatsappAccountByAddress(address);
  },
  releaseNullifiers: async (address) => {
    const keys = await keysHeldBy('nullifier', address);
    if (pgEnabled && config.WORLD_ID_ACTION) await releasePersonCheckNullifiers(withPostgresTransaction, keys, config.WORLD_ID_ACTION);
    for (const key of keys) await releaseUnique('nullifier', key, address);
  },
};

export const accountDeletion = createAccountDeletion({
  now: Date.now,
  newId: () => `del-${randomUUID()}`,
  store: pgEnabled ? createPostgresDeletionStore(withPostgresTransaction) : createMemoryDeletionStore(),
  chatAccount: async (address) => {
    const found = await findChatAccountByAddress(address);
    return found ? { channel: found.channel } : null;
  },
  standing,
  tell: async (address, m) => {
    await tellAccount(address, m);
  },
  erase: eraser,
  warn: (message, data) => logger.warn(data, message),
});

/// Runs due deletions every ten minutes. Each run is safe to repeat.
export function startAccountDeletionSweep(): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    accountDeletion
      .sweep()
      .then((n) => {
        if (n > 0) logger.info({ worked: n }, 'account deletion: sweep');
      })
      .catch((err) => logger.warn({ err: (err as Error).message }, 'account deletion: sweep failed'))
      .finally(() => {
        running = false;
      });
  }, SWEEP_MS);
  return () => clearInterval(timer);
}
