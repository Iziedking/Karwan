import { confirmNonce, type ConfirmActionBase } from './actions.js';

/// Confirm cards for money steps outside a deal (view 31 phase D): paying a
/// payment link from the balance, test USDC, unsticking a money move,
/// rechecking a deal payout, and the money-out controls of a chat account.
/// Each payload is the body the page sends, so its route stays the authority.

export interface PayPaymentLinkConfirm extends ConfirmActionBase {
  intent: 'pay_payment_link';
  payload: { token: string; recipient: string; amountUsdc: number };
}
export interface TestUsdcConfirm extends ConfirmActionBase {
  intent: 'test_usdc';
  payload: { address: string; target: 'identity' | 'buyer' | 'seller' };
}
export interface TestUsdcOnChainConfirm extends ConfirmActionBase {
  intent: 'test_usdc_on_chain';
  payload: { address: string; chain: string };
}
/// A move between networks that stopped: look again for it, or carry on from
/// where it stopped.
export interface RecheckMoneyMoveConfirm extends ConfirmActionBase {
  intent: 'recheck_money_move';
  payload: { bridgeId: string; step: 'recheck' | 'resume' };
}
export interface RetryMoneyMoveConfirm extends ConfirmActionBase {
  intent: 'retry_money_move';
  payload: { intentId: string };
}
export interface CancelMoneyMoveConfirm extends ConfirmActionBase {
  intent: 'cancel_money_move';
  payload: { intentId: string };
}
export interface RecheckPayoutConfirm extends ConfirmActionBase {
  intent: 'recheck_payout';
  payload: { jobId: string; caller: string; reference: string };
}
export interface PauseMoneyOutConfirm extends ConfirmActionBase {
  intent: 'pause_money_out';
  payload: Record<string, never>;
}
export interface RemovePayoutAddressConfirm extends ConfirmActionBase {
  intent: 'remove_payout_address';
  payload: { addressId: string };
}

export type MoneyStepConfirm =
  | PayPaymentLinkConfirm
  | TestUsdcConfirm
  | TestUsdcOnChainConfirm
  | RecheckMoneyMoveConfirm
  | RetryMoneyMoveConfirm
  | CancelMoneyMoveConfirm
  | RecheckPayoutConfirm
  | PauseMoneyOutConfirm
  | RemovePayoutAddressConfirm;

const usdc = (n: number | string) => `${Number(n).toFixed(2)} USDC`;
const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function buildPayPaymentLinkConfirm(i: {
  token: string;
  recipient: string;
  recipientLabel: string;
  amountUsdc: number;
  note?: string;
  status: string;
  walletUsdc: number | null;
}): PayPaymentLinkConfirm | { error: string } {
  if (i.status !== 'open') return { error: 'That payment link is no longer open.' };
  if (!(i.amountUsdc > 0)) return { error: 'That payment link has no fixed amount. Open it to pay the amount you agree.' };
  if (i.walletUsdc === null) return { error: 'Could not read their balance just now. Try again shortly.' };
  if (i.walletUsdc < i.amountUsdc) {
    return { error: `Their balance is ${usdc(i.walletUsdc)}, less than the ${usdc(i.amountUsdc)} asked. Add ${usdc(i.amountUsdc - i.walletUsdc)} first.` };
  }
  return {
    kind: 'confirm',
    id: `pay_payment_link:${i.token}:${confirmNonce()}`,
    intent: 'pay_payment_link',
    title: `Pay ${i.recipientLabel} ${usdc(i.amountUsdc)}`,
    summary: 'Paid from your balance straight to them. This is not a protected deal.',
    warning: 'A payment cannot be undone.',
    fields: [
      { label: 'To', value: i.recipientLabel },
      { label: 'Amount', value: usdc(i.amountUsdc) },
      ...(i.note ? [{ label: 'For', value: i.note }] : []),
      { label: 'Balance after', value: usdc(i.walletUsdc - i.amountUsdc) },
    ],
    payload: { token: i.token, recipient: i.recipient, amountUsdc: i.amountUsdc },
    confirmLabel: `Pay ${usdc(i.amountUsdc)}`,
    cancelLabel: 'Not now',
  };
}

const TARGET_LABEL = { identity: 'Your wallet', buyer: 'Your buying agent', seller: 'Your selling agent' } as const;

export function buildTestUsdcConfirm(i: { address: string; target: 'identity' | 'buyer' | 'seller'; testnet: boolean }): TestUsdcConfirm | { error: string } {
  if (!i.testnet) return { error: 'Test USDC exists only on testnet.' };
  return {
    kind: 'confirm',
    id: `test_usdc:${i.target}:${confirmNonce()}`,
    intent: 'test_usdc',
    title: 'Get test USDC',
    summary: 'Circle\'s testnet faucet sends about 20 test USDC. It has no value and allows one claim per wallet every 2 hours.',
    fields: [{ label: 'To', value: TARGET_LABEL[i.target] }],
    payload: { address: i.address, target: i.target },
    confirmLabel: 'Get test USDC',
    cancelLabel: 'Not now',
  };
}

export function buildTestUsdcOnChainConfirm(i: { address: string; chain: string; chainName: string; testnet: boolean }): TestUsdcOnChainConfirm | { error: string } {
  if (!i.testnet) return { error: 'Test USDC exists only on testnet.' };
  return {
    kind: 'confirm',
    id: `test_usdc_on_chain:${i.chain}:${confirmNonce()}`,
    intent: 'test_usdc_on_chain',
    title: `Get test USDC on ${i.chainName}`,
    summary: `About 20 test USDC to your own wallet on ${i.chainName}, to try bringing money in. It has no value and allows one claim every 2 hours.`,
    fields: [{ label: 'To', value: shortAddress(i.address) }],
    payload: { address: i.address, chain: i.chain },
    confirmLabel: 'Get test USDC',
    cancelLabel: 'Not now',
  };
}

export function buildRecheckMoneyMoveConfirm(i: {
  bridgeId: string;
  amountUsdc: string;
  direction: 'in' | 'out';
  status: string;
  /// Karwan sent it and it stopped before leaving the first network.
  notStarted: boolean;
}): RecheckMoneyMoveConfirm | { error: string } {
  if (i.status === 'minted') return { error: 'That move already arrived.' };
  const step = i.notStarted ? 'resume' : 'recheck';
  return {
    kind: 'confirm',
    id: `recheck_money_move:${i.bridgeId}:${confirmNonce()}`,
    intent: 'recheck_money_move',
    title: step === 'resume' ? 'Carry on with this move' : 'Check this move again',
    summary: step === 'resume'
      ? 'Karwan carries on from where it stopped. Nothing is sent twice.'
      : 'Karwan looks for it again and finishes it if it is ready. Nothing is sent twice.',
    fields: [
      { label: 'Amount', value: usdc(i.amountUsdc) },
      { label: 'Direction', value: i.direction === 'out' ? 'Out of Karwan' : 'Into Karwan' },
    ],
    payload: { bridgeId: i.bridgeId, step },
    confirmLabel: step === 'resume' ? 'Carry on' : 'Check again',
    cancelLabel: 'Not now',
  };
}

export function buildRetryMoneyMoveConfirm(i: { intentId: string; label: string; status: string }): RetryMoneyMoveConfirm | { error: string } {
  if (i.status === 'completed' || i.status === 'cancelled') return { error: `That move is already ${i.status}.` };
  return {
    kind: 'confirm',
    id: `retry_money_move:${i.intentId}:${confirmNonce()}`,
    intent: 'retry_money_move',
    title: 'Try this move again',
    summary: 'It starts again from the same request. Nothing is charged twice.',
    fields: [{ label: 'Move', value: i.label }],
    payload: { intentId: i.intentId },
    confirmLabel: 'Try again',
    cancelLabel: 'Not now',
  };
}

export function buildCancelMoneyMoveConfirm(i: { intentId: string; label: string; status: string }): CancelMoneyMoveConfirm | { error: string } {
  if (i.status === 'completed' || i.status === 'cancelled') return { error: `That move is already ${i.status}.` };
  return {
    kind: 'confirm',
    id: `cancel_money_move:${i.intentId}:${confirmNonce()}`,
    intent: 'cancel_money_move',
    title: 'Cancel this move',
    summary: 'It stops here. Money that has not moved stays where it is.',
    fields: [{ label: 'Move', value: i.label }],
    payload: { intentId: i.intentId },
    confirmLabel: 'Cancel the move',
    cancelLabel: 'Keep it',
  };
}

export function buildRecheckPayoutConfirm(i: { jobId: string; caller: string; reference: string; amountUsdc: string }): RecheckPayoutConfirm | { error: string } {
  if (!i.reference) return { error: 'There is no payment on this deal waiting for a check.' };
  return {
    kind: 'confirm',
    id: `recheck_payout:${i.reference}:${confirmNonce()}`,
    intent: 'recheck_payout',
    title: 'Check this payment again',
    summary: 'Karwan checks the payment that did not confirm and records it on the deal. Nothing is paid twice.',
    fields: [{ label: 'Payment', value: usdc(i.amountUsdc) }],
    payload: { jobId: i.jobId, caller: i.caller, reference: i.reference },
    confirmLabel: 'Check again',
    cancelLabel: 'Not now',
  };
}

export function buildPauseMoneyOutConfirm(i: { paused: boolean }): PauseMoneyOutConfirm | { error: string } {
  if (i.paused) return { error: 'Money out is already paused. Resuming needs World ID on the account page.' };
  return {
    kind: 'confirm',
    id: `pause_money_out:${confirmNonce()}`,
    intent: 'pause_money_out',
    title: 'Pause money out',
    summary: 'No money can leave the account until you resume it.',
    warning: 'Resuming needs your World ID, on the account page.',
    fields: [],
    payload: {},
    confirmLabel: 'Pause',
    cancelLabel: 'Not now',
  };
}

export function buildRemovePayoutAddressConfirm(i: { addressId: string; address: string; chainName: string }): RemovePayoutAddressConfirm | { error: string } {
  if (!i.addressId) return { error: 'Missing which address to remove.' };
  return {
    kind: 'confirm',
    id: `remove_payout_address:${i.addressId}:${confirmNonce()}`,
    intent: 'remove_payout_address',
    title: 'Remove this address',
    summary: 'Money can no longer be sent to it. Adding it back needs World ID again.',
    fields: [
      { label: 'Address', value: shortAddress(i.address) },
      { label: 'Network', value: i.chainName },
    ],
    payload: { addressId: i.addressId },
    confirmLabel: 'Remove',
    cancelLabel: 'Keep it',
  };
}
