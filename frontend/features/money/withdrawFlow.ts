/// The Withdraw page (view 51, fourth round): where it goes first, then the
/// address and network, then how much, then a review. Only money that is
/// ready leaves; what sits in the Transfer balance or with the agent is shown
/// beside it with a way to bring it here, and never moves on its own.

export type WithdrawTarget = 'ownWallet' | 'otherWallet' | 'karwan';
export type WithdrawStage = 'where' | 'address' | 'amount';

export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/// The rows on the first screen. "Your wallet" only exists for a wallet
/// account: an email account's money is held for it, so there is no wallet
/// of its own to send to.
export function withdrawTargets(account: 'wallet' | 'email'): WithdrawTarget[] {
  return account === 'wallet' ? ['ownWallet', 'otherWallet', 'karwan'] : ['otherWallet', 'karwan'];
}

/// What can go now and what is elsewhere, in cents so the two never add to
/// more than the balance.
export function withdrawSplit(input: { ready: number | null; pool: number; agents: number }): { ready: number; elsewhere: number } {
  const cents = (n: number) => Math.max(0, Math.floor(n * 100 + 1e-6));
  return { ready: cents(input.ready ?? 0) / 100, elsewhere: (cents(input.pool) + cents(input.agents)) / 100 };
}

export type WithdrawCheck = { ok: true } | { ok: false; reason: 'address' | 'amount' | 'over' };

export function withdrawCheck(input: { address: string; amount: number | null; ready: number }): WithdrawCheck {
  if (!ADDRESS_RE.test(input.address.trim())) return { ok: false, reason: 'address' };
  if (input.amount === null || !(input.amount > 0)) return { ok: false, reason: 'amount' };
  if (Math.round(input.amount * 1e6) > Math.round(input.ready * 1e6)) return { ok: false, reason: 'over' };
  return { ok: true };
}

/// The address shown on the review and the Sent card: first six, last four.
export function shortAddr(address: string): string {
  const a = address.trim();
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
