/// Deal insurance from the assistant (view 31, phase A): taking it out, which
/// starts the vault's wait, cancelling that wait, and collecting it once the
/// wait ends. Pure, so every refusal and every card is tested without the
/// chain. The tools in agent.ts read the positions and pass them in.

import { confirmNonce, type ConfirmActionBase } from './actions.js';

/// One vault position as the scan cache holds it, in USDC.
export interface InsurancePosition {
  positionId: string;
  amountUsdc: number;
  /// 1 active, 2 waiting (cooling), 3 collected; the vault's PositionState.
  state: number;
  /// Unix seconds when a waiting position can be collected.
  claimableAt: number;
}

/// Who signs: Karwan for a wallet it holds, the person's own wallet otherwise.
export type InsuranceSigner = 'karwan' | 'wallet';

export interface InsurancePayload {
  address: string;
  positionIds: string[];
  amountUsdc: string;
  signer: InsuranceSigner;
}

export interface InsuranceTakeOutConfirm extends ConfirmActionBase {
  intent: 'insurance_take_out';
  payload: InsurancePayload;
}
export interface InsuranceCancelTakeOutConfirm extends ConfirmActionBase {
  intent: 'insurance_cancel_take_out';
  payload: InsurancePayload;
}
export interface InsuranceCollectConfirm extends ConfirmActionBase {
  intent: 'insurance_collect';
  payload: InsurancePayload;
}

const EPS = 0.000_001;
const ACTIVE = 1;
const WAITING = 2;

const usdc = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const day = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/// The positions to start the wait on for `amount`. The vault waits on whole
/// positions, so this picks the set that takes out the least beyond what was
/// asked, the same way the deal insurance page does (StakeCard.tsx): an exact
/// match, else the smallest single position that covers it, else newest first.
export function positionsToTakeOut(active: readonly InsurancePosition[], amount: number): InsurancePosition[] {
  const exact = active.find((p) => Math.abs(p.amountUsdc - amount) < EPS);
  if (exact) return [exact];
  const covering = active.filter((p) => p.amountUsdc >= amount - EPS).sort((a, b) => a.amountUsdc - b.amountUsdc);
  if (covering.length > 0) return [covering[0]!];
  const out: InsurancePosition[] = [];
  let sum = 0;
  for (const p of [...active].sort((a, b) => Number(BigInt(b.positionId) - BigInt(a.positionId)))) {
    if (sum >= amount - EPS) break;
    out.push(p);
    sum += p.amountUsdc;
  }
  return out;
}

const total = (ps: readonly InsurancePosition[]) => ps.reduce((acc, p) => acc + p.amountUsdc, 0);

export function buildTakeOutConfirm(i: {
  address: string;
  positions: readonly InsurancePosition[];
  /// What is not held against open deals.
  freeUsdc: number;
  reservedUsdc: number;
  /// Omitted: everything that is free.
  amountUsdc?: number;
  waitDays: number;
  nowUnix: number;
  signer: InsuranceSigner;
}): InsuranceTakeOutConfirm | { error: string } {
  const active = i.positions.filter((p) => p.state === ACTIVE && p.amountUsdc > 0);
  if (active.length === 0) return { error: 'They have no deal insurance to take out.' };
  if (!(i.freeUsdc > EPS)) {
    return { error: `All ${usdc(i.reservedUsdc)} USDC of their deal insurance protects open deals. It can be taken out once those deals settle.` };
  }
  const amount = i.amountUsdc ?? i.freeUsdc;
  if (!(amount > 0)) return { error: 'The amount must be greater than 0.' };
  if (amount > i.freeUsdc + EPS) {
    return {
      error: `Only ${usdc(i.freeUsdc)} USDC can be taken out now${i.reservedUsdc > EPS ? `; ${usdc(i.reservedUsdc)} USDC protects open deals until they settle` : ''}.`,
    };
  }
  const chosen = positionsToTakeOut(active, amount);
  const waiting = total(chosen);
  const ready = i.nowUnix + i.waitDays * 86_400;
  const fields = [
    { label: 'Amount', value: `${usdc(waiting)} USDC` },
    ...(waiting > amount + EPS ? [{ label: 'You asked for', value: `${usdc(amount)} USDC` }] : []),
    { label: 'Wait', value: `${i.waitDays} days` },
    { label: 'Ready to collect', value: day(ready) },
  ];
  return {
    kind: 'confirm',
    id: `insurance_take_out:${chosen.map((p) => p.positionId).join('-')}:${confirmNonce()}`,
    intent: 'insurance_take_out',
    title: 'Take out deal insurance',
    summary: `Start the ${i.waitDays}-day wait on ${usdc(waiting)} USDC. You collect it on ${day(ready)}.`,
    warning:
      waiting > amount + EPS
        ? `Insurance comes out in the amounts it was put up in, so ${usdc(waiting)} USDC starts the wait. While it waits it no longer protects your deals or counts toward your record. You can cancel the wait until you collect.`
        : 'While it waits it no longer protects your deals or counts toward your record. You can cancel the wait until you collect.',
    fields,
    payload: { address: i.address, positionIds: chosen.map((p) => p.positionId), amountUsdc: usdc(waiting), signer: i.signer },
    confirmLabel: 'Start the wait',
    cancelLabel: 'Not now',
  };
}

export function buildCancelTakeOutConfirm(i: {
  address: string;
  positions: readonly InsurancePosition[];
  signer: InsuranceSigner;
}): InsuranceCancelTakeOutConfirm | { error: string } {
  const waiting = i.positions.filter((p) => p.state === WAITING && p.amountUsdc > 0);
  if (waiting.length === 0) return { error: 'None of their deal insurance is waiting to be taken out.' };
  const amount = total(waiting);
  return {
    kind: 'confirm',
    id: `insurance_cancel_take_out:${waiting.map((p) => p.positionId).join('-')}:${confirmNonce()}`,
    intent: 'insurance_cancel_take_out',
    title: 'Keep your deal insurance',
    summary: `Stop the wait. ${usdc(amount)} USDC protects your deals again.`,
    fields: [{ label: 'Amount', value: `${usdc(amount)} USDC` }],
    payload: { address: i.address, positionIds: waiting.map((p) => p.positionId), amountUsdc: usdc(amount), signer: i.signer },
    confirmLabel: 'Keep it',
    cancelLabel: 'Not now',
  };
}

export function buildCollectConfirm(i: {
  address: string;
  positions: readonly InsurancePosition[];
  nowUnix: number;
  signer: InsuranceSigner;
}): InsuranceCollectConfirm | { error: string } {
  const waiting = i.positions.filter((p) => p.state === WAITING && p.amountUsdc > 0);
  const ready = waiting.filter((p) => p.claimableAt <= i.nowUnix);
  if (ready.length === 0) {
    if (waiting.length === 0) return { error: 'None of their deal insurance is waiting to be taken out, so there is nothing to collect.' };
    const next = Math.min(...waiting.map((p) => p.claimableAt));
    return { error: `The wait has not ended yet. It can be collected on ${day(next)}.` };
  }
  const amount = total(ready);
  return {
    kind: 'confirm',
    id: `insurance_collect:${ready.map((p) => p.positionId).join('-')}:${confirmNonce()}`,
    intent: 'insurance_collect',
    title: 'Collect your deal insurance',
    summary: `${usdc(amount)} USDC goes back to your wallet.`,
    fields: [
      { label: 'Amount', value: `${usdc(amount)} USDC` },
      { label: 'To', value: 'Your wallet' },
    ],
    payload: { address: i.address, positionIds: ready.map((p) => p.positionId), amountUsdc: usdc(amount), signer: i.signer },
    confirmLabel: 'Collect',
    cancelLabel: 'Not now',
  };
}
