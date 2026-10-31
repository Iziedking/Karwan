/// The fee of the escrow a new deal will pay in on: the family when it is on,
/// else v3, else the older escrow. It is the choice fundingEscrowFor makes for
/// a deal with no escrow yet, so the review quotes what the payment charges.
export const newDealFeeDeps = {
  feeBps: async (): Promise<number> => {
    const [{ suiteFundingEnabled }, { v3FundingEnabled }, live, { getEscrowFeeBps }] = await Promise.all([
      import('../chain/suiteConfig.js'),
      import('../chain/dealEscrowV3Live.js'),
      import('./fundDirectV3Live.js'),
      import('../chain/contracts.js'),
    ]);
    if (suiteFundingEnabled()) return (await live.fundDirectSuiteDeps().readLimits()).feeBps;
    if (v3FundingEnabled()) return live.fundDirectV3Deps().readFeeBps();
    return getEscrowFeeBps({ fresh: true });
  },
};

export function newDealFeeBps(): Promise<number> {
  return newDealFeeDeps.feeBps();
}
