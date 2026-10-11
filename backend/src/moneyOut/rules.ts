/// When money may leave a wallet Karwan signs for. Pure: the same inputs
/// always give the same answer, and the routes only gather the inputs.
///
/// A chat account (Karwan holds every key) pays out only to an address the
/// person saved with their World ID, once it has opened, within a daily limit
/// that also counts payments into escrow. A web account holds its own wallet,
/// so the agent wallets Karwan signs for pay out only to it.

export const DAILY_LIMIT_MICROS = 500_000_000n;
export const ADDRESS_WAIT_MS = 24 * 3_600_000;
export const QUIET_MS = 60 * 24 * 3_600_000;
const WINDOW_MS = 24 * 3_600_000;

export type AccountKind = 'chat' | 'web';

export type Exit =
  | { kind: 'payout'; chain: string; address: string }
  | { kind: 'escrow' };

export type Refusal =
  | { code: 'NO_SESSION' }
  | { code: 'PAUSED' }
  | { code: 'RETURN_CHECK' }
  | { code: 'ADDRESS_NOT_SAVED' }
  | { code: 'ADDRESS_OPENS_LATER'; opensAt: number }
  | { code: 'DAILY_LIMIT'; leftMicros: bigint; moreAt: number }
  | { code: 'OWN_WALLET_ONLY' };

export interface Spend {
  amountMicros: bigint;
  at: number;
}

export interface DecideInput {
  kind: AccountKind;
  exit: Exit;
  amountMicros: bigint;
  now: number;
  /// The account's own wallets, which are never a saved address.
  ownAddresses: readonly string[];
  saved: readonly { chain: string; address: string; opensAt: number }[];
  spent: readonly Spend[];
  hasSession: boolean;
  paused: boolean;
  returnCheckDue: boolean;
}

export type Decision = { ok: true } | { ok: false; refusal: Refusal };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function decide(input: DecideInput): Decision {
  const { exit } = input;
  const own = exit.kind === 'payout' && input.ownAddresses.some((a) => same(a, exit.address));

  // Between the account's own wallets nothing leaves.
  if (own) return { ok: true };
  if (input.kind === 'web') {
    return exit.kind === 'payout' ? refuse({ code: 'OWN_WALLET_ONLY' }) : { ok: true };
  }

  if (!input.hasSession) return refuse({ code: 'NO_SESSION' });
  if (input.paused) return refuse({ code: 'PAUSED' });
  if (input.returnCheckDue) return refuse({ code: 'RETURN_CHECK' });

  if (exit.kind === 'payout') {
    const saved = input.saved.find((s) => s.chain === exit.chain && same(s.address, exit.address));
    if (!saved) return refuse({ code: 'ADDRESS_NOT_SAVED' });
    if (saved.opensAt > input.now) return refuse({ code: 'ADDRESS_OPENS_LATER', opensAt: saved.opensAt });
  }

  const counted = input.spent.filter((s) => s.at > input.now - WINDOW_MS).sort((a, b) => a.at - b.at);
  let total = counted.reduce((sum, s) => sum + s.amountMicros, 0n);
  if (total + input.amountMicros <= DAILY_LIMIT_MICROS) return { ok: true };

  const leftMicros = total >= DAILY_LIMIT_MICROS ? 0n : DAILY_LIMIT_MICROS - total;
  let moreAt = input.now;
  for (const s of counted) {
    total -= s.amountMicros;
    moreAt = s.at + WINDOW_MS;
    if (total + input.amountMicros <= DAILY_LIMIT_MICROS) break;
  }
  return refuse({ code: 'DAILY_LIMIT', leftMicros, moreAt });
}

function refuse(refusal: Refusal): Decision {
  return { ok: false, refusal };
}
