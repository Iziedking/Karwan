/// Payment links that accept USDC from any chain. A request gets its own
/// receiving addresses the first time a payer asks for them; money that lands
/// there is counted against the request and moved to the requester on Arc,
/// whether they signed up with email or with their own wallet.

import { config } from '../config.js';
import { logger } from '../logger.js';
import { USER_DCW_WALLETS } from '../chain/cctpChains.js';
import { listAllAgentWallets } from '../db/agentWallets.js';
import {
  circleWalletsClient,
  ARB_SEPOLIA_BLOCKCHAIN,
  BASE_SEPOLIA_BLOCKCHAIN,
  ETH_SEPOLIA_BLOCKCHAIN,
  POLYGON_AMOY_BLOCKCHAIN,
  SOL_DEVNET_BLOCKCHAIN,
} from '../circle/wallets.js';
import {
  getDepositRequest,
  listRequestsWithReceiving,
  saveDepositRequest,
  toPublicRequest,
  type DepositRequest,
} from './depositRequests.js';
import { applyIncoming, type IncomingOutcome } from './requestReceipts.js';
import { provisionRequestWallets, type WalletProvider } from './requestWallets.js';

const EVM_CHAINS = [ETH_SEPOLIA_BLOCKCHAIN, BASE_SEPOLIA_BLOCKCHAIN, ARB_SEPOLIA_BLOCKCHAIN, POLYGON_AMOY_BLOCKCHAIN];
const CREATE_TIMEOUT_MS = 30_000;

/// Off unless Karwan signs for source chains here and a separate wallet set is configured.
export function receivingSupported(): boolean {
  return USER_DCW_WALLETS && !!config.CIRCLE_PAYLINK_WALLET_SET_ID && !!config.CIRCLE_API_KEY;
}

function timed<T>(work: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), CREATE_TIMEOUT_MS)),
  ]);
}

const circleProvider: WalletProvider = {
  async create({ blockchain, accountType, refId }) {
    const res = await timed(
      circleWalletsClient().createWallets({
        blockchains: [blockchain as Parameters<ReturnType<typeof circleWalletsClient>['createWallets']>[0]['blockchains'][number]],
        count: 1,
        walletSetId: config.CIRCLE_PAYLINK_WALLET_SET_ID!,
        accountType,
        metadata: [{ name: 'karwan-paylink', refId }],
      }),
      `Circle createWallets(${blockchain})`,
    );
    const w = res.data?.wallets?.[0];
    if (!w?.id || !w.address) throw new Error(`createWallets on ${blockchain} returned no wallet`);
    return { id: w.id, address: w.address };
  },
  async derive({ walletId, blockchain, refId }) {
    const res = await timed(
      circleWalletsClient().deriveWallet({
        id: walletId,
        blockchain: blockchain as Parameters<ReturnType<typeof circleWalletsClient>['deriveWallet']>[0]['blockchain'],
        metadata: { name: 'karwan-paylink', refId },
      }),
      `Circle deriveWallet(${blockchain})`,
    );
    const w = res.data?.wallet;
    if (!w?.id || !w.address) throw new Error(`deriveWallet on ${blockchain} returned no wallet`);
    return { id: w.id, address: w.address };
  },
};

/// Any address an account or another request already holds, on any chain.
async function isKnownAddress(_blockchain: string, address: string): Promise<boolean> {
  const needle = address.toLowerCase();
  for (const w of await listAllAgentWallets()) {
    if (w.userAddress === needle || w.buyerAddress?.toLowerCase() === needle || w.sellerAddress?.toLowerCase() === needle) return true;
    if (Object.values(w.bridgeWallets ?? {}).some((b) => b.address.toLowerCase() === needle)) return true;
  }
  for (const r of await listRequestsWithReceiving()) {
    if (r.receiving?.evm.address.toLowerCase() === needle || r.receiving?.solana?.address.toLowerCase() === needle) return true;
  }
  return false;
}

export type EnsureResult =
  | { ok: true; request: DepositRequest }
  | { ok: false; reason: 'unsupported' | 'not_found' | 'closed' | 'failed' };

/// The request with its receiving addresses, made on first ask.
export async function ensureReceiving(token: string): Promise<EnsureResult> {
  if (!receivingSupported()) return { ok: false, reason: 'unsupported' };
  const request = await getDepositRequest(token);
  if (!request) return { ok: false, reason: 'not_found' };
  if (request.receiving) return { ok: true, request };
  if (toPublicRequest(request).status !== 'open') return { ok: false, reason: 'closed' };
  try {
    const receiving = await provisionRequestWallets(token, {
      provider: circleProvider,
      evmChains: EVM_CHAINS,
      solanaChain: SOL_DEVNET_BLOCKCHAIN,
      isKnownAddress,
    });
    // Another call may have saved first; keep whichever is on record.
    const latest = (await getDepositRequest(token)) ?? request;
    if (latest.receiving) return { ok: true, request: latest };
    const saved = await saveDepositRequest({ ...latest, receiving, updatedAt: Date.now() });
    invalidateReceivingIndex();
    logger.info({ token, evm: receiving.evm.address, solana: receiving.solana?.address }, 'payment link receiving addresses made');
    return { ok: true, request: saved };
  } catch (err) {
    logger.error({ token, err: (err as Error).message }, 'could not make payment link receiving addresses');
    return { ok: false, reason: 'failed' };
  }
}

/// `${blockchain}:${address}` to the request token and the wallet id there.
let index: Map<string, { token: string; walletId: string; address: string }> | null = null;
let indexAt = 0;
const INDEX_TTL_MS = 60_000;

export function invalidateReceivingIndex(): void {
  index = null;
}

export async function requestForAddress(blockchain: string, address: string) {
  if (!index || Date.now() - indexAt > INDEX_TTL_MS) {
    const next = new Map<string, { token: string; walletId: string; address: string }>();
    for (const r of await listRequestsWithReceiving()) {
      if (!r.receiving) continue;
      for (const [chain, walletId] of Object.entries(r.receiving.evm.wallets)) {
        next.set(`${chain}:${r.receiving.evm.address.toLowerCase()}`, { token: r.token, walletId, address: r.receiving.evm.address });
      }
      if (r.receiving.solana) {
        next.set(`${SOL_DEVNET_BLOCKCHAIN}:${r.receiving.solana.address.toLowerCase()}`, {
          token: r.token,
          walletId: r.receiving.solana.walletId,
          address: r.receiving.solana.address,
        });
      }
    }
    index = next;
    indexAt = Date.now();
  }
  return index.get(`${blockchain}:${address.toLowerCase()}`) ?? null;
}

/// One request's receipts are written one at a time, so two transfers landing
/// together cannot overwrite each other.
const chains = new Map<string, Promise<unknown>>();

export function recordRequestReceipt(
  token: string,
  input: { txId: string; amountUsdc: string; chain: string; now?: number },
): Promise<{ request: DepositRequest; outcome: IncomingOutcome } | null> {
  const prev = chains.get(token) ?? Promise.resolve();
  const next = prev.then(async () => {
    const request = await getDepositRequest(token);
    if (!request) return null;
    const applied = applyIncoming(request, { ...input, now: input.now ?? Date.now() });
    if (applied.outcome !== 'duplicate') await saveDepositRequest(applied.request);
    return applied;
  });
  const tail = next.catch(() => undefined);
  chains.set(token, tail);
  void tail.then(() => {
    if (chains.get(token) === tail) chains.delete(token);
  });
  return next;
}
