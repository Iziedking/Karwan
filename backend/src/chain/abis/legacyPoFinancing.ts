/// Read-only ABI for the RETIRED KarwanPOFinancing (custody rail), used only to
/// reconcile off-chain rows that drifted during the 2026-07-27 cutover.
///
/// The struct here is the OLD eleven-field shape. The current contract dropped
/// `releaseTimeoutAt` and `releasedAt` with the custody step, so decoding the
/// old contract with the new ABI silently misreads every field after
/// `fundedAt`. That is why this exists as its own file rather than reusing
/// poFinancingV2.
///
/// Old POState: 0 None, 1 Funded, 2 Released, 3 Settled, 4 Reclaimed,
/// 5 Defaulted. The current contract renumbered these, so never compare a
/// legacy state number against the live enum.
export const legacyPoFinancingAbi = [
  {
    type: 'function',
    name: 'getLine',
    stateMutability: 'view',
    inputs: [{ name: 'invoiceId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'financier', type: 'address' },
          { name: 'seller', type: 'address' },
          { name: 'principalUsdc', type: 'uint128' },
          { name: 'repayUsdc', type: 'uint128' },
          { name: 'fundedAt', type: 'uint64' },
          { name: 'releaseTimeoutAt', type: 'uint64' },
          { name: 'releasedAt', type: 'uint64' },
          { name: 'repaymentTimeoutAt', type: 'uint64' },
          { name: 'settledAt', type: 'uint64' },
          { name: 'state', type: 'uint8' },
          { name: 'requiredStakeUsdc', type: 'uint128' },
        ],
      },
    ],
  },
] as const;

/// Old on-chain state -> the DB state that describes it.
export const LEGACY_STATE_TO_DB: Record<number, string> = {
  0: 'none',
  1: 'funded',
  2: 'released',
  3: 'repaid',
  4: 'reclaimed',
  5: 'defaulted',
};
