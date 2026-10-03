/**
 * Deal-level identity policy. This is deliberately separate from payment
 * authorization: a World proof can satisfy a counterparty policy, but it can
 * never sign, fund, release, or settle an escrow.
 */
export type HighSignalSubject = 'buyer' | 'seller' | 'both';
export type VerificationRole = 'buyer' | 'seller';
/// 'skipped' is a testnet-only waiver. It opens the gate where skipping is
/// allowed and never counts as a verified person anywhere.
export type HighSignalStatus = 'pending' | 'verified' | 'unavailable' | 'rejected' | 'skipped';

export interface HighSignalPartyState {
  status: HighSignalStatus;
  requestedAt?: number;
  verifiedAt?: number;
  skippedAt?: number;
  verificationLevel?: string;
  environment?: 'staging' | 'production';
  nullifierDigest?: string;
  pendingNonce?: string;
  agreementKey?: string;
}

export interface HighSignalVerification {
  mode: 'high_signal';
  subject: HighSignalSubject;
  provider: 'world-id';
  buyer?: HighSignalPartyState;
  seller?: HighSignalPartyState;
}

export function isHighSignalSubject(subject: unknown): subject is HighSignalSubject {
  return subject === 'buyer' || subject === 'seller' || subject === 'both';
}

export function requiresHighSignal(subject: HighSignalSubject, role: VerificationRole): boolean {
  return subject === 'both' || subject === role;
}

export function isHighSignalVerified(
  state: HighSignalVerification | undefined,
  role: VerificationRole,
  options: { allowSkip?: boolean } = {},
): boolean {
  if (!state || !requiresHighSignal(state.subject, role)) return true;
  const status = state[role]?.status;
  return status === 'verified' || (options.allowSkip === true && status === 'skipped');
}

export function createHighSignalVerification(subject: HighSignalSubject): HighSignalVerification {
  return {
    mode: 'high_signal',
    subject,
    provider: 'world-id',
    buyer: requiresHighSignal(subject, 'buyer') ? { status: 'pending' } : undefined,
    seller: requiresHighSignal(subject, 'seller') ? { status: 'pending' } : undefined,
  };
}

export function updateHighSignalParty(
  state: HighSignalVerification,
  role: VerificationRole,
  patch: Partial<HighSignalPartyState>,
): HighSignalVerification {
  if (!requiresHighSignal(state.subject, role)) return state;
  return {
    ...state,
    [role]: { ...(state[role] ?? { status: 'pending' }), ...patch },
  } as HighSignalVerification;
}

export function highSignalBlockedMessage(role: VerificationRole): string {
  return role === 'seller'
    ? 'This high-signal deal requires the seller to verify with World ID before accepting the terms.'
    : 'This high-signal deal requires the buyer to verify with World ID before funding.';
}

/** Old receipts are retained, but only a check bound to this agreement and environment satisfies its gate. */
export function highSignalForContext(state: HighSignalVerification, agreementKey: string, environment: 'staging' | 'production') {
  let current = state;
  for (const role of ['buyer', 'seller'] as const) {
    const party = current[role];
    const stale = party?.agreementKey !== agreementKey;
    if ((party?.status === 'verified' && (stale || party.environment !== environment)) || (party?.status === 'skipped' && stale)) {
      current = updateHighSignalParty(current, role, { status: 'pending' });
    }
  }
  return current;
}
