import { erc20Abi, type Hex } from 'viem';
import { readSession } from '../auth/session.js';
import { publicClient } from '../chain/client.js';
import { usdc } from '../chain/contracts.js';
import { guaranteeState, guaranteeVaultAbi } from '../chain/guaranteeVault.js';
import { guaranteeVaultEnabled } from '../chain/suiteConfig.js';
import { getPositionsByOwner } from '../chain/vaultScanCache.js';
import { appendActivity } from '../db/activityLog.js';
import { getMoneyMovementByOperationKey } from '../db/moneyMovements.js';
import { getUserByAddress } from '../db/users.js';
import { suiteIdentity } from '../identity/suiteIdentityLive.js';
import { logger } from '../logger.js';
import { completeWeb3Guarantee, executeCircleGuarantee, prepareWeb3Guarantee, type GuaranteeStep } from '../money/guarantee.js';
import { formatUsdcMicros } from '../money/model.js';
import { requirePresence } from '../presence/live.js';
import type { GuaranteeDeps } from './guarantee.js';

const ACTIVE = 1;
const COOLING = 2;

const ACTIVITY: Record<GuaranteeStep, { kind: 'stake' | 'unstake'; t: string; summary: string }> = {
  put_up: { kind: 'stake', t: 'guaranteePutUp', summary: 'Put up {a} USDC as a deal guarantee' },
  take_out: { kind: 'stake', t: 'guaranteeTakeOut', summary: 'Started taking out {a} USDC from the deal guarantee' },
  cancel: { kind: 'stake', t: 'guaranteeCancel', summary: 'Cancelled taking out {a} USDC from the deal guarantee' },
  collect: { kind: 'unstake', t: 'guaranteeCollect', summary: 'Collected {a} USDC from the deal guarantee' },
};

function vaultOrThrow(): Hex {
  const vault = guaranteeVaultEnabled();
  if (!vault) throw new Error('the guarantee vault is off');
  return vault;
}

/// The guarantee as the page shows it, for the assistant's tools.
export async function guaranteeSnapshot(address: string) {
  if (!liveGuaranteeDeps.vault()) return null;
  const identityId = await liveGuaranteeDeps.identityId(address);
  const empty = { active: 0n, reserved: 0n, cooling: 0n, coolUntil: 0n };
  const [stake, free, previousMicros] = await Promise.all([
    identityId === 0n ? empty : liveGuaranteeDeps.read.stakeOf(identityId),
    identityId === 0n ? 0n : liveGuaranteeDeps.read.freeOf(identityId),
    liveGuaranteeDeps.read.previousVaultMicros(address),
  ]);
  return { state: guaranteeState(stake, free, liveGuaranteeDeps.now()), previousMicros, waitDays: 7 };
}

export const liveGuaranteeDeps: GuaranteeDeps = {
  vault: () => (suiteIdentity ? guaranteeVaultEnabled() : null),
  usdc: usdc as Hex,
  session: readSession,
  requirePresence,
  identityId: async (address) => (suiteIdentity ? (await suiteIdentity.identityStatus(address)).identityId : 0n),
  // The selling side of the record: the selling agent is what later lets the
  // guarantee back a buyer or an advance (view 27).
  ensureRecord: async (address) => (suiteIdentity ? suiteIdentity.ensureRecord(address, 'seller') : 'not-ready'),
  read: {
    stakeOf: async (identityId) => {
      const s = await publicClient.readContract({ address: vaultOrThrow(), abi: guaranteeVaultAbi, functionName: 'stakeOf', args: [identityId, usdc as Hex] });
      return { active: s.active, reserved: s.reserved, cooling: s.cooling, coolUntil: s.coolUntil };
    },
    freeOf: (identityId) => publicClient.readContract({ address: vaultOrThrow(), abi: guaranteeVaultAbi, functionName: 'freeOf', args: [identityId, usdc as Hex] }),
    balanceOf: (address) => publicClient.readContract({ address: usdc as Hex, abi: erc20Abi, functionName: 'balanceOf', args: [address as Hex] }),
    previousVaultMicros: async (address) => {
      const view = await getPositionsByOwner(address).catch(() => null);
      if (!view) return 0n;
      return view.positions.filter((p) => p.state === ACTIVE || p.state === COOLING).reduce((sum, p) => sum + BigInt(p.principalWei), 0n);
    },
  },
  now: () => Math.floor(Date.now() / 1000),
  circleWalletId: async (address) => getUserByAddress(address.toLowerCase())?.circleIdentityWalletId ?? null,
  executeCircle: async (input) => {
    const out = await executeCircleGuarantee(input);
    return { reference: out.movement.reference, txHash: out.txHash };
  },
  prepareWeb3: async (input) => ({ reference: (await prepareWeb3Guarantee(input)).movement.reference }),
  completeWeb3: async (input) => ({ reference: (await completeWeb3Guarantee(input)).reference }),
  findIntent: async (operationKey) => {
    const m = await getMoneyMovementByOperationKey(operationKey).catch(() => null);
    return m ? { reference: m.reference, amountMicros: m.amountMicros } : null;
  },
  activity: ({ step, address, amountMicros, txHash, reference, requestId }) => {
    const a = formatUsdcMicros(amountMicros);
    const entry = ACTIVITY[step];
    void appendActivity({
      id: `guarantee:${step}:${address.toLowerCase()}:${requestId}`,
      address,
      kind: entry.kind,
      summary: entry.summary.replace('{a}', a),
      params: { t: entry.t, amount: a },
      amountUsdc: a,
      txHash: txHash ?? undefined,
      refId: reference,
    }).catch((err) => logger.warn({ err: (err as Error).message }, 'guarantee activity write failed'));
  },
};
