import { erc20Abi, parseEventLogs, type TransactionReceipt } from 'viem';
import { ARC, publicClient } from '../chain/client.js';
import { guaranteeVaultAbi } from '../chain/guaranteeVault.js';
import { sentTo } from '../chain/multicall3From.js';
import { executeContractCall } from '../chain/txs.js';
import { ensureMoneyMovement } from '../db/moneyMovements.js';
import { formatUsdcMicros } from './model.js';
import {
  completeMoneyMovement,
  currentMoneyMovement,
  markMoneyMovementNeedsAttention,
  prepareMoneyMovementContractLeg,
  verifyMoneyMovementLeg,
} from './service.js';
import { receiptParties } from './vaultStake.js';

/// Deal guarantee steps on the family vault (view 37). The vault keys every
/// amount by identity, so each proof checks the identity id in the vault's own
/// event as well as the USDC that moved.

export type GuaranteeStep = 'put_up' | 'take_out' | 'cancel' | 'collect';

export function guaranteeOperationKey(walletAddress: string, step: GuaranteeStep, requestId: string): string {
  return `guarantee:${step}:${walletAddress.toLowerCase()}:${requestId}`;
}

interface TransferProof {
  tokenAddress: string;
  from?: string;
  to?: string;
  value?: bigint;
}

interface ReceiptSide {
  receiptTo: string | null | undefined;
  receiptFrom: string | null | undefined;
  /// A user operation from a smart account: the receipt names the EntryPoint,
  /// so the vault's events prove the target instead.
  smartAccount?: boolean;
  vaultAddress: string;
  walletAddress: string;
  identityId: bigint;
  usdcAddress: string;
}

const eq = (a: string | null | undefined, b: string) => (a ?? '').toLowerCase() === b.toLowerCase();

function checkSides(input: ReceiptSide): void {
  // An own wallet's put up arrives through Multicall3From with its record steps.
  if (!input.smartAccount && !sentTo(input.receiptTo, input.vaultAddress)) throw new Error('guarantee receipt target does not match the vault');
  if (!eq(input.receiptFrom, input.walletAddress)) throw new Error('guarantee receipt sender does not match the wallet');
}

export function proveGuaranteeStake(
  input: ReceiptSide & {
    expectedAmountMicros: bigint;
    transfers: readonly TransferProof[];
    staked: readonly { emitter: string; owner?: bigint; from?: string; amount?: bigint }[];
  },
): bigint {
  checkSides(input);
  const transfers = input.transfers.filter(
    (t) => eq(t.tokenAddress, input.usdcAddress) && eq(t.from, input.walletAddress) && eq(t.to, input.vaultAddress) && typeof t.value === 'bigint' && t.value > 0n,
  );
  if (transfers.length !== 1) throw new Error('guarantee receipt has no unique USDC transfer into the vault');
  const amount = transfers[0]!.value!;
  if (amount !== input.expectedAmountMicros) throw new Error('guarantee amount does not match the on-chain transfer');
  const staked = input.staked.filter(
    (e) => eq(e.emitter, input.vaultAddress) && e.owner === input.identityId && eq(e.from, input.walletAddress) && e.amount === amount,
  );
  if (staked.length !== 1) throw new Error('guarantee receipt has no unique Staked event for this identity');
  return amount;
}

type StepEvent =
  | { name: 'WithdrawRequested'; emitter: string; owner?: bigint; amount?: bigint }
  | { name: 'WithdrawCancelled'; emitter: string; owner?: bigint }
  | { name: 'Withdrawn'; emitter: string; owner?: bigint; to?: string; amount?: bigint };

const STEP_EVENT = { take_out: 'WithdrawRequested', cancel: 'WithdrawCancelled', collect: 'Withdrawn' } as const;

export function proveGuaranteeStep(
  input: ReceiptSide & {
    step: Exclude<GuaranteeStep, 'put_up'>;
    amountMicros: bigint;
    events: readonly StepEvent[];
    transfers: readonly TransferProof[];
  },
): void {
  checkSides(input);
  const name = STEP_EVENT[input.step];
  const match = input.events.find((e) => {
    if (e.name !== name || !eq(e.emitter, input.vaultAddress) || e.owner !== input.identityId) return false;
    if (e.name === 'WithdrawRequested') return e.amount === input.amountMicros;
    if (e.name === 'Withdrawn') return e.amount === input.amountMicros && eq(e.to, input.walletAddress);
    return true;
  });
  if (!match) throw new Error(`guarantee receipt has no matching ${name} event for this identity`);
  if (input.step === 'collect') {
    const payout = input.transfers.find(
      (t) => eq(t.tokenAddress, input.usdcAddress) && eq(t.from, input.vaultAddress) && eq(t.to, input.walletAddress) && t.value === input.amountMicros,
    );
    if (!payout) throw new Error('guarantee collect has no exact USDC payout to the wallet');
  }
}

function readReceipt(receipt: TransactionReceipt) {
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs, strict: false }).map((e) => ({
    tokenAddress: e.address,
    ...(e.args as { from?: string; to?: string; value?: bigint }),
  }));
  const vaultLogs = parseEventLogs({ abi: guaranteeVaultAbi, logs: receipt.logs, strict: false });
  const staked = vaultLogs
    .filter((e) => e.eventName === 'Staked')
    .map((e) => ({ emitter: e.address, ...(e.args as { owner?: bigint; from?: string; amount?: bigint }) }));
  const events = vaultLogs
    .filter((e) => e.eventName === 'WithdrawRequested' || e.eventName === 'WithdrawCancelled' || e.eventName === 'Withdrawn')
    .map((e) => ({ name: e.eventName, emitter: e.address, ...(e.args as object) }) as StepEvent);
  return { transfers, staked, events };
}

function proveReceipt(
  receipt: TransactionReceipt,
  step: GuaranteeStep,
  side: Omit<ReceiptSide, 'receiptTo' | 'receiptFrom' | 'smartAccount'>,
  amountMicros: bigint,
): void {
  if (receipt.status !== 'success') throw new Error('guarantee transaction reverted');
  const parties = receiptParties(receipt, side.walletAddress);
  const read = readReceipt(receipt);
  if (step === 'put_up') proveGuaranteeStake({ ...parties, ...side, expectedAmountMicros: amountMicros, transfers: read.transfers, staked: read.staked });
  else proveGuaranteeStep({ ...parties, ...side, step, amountMicros, events: read.events, transfers: read.transfers });
}

const SUMMARY: Record<GuaranteeStep, (amount: string) => string> = {
  put_up: (a) => `Deposited ${a} USDC to your deal guarantee`,
  take_out: (a) => `Started withdrawing ${a} USDC from your deal guarantee`,
  cancel: (a) => `Cancelled withdrawing ${a} USDC from your deal guarantee`,
  collect: (a) => `Collected ${a} USDC from your deal guarantee`,
};

const LEG_KEY = 'guarantee';

export async function ensureGuaranteeMovement(input: {
  operationKey: string;
  step: GuaranteeStep;
  walletAddress: string;
  vaultAddress: string;
  amountMicros: bigint;
}) {
  const out = input.step === 'collect';
  return ensureMoneyMovement({
    operationKey: input.operationKey,
    kind: out ? 'cash_out' : 'stake',
    amountMicros: input.amountMicros,
    initiatedBy: input.walletAddress,
    participants: [
      { address: input.walletAddress, role: 'owner' },
      { address: out ? input.vaultAddress : input.walletAddress, role: 'source' },
      { address: out ? input.walletAddress : input.vaultAddress, role: 'recipient' },
    ],
    summary: SUMMARY[input.step](formatUsdcMicros(input.amountMicros)),
    nextActor: 'karwan',
  });
}

function legPlan(input: { step: GuaranteeStep; walletAddress: string; vaultAddress: string; amountMicros: bigint }, rail: 'arc_contract' | 'circle_wallets', walletId?: string) {
  const out = input.step === 'collect';
  return {
    key: LEG_KEY,
    label: `Deal guarantee ${input.step.replace('_', ' ')}`,
    rail,
    ...(walletId ? { walletId } : {}),
    signerAddress: input.walletAddress,
    sourceAddress: out ? input.vaultAddress : input.walletAddress,
    destinationAddress: out ? input.walletAddress : input.vaultAddress,
    contractAddress: input.vaultAddress,
    amountMicros: input.amountMicros,
  };
}

/// A browser wallet signs; the server only holds the reference it reconciles.
export async function prepareWeb3Guarantee(input: {
  operationKey: string;
  step: GuaranteeStep;
  walletAddress: string;
  vaultAddress: string;
  amountMicros: bigint;
}) {
  const ensured = await ensureGuaranteeMovement(input);
  if (ensured.movement.state === 'needs_attention') throw new Error(`guarantee step needs attention (${ensured.movement.reference})`);
  const prepared = await prepareMoneyMovementContractLeg(ensured.movement.reference, legPlan(input, 'arc_contract'));
  return { movement: prepared.movement };
}

export async function completeWeb3Guarantee(input: {
  reference: string;
  step: GuaranteeStep;
  walletAddress: string;
  identityId: bigint;
  vaultAddress: string;
  usdcAddress: string;
  amountMicros: bigint;
  txHash: string;
}) {
  const movement = await currentMoneyMovement(input.reference);
  if (movement.state === 'completed') return movement;
  if (movement.amountMicros !== input.amountMicros.toString()) throw new Error('guarantee amount does not match the original intent');
  const leg = movement.legs.find((l) => l.attempt === movement.attempt && l.key === LEG_KEY);
  if (!leg) throw new Error('guarantee intent is not prepared');
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: input.txHash as `0x${string}` });
    proveReceipt(receipt, input.step, input, input.amountMicros);
    const plan = await prepareMoneyMovementContractLeg(input.reference, legPlan(input, 'arc_contract'));
    await plan.lifecycle.onSubmitted?.({ txId: input.txHash, estimatedFee: null });
    await plan.lifecycle.onConfirmed?.({ txId: input.txHash, txHash: input.txHash, explorerUrl: `${ARC.explorer}/tx/${input.txHash}` });
    await verifyMoneyMovementLeg(input.reference, leg.id, { amountMicros: input.amountMicros });
    return completeMoneyMovement(input.reference, { amountMicros: input.amountMicros });
  } catch (error) {
    await markMoneyMovementNeedsAttention(input.reference, `GUARANTEE_${input.step.toUpperCase()}_PROOF_MISMATCH`);
    throw error;
  }
}

const CALL: Record<GuaranteeStep, string> = {
  put_up: 'stake(address,uint256)',
  take_out: 'requestWithdraw(address,uint256)',
  cancel: 'cancelWithdraw(address)',
  collect: 'withdraw(address)',
};

/// A wallet Karwan holds: Karwan signs each call after the person confirms.
/// Putting up is two calls, the USDC approval and the stake, each proved
/// before the next is sent.
export async function executeCircleGuarantee(input: {
  operationKey: string;
  step: GuaranteeStep;
  walletAddress: string;
  walletId: string;
  identityId: bigint;
  vaultAddress: string;
  usdcAddress: string;
  amountMicros: bigint;
}) {
  const ensured = await ensureGuaranteeMovement(input);
  const reference = ensured.movement.reference;
  if (ensured.movement.state === 'completed') return { movement: ensured.movement, txHash: ensured.movement.legs.find((l) => l.key === LEG_KEY)?.txHash ?? null };
  if (ensured.movement.state === 'needs_attention') throw new Error(`guarantee step needs attention (${reference})`);
  try {
    if (input.step === 'put_up') {
      const approve = await prepareMoneyMovementContractLeg(reference, { ...legPlan(input, 'circle_wallets', input.walletId), key: 'approve', label: 'Deal guarantee USDC approval', contractAddress: input.usdcAddress });
      if (approve.leg.state !== 'verified') {
        const sent = await executeContractCall(
          {
            walletId: input.walletId,
            contractAddress: input.usdcAddress,
            abiFunctionSignature: 'approve(address,uint256)',
            abiParameters: [input.vaultAddress, input.amountMicros.toString()],
            idempotencyKey: approve.idempotencyKey,
            lifecycle: approve.lifecycle,
          },
          'guarantee.approve',
        );
        const receipt = await publicClient.getTransactionReceipt({ hash: sent.txHash as `0x${string}` });
        const approved = parseEventLogs({ abi: erc20Abi, eventName: 'Approval', logs: receipt.logs, strict: false }).some(
          (e) => eq(e.address, input.usdcAddress) && eq(e.args.owner, input.walletAddress) && eq(e.args.spender, input.vaultAddress) && e.args.value === input.amountMicros,
        );
        if (receipt.status !== 'success' || !approved) throw new Error('guarantee approval has no exact allowance for the vault');
        await verifyMoneyMovementLeg(reference, approve.leg.id, { amountMicros: input.amountMicros });
      }
    }
    const main = await prepareMoneyMovementContractLeg(reference, legPlan(input, 'circle_wallets', input.walletId));
    if (main.leg.state === 'verified') return { movement: main.movement, txHash: main.leg.txHash ?? null };
    const args = input.step === 'put_up' || input.step === 'take_out' ? [input.usdcAddress, input.amountMicros.toString()] : [input.usdcAddress];
    const sent = await executeContractCall(
      { walletId: input.walletId, contractAddress: input.vaultAddress, abiFunctionSignature: CALL[input.step], abiParameters: args, idempotencyKey: main.idempotencyKey, lifecycle: main.lifecycle },
      `guarantee.${input.step}`,
    );
    const receipt = await publicClient.getTransactionReceipt({ hash: sent.txHash as `0x${string}` });
    proveReceipt(receipt, input.step, input, input.amountMicros);
    await verifyMoneyMovementLeg(reference, main.leg.id, { amountMicros: input.amountMicros });
    return { movement: await completeMoneyMovement(reference, { amountMicros: input.amountMicros }), txHash: sent.txHash };
  } catch (error) {
    await markMoneyMovementNeedsAttention(reference, `GUARANTEE_${input.step.toUpperCase()}_PROOF_MISMATCH`);
    throw error;
  }
}
