import type { Address, Hex } from 'viem';
import { readSession } from '../auth/session.js';
import { publicClient } from '../chain/client.js';
import { findLegacyDeal, forgetVaultIndex, simulates, vaultPositionsFor } from '../chain/legacyLive.js';
import { executeContractCall } from '../chain/txs.js';
import { config } from '../config.js';
import { appendActivity } from '../db/activityLog.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { listDealsForAddress, patchDeal } from '../db/deals.js';
import { getUserByAddress } from '../db/users.js';
import { logger } from '../logger.js';
import { formatUsdcMicros } from '../money/model.js';
import type { LegacyDeps } from './legacyContracts.js';

const ACTIVITY = {
  requestWithdraw: { kind: 'stake', t: 'legacyTakeOut', summary: 'Started taking out {a} USDC from an older contract' },
  cancelWithdraw: { kind: 'stake', t: 'legacyCancel', summary: 'Cancelled taking out {a} USDC from an older contract' },
  claim: { kind: 'unstake', t: 'legacyCollect', summary: 'Collected {a} USDC from an older contract' },
  releaseFinal: { kind: 'release', t: 'legacyRelease', summary: 'Released {a} USDC from an older deal' },
  refund: { kind: 'refund', t: 'legacyRefund', summary: 'Got {a} USDC back from an older deal' },
} as const;

export const liveLegacyDeps: LegacyDeps = {
  session: readSession,
  wallets: async (address) => {
    const user = getUserByAddress(address.toLowerCase());
    const agents = await getAgentWallets(address).catch(() => null);
    return {
      identity: { address: address.toLowerCase(), walletId: user?.circleIdentityWalletId ?? null },
      buyer: agents ? { address: agents.buyerAddress.toLowerCase(), walletId: agents.buyerWalletId } : null,
      seller: agents ? { address: agents.sellerAddress.toLowerCase(), walletId: agents.sellerWalletId } : null,
    };
  },
  dealsFor: async (address) =>
    (await listDealsForAddress(address.toLowerCase())).map((d) => ({
      jobId: d.jobId,
      buyer: d.buyer,
      seller: d.seller,
      buyerAgentWalletId: d.buyerAgentWalletId ?? null,
      sellerAgentWalletId: d.sellerAgentWalletId ?? null,
    })),
  findDeal: async (jobId) => {
    const hit = await findLegacyDeal(jobId);
    return hit ? { escrow: hit.escrow, deal: hit.deal } : null;
  },
  vaultPositionsFor,
  simulates,
  previousVault: (config.KARWAN_VAULT_ADDR?.toLowerCase() as Address | undefined) ?? null,
  now: () => Math.floor(Date.now() / 1000),
  execute: (walletId, contract, signature, params) =>
    executeContractCall({ walletId, contractAddress: contract, abiFunctionSignature: signature, abiParameters: params }, `legacy.${signature}(${contract})`),
  confirmed: async (txHash) => (await publicClient.getTransactionReceipt({ hash: txHash as Hex })).status === 'success',
  afterStep: async ({ kind, step, address, contract, ref, amountMicros, txHash }) => {
    if (kind === 'guarantee') forgetVaultIndex(contract);
    // A deal finished here drops out of the open lists, as it did on the old page.
    if (step === 'releaseFinal') await patchDeal(ref, { settledAt: Date.now() }).catch(() => undefined);
    if (step === 'refund') {
      await patchDeal(ref, { cancelledAt: Date.now(), cancelKind: 'unilateral', cancelReason: 'Refunded from an older contract.' }).catch(() => undefined);
    }
    const a = formatUsdcMicros(amountMicros);
    const entry = ACTIVITY[step];
    await appendActivity({
      id: `legacy:${step}:${contract}:${ref}:${txHash}`,
      address,
      kind: entry.kind,
      summary: entry.summary.replace('{a}', a),
      params: { t: entry.t, amount: a },
      amountUsdc: a,
      txHash,
    }).catch((err) => logger.warn({ err: (err as Error).message }, 'legacy activity write failed'));
  },
};
