/// How a funding response maps onto what the row shows.
///
/// Funding is two things that used to share one catch: moving the money, and
/// Karwan writing down that it moved. Only the first can fail in a way the user
/// needs to act on. When the second failed, the row still read "Failed", beside
/// the hash of the transaction that had moved 500 USDC.
///
/// The backend now says which of the two it is, with a code. This maps the code
/// to the row's state so the mapping lives in one tested place rather than in a
/// catch block on each of the two funding hooks.

/// The codes the funding routes answer with. Anything else is unrecognised and
/// stays a plain failure, which is the safe direction for a code we do not know.
export type FundingCode =
  /// The money moved, and Karwan's record is behind. Not a failure.
  | 'funding_landed_unrecorded'
  /// Neither confirmed nor refuted. Not a failure either: saying so would be a
  /// guess, and the guess that costs the user is the one that says "Failed".
  | 'funding_unconfirmed'
  /// A transfer is already on chain under this attempt. Re-sending would move
  /// the money twice, so the row waits rather than retrying.
  | 'funding_in_flight'
  /// Nothing moved. The one case worth showing as failed.
  | 'funding_failed';

export type FundingRowState = 'settling' | 'error';

/// What a failed funding call should leave on the row.
export function fundingRowState(code: string | undefined): FundingRowState {
  switch (code) {
    case 'funding_landed_unrecorded':
    case 'funding_unconfirmed':
    case 'funding_in_flight':
      return 'settling';
    case 'funding_failed':
      return 'error';
    default:
      // An unrecognised failure, from an older backend or a route that does not
      // classify itself. Those are genuine failures far more often than not.
      return 'error';
  }
}

/// Does this response body mean the money moved but the record has not closed?
/// A 202 resolves rather than throwing, so the success branch has to notice it.
export function isSettlingResponse(body: { code?: string; error?: string } | null | undefined): boolean {
  if (!body) return false;
  if (body.code) return fundingRowState(body.code) === 'settling';
  // No code and an error string on a 2xx: older shape, still not a success.
  return !!body.error;
}
