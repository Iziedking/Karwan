/// What the passkey screen offers when the passkey cannot be reached: some
/// browsers and places cannot use one at all (an embedded browser, a borrowed
/// laptop, a phone without the synced key).
///
/// Where Karwan holds the wallet (testnet), an email code signs the same
/// account in, so it is always one tap away. Where the user's passkey holds
/// the wallet (mainnet), a code only proves the email and cannot sign for the
/// wallet, so the way back is account recovery.
export function passkeyFallback({
  userHoldsKeys,
  recoveryOn,
}: {
  userHoldsKeys: boolean;
  recoveryOn: boolean;
}): 'email' | 'recovery' | null {
  if (!userHoldsKeys) return 'email';
  return recoveryOn ? 'recovery' : null;
}
