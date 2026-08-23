/// Who already owns an email address.
///
/// A deal can name its counterparty by email. That used to mint an invite
/// unconditionally, which is a hole: an email verified against a web3 wallet is
/// already an identity, and the invite flow could only be claimed by signing in
/// WITH that email, which provisions a separate Circle wallet at a different
/// address. So the rightful owner either could not claim their own deal, or
/// claimed it onto a second identity, and the payout landed on a wallet with
/// none of their reputation, balance, or history.
///
/// The paytag branch beside it already did the right thing: resolve the handle
/// at creation and pin the address, so the deal is an address deal that
/// remembers a label. This is the same move for an email.
///
/// The lookups live in the caller; what counts as ownership is decided here so
/// it can be tested without a database.

export interface EmailOwnerCandidates {
  /// Address of the Circle login account keyed to this email, if any. This
  /// account authenticates WITH the email, so it owns it by construction.
  loginAddress?: string | undefined;
  /// Address of a profile carrying this as its contact email, if any.
  profileAddress?: string | undefined;
  /// Whether that profile's email passed the OTP check. An unverified contact
  /// email is a claim, not a fact: anyone can type any address into their own
  /// profile, and honouring it would redirect a stranger's deal.
  profileEmailVerified?: boolean | undefined;
}

export type EmailOwner =
  /// One account owns it. Pin this address on the deal.
  | { kind: 'owned'; address: string; via: 'login' | 'wallet' }
  /// Two different accounts both look like owners. Never guess which one gets
  /// paid: the caller should refuse rather than pick.
  | { kind: 'conflict'; addresses: [string, string] }
  /// Nobody has it. The invite flow is correct here.
  | { kind: 'unclaimed' };

export function pickEmailOwner(candidates: EmailOwnerCandidates): EmailOwner {
  const login = normalise(candidates.loginAddress);
  const profile = candidates.profileEmailVerified ? normalise(candidates.profileAddress) : undefined;

  if (login && profile && login !== profile) {
    // The profile route refuses to verify an email that belongs to another
    // account, so this should not arise. If legacy data produced it, stopping is
    // the only safe answer: the question "who gets paid" has two answers.
    return { kind: 'conflict', addresses: [login, profile] };
  }
  // A login account and a wallet profile agreeing is the ordinary case: an email
  // signup gets its own address auto-filled and verified on its profile.
  if (login) return { kind: 'owned', address: login, via: 'login' };
  if (profile) return { kind: 'owned', address: profile, via: 'wallet' };
  return { kind: 'unclaimed' };
}

function normalise(address: string | undefined): string | undefined {
  const trimmed = address?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}
