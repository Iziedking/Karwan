/// Durable movement references are support-safe identifiers. Keep the complete
/// value visible and copyable instead of reducing it to an ambiguous prefix.
export function ledgerReferenceLabel(refId: string | null | undefined): string | null {
  const value = refId?.trim();
  return value ? value : null;
}

export function ledgerStatusTone(status: 'done' | 'pending' | 'failed'): 'positive' | 'pending' | 'failed' {
  if (status === 'done') return 'positive';
  return status;
}

/// Which way the money went, from the recorded kind. The ledger is one list of
/// every movement on the account, so a row that only says "12.40 USDC" is
/// ambiguous between a payout received and a milestone released. The direction
/// is a property of the kind, not of the sentence, so it belongs here rather
/// than in a template per locale.
///
/// Unrecognised kinds are 'flat' on purpose: a movement whose direction we
/// cannot state is shown without a sign, never guessed at.
export type LedgerDirection = 'in' | 'out' | 'flat';

const INBOUND = new Set([
  'deposit',
  'top_up',
  'payout',
  'yield_claim',
  'refund',
  'unstake',
  'financing_received',
  'financing_repayment',
  'gateway_deposit',
  'financing_repaid',
  // Karwan's own USDC arriving in the user's agent wallet at onboarding, so the
  // agent can pay for its first transactions. Nothing leaves the user, so the
  // ledger presents the seed as money in.
  'agent_seed',
]);

const OUTBOUND = new Set([
  'withdraw',
  'cash_out',
  'release',
  'stake',
  // The user's own USDC moving from the sign-in wallet into their agent.
  'agent_topup',
  'agent_spend',
  'gateway_fund_agent',
  'gateway_cash_out',
  'financing_funded',
  'financing_repayment_sent',
  'agent_funding',
]);

export function ledgerDirection(kind: string): LedgerDirection {
  if (INBOUND.has(kind)) return 'in';
  if (OUTBOUND.has(kind)) return 'out';
  return 'flat';
}

/// The amount as it belongs on a ledger row: signed by direction, unit always
/// spelled out. Returns null when the row carries no amount, so the caller
/// renders nothing rather than a lonely unit.
export function ledgerAmountLabel(
  amountUsdc: string | null | undefined,
  kind: string,
): string | null {
  const value = amountUsdc?.trim();
  if (!value) return null;
  const direction = ledgerDirection(kind);
  const sign = direction === 'in' ? '+' : direction === 'out' ? '-' : '';
  return `${sign}${value} USDC`;
}
