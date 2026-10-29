/// The one-time question at the market's entry (view 17): trading for yourself
/// or for a business. Asked only when it is new information, and only once the
/// profile has loaded, so a saved answer never flashes the question.
export function shouldAskTradesAs(input: {
  signedIn: boolean;
  hasBusinessWorkspace: boolean;
  answer: 'self' | 'business' | undefined;
  profileLoaded: boolean;
  /// While business accounts are closed there is only one answer (view 38).
  businessOpen?: boolean;
}): boolean {
  if (input.businessOpen === false) return false;
  return input.signedIn && input.profileLoaded && !input.hasBusinessWorkspace && input.answer === undefined;
}

/// Where business setup goes once saved: back to the page that opened it when
/// that is a Karwan path, otherwise on to verification.
export function afterBusinessSetup(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/business/verification';
}
