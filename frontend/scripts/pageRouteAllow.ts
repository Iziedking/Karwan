/// Writes a page may reach with no guard the map can see, each with the reason
/// it is accepted. Keyed by the backend route as `METHOD /path`. An entry that
/// is an open finding names it and the fix plan item that closes it; remove
/// the entry in that item's change.
export const ALLOWED_WITHOUT_GUARD: Record<string, string> = {
  'POST /api/auth/logout': 'Sign out. Clears the caller\'s own cookie and nothing else.',
  'POST /api/auth/otp/request': 'Sign in. Sends an email code; rate limited.',
  'POST /api/auth/otp/verify': 'Sign in. Checks the email code; rate limited.',
  'POST /api/siwe/nonce': 'Wallet sign in. Issues a nonce; rate limited.',
  'POST /api/siwe/verify': 'Wallet sign in. Checks the signature over the nonce; rate limited.',
  'POST /api/recovery/code/request': 'Account recovery. Sends an email code, same answer for any email; rate limited.',
  'POST /api/recovery/code/verify': 'Account recovery. Checks the email code and issues a one-time ticket; rate limited.',
  'POST /api/feedback': 'Public feedback form; rate limited.',
  'POST /api/newsletter/subscribe': 'Public newsletter form; rate limited.',
  'POST /api/survey/research': 'Public research survey; rate limited.',
  'POST /api/waitlist/request': 'Public waitlist form; rate limited.',
  'POST /api/waitlist/verify': 'Waitlist email code; rate limited.',
  'POST /api/waitlist/use-case': 'Waitlist answer after the email code; rate limited.',
  'POST /api/auth/login/options': 'Open: S-03. Says whether an email has an account and has no rate limit. Plan item 12.',
  'POST /api/auth/lookup': 'Open: RT-22. Says whether an email has an account and has no rate limit. Plan item 12.',
  'POST /api/world-id/rp-signature': 'Open: S-04. Mints an RP signature for any caller. Plan item 12.',
  'POST /api/support/:id/close': 'Open: RT-31. Needs only the ticket id, not the session or the ticket link. Plan item 12.',
};
