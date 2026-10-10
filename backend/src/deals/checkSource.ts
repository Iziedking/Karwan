export type CheckSource = 'cre' | 'karwan' | 'karwan-fallback';

/// Which checks decided a delivery. Chainlink CRE runs them in a sandbox on a
/// decentralised network; Karwan's own checks run otherwise. With CRE expected
/// (CRE_ENABLED) but no CRE result, the record says Karwan's checks stood in.
export function checkSourceFor(input: { creEnabled: boolean; creResult: boolean }): CheckSource {
  if (input.creResult) return 'cre';
  return input.creEnabled ? 'karwan-fallback' : 'karwan';
}
