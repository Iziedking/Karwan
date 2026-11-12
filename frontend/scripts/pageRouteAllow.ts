/// Writes a page may reach with no guard the map can see, each with the reason
/// it is accepted. Keyed by the backend route as `METHOD /path`. An entry that
/// is an open finding names it and the fix plan item that closes it; remove
/// the entry in that item's change.
export const ALLOWED_WITHOUT_GUARD: Record<string, string> = {
  'POST /api/admin/session': 'Desk sign-in, reached only through Cloudflare Access; checks the team password and the owner\'s pages; rate limited.',
  'POST /api/admin/session/code': 'Desk sign-in, the mainnet code step (view 79): needs the signed 5-minute ticket the password step gave; five wrong codes lock the email for 15 minutes; rate limited.',
  'DELETE /api/admin/session': 'Desk sign-out (view 79). Answers ok and changes nothing on the server; the desk\'s own address drops its cookies.',
  'POST /api/auth/logout': 'Sign out. Clears the caller\'s own cookie and nothing else.',
  'POST /api/auth/otp/request': 'Sign in. Sends an email code; rate limited.',
  'POST /api/auth/otp/verify': 'Sign in. Checks the email code; rate limited.',
  'POST /api/auth/lookup': 'Sign in. Says which way to sign in for an email; 10 per 10 minutes per address and per email (view 68).',
  'POST /api/auth/login/options': 'Passkey sign in. Same answer for any email, no passkey list for an unknown one; 10 per 10 minutes per address and per email (view 68).',
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
};
