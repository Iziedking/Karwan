/// Which ways in and out of Arc exist, for whom, right now.
///
/// The page used to answer this differently depending on the account: a Circle
/// account saw no rail choice at all, and a web3 account saw two of the four.
/// The rules were spread across three components as `method === 'circle'`
/// branches, which is why they disagreed. They live here instead, as data, so
/// the page renders what this says and a test can state what a user is offered.
///
/// A rail is never hidden because it is unfinished. It is shown as SOON, because
/// "there is a fourth way and it is coming" is information, and a rail that
/// appears the week it ships is a page that changed shape under the user.
export type DepositRail = 'onramp' | 'direct' | 'gateway' | 'cctp';

export type RailState =
  /// Usable now.
  | 'ready'
  /// Real, not yet available to this account. The panel says what it will do.
  | 'soon';

export interface RailOption {
  id: DepositRail;
  state: RailState;
}

export type AccountMethod = 'circle' | 'web3' | null;
export type MoneyDirection = 'in' | 'out';

/// The rails on offer, in the order they are shown.
///
/// Order is deliberate: the fastest route for that account first, the one that
/// takes minutes last. A person adding money wants the shortest path, not the
/// most capable protocol.
export function railsFor(input: {
  method: AccountMethod;
  direction: MoneyDirection;
}): RailOption[] {
  const { method, direction } = input;
  // Anything that is not a CONFIRMED wallet gets the restricted set. `method` is
  // null while auth resolves, and offering a rail that needs a wallet to sign
  // before we know there is one is how a page flashes a panel nobody can use.
  const circle = method !== 'web3';

  if (direction === 'in') {
    return [
      // One address, any chain, lands on Arc. Offered to both account types:
      // a wallet user sending from an exchange has the same problem an email
      // user does, and the card says so itself when nothing is provisioned.
      { id: 'direct', state: 'ready' },
      // Gateway needs a wallet to sign a burn intent, so an email account
      // cannot use it yet. The card already says exactly this.
      { id: 'gateway', state: circle ? 'soon' : 'ready' },
      // CCTP inbound asks for a source chain, an amount, and a signature. For
      // an email account that is the direct address with extra steps, so it is
      // not offered rather than offered as a second way to do one thing.
      ...(circle ? [] : [{ id: 'cctp' as const, state: 'ready' as const }]),
      { id: 'onramp', state: 'soon' },
    ];
  }

  return [
    // Out of Arc, CCTP is the route that works for every account today.
    { id: 'cctp', state: 'ready' },
    { id: 'gateway', state: circle ? 'soon' : 'ready' },
    { id: 'onramp', state: 'soon' },
  ];
}

/// Where to land. A deep link wins if it names a rail that is actually usable,
/// otherwise the first ready rail, otherwise the first rail at all.
///
/// The "otherwise" matters: the page used to default to a rail it knew most
/// accounts could not use, so the first thing a new user saw was a coming-soon
/// notice.
export function defaultRail(rails: RailOption[], requested?: string | null): DepositRail {
  const asked = rails.find((rail) => rail.id === requested);
  if (asked && asked.state === 'ready') return asked.id;
  const ready = rails.find((rail) => rail.state === 'ready');
  if (ready) return ready.id;
  return rails[0]?.id ?? 'direct';
}

/// Keep a chosen rail valid when the direction flips. Switching to withdraw
/// while sitting on the direct-deposit address should land somewhere sensible
/// rather than on a rail that no longer exists.
export function reconcileRail(
  current: DepositRail,
  rails: RailOption[],
): DepositRail {
  return rails.some((rail) => rail.id === current) ? current : defaultRail(rails);
}
