/// Deal guarantee and legacy contracts from the assistant (view 37). Pure, so
/// every card and refusal is tested without the chain; the tools in agent.ts
/// read the guarantee and pass it in.

import { confirmNonce, type ConfirmActionBase } from './actions.js';

export type GuaranteeSigner = 'karwan' | 'wallet';

export interface GuaranteePayload {
  address: string;
  amountUsdc: string;
  signer: GuaranteeSigner;
}

export interface GuaranteePutUpConfirm extends ConfirmActionBase {
  intent: 'guarantee_put_up';
  payload: GuaranteePayload;
}
export interface GuaranteeTakeOutConfirm extends ConfirmActionBase {
  intent: 'guarantee_take_out';
  payload: GuaranteePayload;
}
export interface GuaranteeCancelConfirm extends ConfirmActionBase {
  intent: 'guarantee_cancel_take_out';
  payload: GuaranteePayload;
}
export interface GuaranteeCollectConfirm extends ConfirmActionBase {
  intent: 'guarantee_collect';
  payload: GuaranteePayload;
}

export interface LegacyStepPayload {
  address: string;
  kind: 'deal' | 'guarantee';
  contract: string;
  ref: string;
  step: 'releaseFinal' | 'refund' | 'requestWithdraw' | 'cancelWithdraw' | 'claim';
  amountUsdc: string;
  signer: GuaranteeSigner;
}
export interface LegacyStepConfirm extends ConfirmActionBase {
  intent: 'legacy_step';
  payload: LegacyStepPayload;
}

const EPS = 0.000_001;
const usdc = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const day = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const EARNS = 'At the USYC rate, paid by Karwan on testnet';

export function buildGuaranteePutUpConfirm(i: {
  address: string;
  amountUsdc: number;
  balanceUsdc: number;
  waitDays: number;
  signer: GuaranteeSigner;
}): GuaranteePutUpConfirm | { error: string } {
  if (!(i.amountUsdc > 0)) return { error: 'The amount must be greater than 0.' };
  if (i.amountUsdc > i.balanceUsdc + EPS) {
    return { error: `Their balance is ${usdc(i.balanceUsdc)} USDC, less than the ${usdc(i.amountUsdc)} USDC they want to put up. Tell them the real balance and offer to bring more over (check_top_up_sources).` };
  }
  return {
    kind: 'confirm',
    id: `guarantee_put_up:${usdc(i.amountUsdc)}:${confirmNonce()}`,
    intent: 'guarantee_put_up',
    title: 'Put up a deal guarantee',
    summary: `${usdc(i.amountUsdc)} USDC set aside. It protects your buyers and can back an advance.`,
    warning: `Coming back takes ${i.waitDays} days. Deals and advances can hold part of it until they finish.`,
    fields: [
      { label: 'Amount', value: `${usdc(i.amountUsdc)} USDC` },
      { label: 'Coming back takes', value: `${i.waitDays} days` },
      { label: 'Earns', value: EARNS },
      { label: 'Balance after', value: `${usdc(i.balanceUsdc - i.amountUsdc)} USDC` },
    ],
    payload: { address: i.address, amountUsdc: usdc(i.amountUsdc), signer: i.signer },
    confirmLabel: 'Put up',
    cancelLabel: 'Not now',
  };
}

export function buildGuaranteeTakeOutConfirm(i: {
  address: string;
  /// Omitted: everything that is free.
  amountUsdc?: number;
  freeUsdc: number;
  heldUsdc: number;
  comingBackUsdc: number;
  waitDays: number;
  nowUnix: number;
  signer: GuaranteeSigner;
}): GuaranteeTakeOutConfirm | { error: string } {
  if (!(i.freeUsdc > EPS)) {
    if (i.heldUsdc > EPS) return { error: `Deals hold all ${usdc(i.heldUsdc)} USDC of their guarantee until they finish. It can be taken out then.` };
    return { error: 'They have no deal guarantee to take out.' };
  }
  const amount = i.amountUsdc ?? i.freeUsdc;
  if (!(amount > 0)) return { error: 'The amount must be greater than 0.' };
  if (amount > i.freeUsdc + EPS) {
    return { error: `They can take out up to ${usdc(i.freeUsdc)} USDC now${i.heldUsdc > EPS ? `; deals hold ${usdc(i.heldUsdc)} USDC until they finish` : ''}.` };
  }
  const ready = i.nowUnix + i.waitDays * 86_400;
  const restarts = i.comingBackUsdc > EPS;
  return {
    kind: 'confirm',
    id: `guarantee_take_out:${usdc(amount)}:${confirmNonce()}`,
    intent: 'guarantee_take_out',
    title: 'Take out from your deal guarantee',
    summary: `${usdc(amount)} USDC comes back on ${day(ready)}.`,
    warning: restarts
      ? `Taking out more restarts the ${i.waitDays} days for all ${usdc(amount + i.comingBackUsdc)} USDC coming back. While it comes back it no longer protects your deals.`
      : 'While it comes back it no longer protects your deals. You can cancel until you collect.',
    fields: [
      { label: 'Amount', value: `${usdc(amount)} USDC` },
      { label: 'Ready to collect', value: day(ready) },
      ...(i.heldUsdc > EPS ? [{ label: 'Deals keep', value: `${usdc(i.heldUsdc)} USDC` }] : []),
    ],
    payload: { address: i.address, amountUsdc: usdc(amount), signer: i.signer },
    confirmLabel: 'Take out',
    cancelLabel: 'Not now',
  };
}

export function buildGuaranteeCancelConfirm(i: { address: string; comingBackUsdc: number; signer: GuaranteeSigner }): GuaranteeCancelConfirm | { error: string } {
  if (!(i.comingBackUsdc > EPS)) return { error: 'Nothing is coming back from their deal guarantee.' };
  return {
    kind: 'confirm',
    id: `guarantee_cancel_take_out:${usdc(i.comingBackUsdc)}:${confirmNonce()}`,
    intent: 'guarantee_cancel_take_out',
    title: 'Keep your deal guarantee',
    summary: `${usdc(i.comingBackUsdc)} USDC stays in your guarantee and protects your buyers again.`,
    fields: [{ label: 'Amount', value: `${usdc(i.comingBackUsdc)} USDC` }],
    payload: { address: i.address, amountUsdc: usdc(i.comingBackUsdc), signer: i.signer },
    confirmLabel: 'Keep it',
    cancelLabel: 'Not now',
  };
}

export function buildGuaranteeCollectConfirm(i: {
  address: string;
  comingBackUsdc: number;
  readyAt: number | null;
  nowUnix: number;
  signer: GuaranteeSigner;
}): GuaranteeCollectConfirm | { error: string } {
  if (!(i.comingBackUsdc > EPS) || i.readyAt === null) return { error: 'Nothing is coming back from their deal guarantee, so there is nothing to collect.' };
  if (i.nowUnix < i.readyAt) return { error: `It is not ready yet. It can be collected on ${day(i.readyAt)}.` };
  return {
    kind: 'confirm',
    id: `guarantee_collect:${usdc(i.comingBackUsdc)}:${confirmNonce()}`,
    intent: 'guarantee_collect',
    title: 'Collect from your deal guarantee',
    summary: `${usdc(i.comingBackUsdc)} USDC goes back to your balance.`,
    fields: [
      { label: 'Amount', value: `${usdc(i.comingBackUsdc)} USDC` },
      { label: 'To', value: 'Your balance' },
    ],
    payload: { address: i.address, amountUsdc: usdc(i.comingBackUsdc), signer: i.signer },
    confirmLabel: 'Collect',
    cancelLabel: 'Not now',
  };
}

const LEGACY_TITLE: Record<LegacyStepPayload['step'], string> = {
  requestWithdraw: 'Take out from an older contract',
  cancelWithdraw: 'Keep it on the older contract',
  claim: 'Collect from an older contract',
  releaseFinal: 'Release an older deal to the seller',
  refund: 'Get your money back from an older deal',
};

export function buildLegacyStepConfirm(i: LegacyStepPayload): LegacyStepConfirm {
  return {
    kind: 'confirm',
    id: `legacy_step:${i.contract}:${i.ref}:${i.step}:${confirmNonce()}`,
    intent: 'legacy_step',
    title: LEGACY_TITLE[i.step],
    summary: `${i.amountUsdc} USDC.`,
    ...(i.step === 'releaseFinal' ? { warning: 'The seller is paid and this cannot be undone.' } : {}),
    fields: [{ label: 'Amount', value: `${i.amountUsdc} USDC` }],
    payload: { ...i },
    confirmLabel: i.step === 'releaseFinal' ? 'Release' : i.step === 'refund' ? 'Get it back' : i.step === 'claim' ? 'Collect' : i.step === 'cancelWithdraw' ? 'Keep it' : 'Take out',
    cancelLabel: 'Not now',
  };
}
