/// The fee for a new deal comes from the escrow that will hold it. With v3
/// funding on, that is the v3 escrow, which is also the only one deployed on
/// a network that runs v3 alone.
export async function readEscrowFeeBps(input: {
  v3Funding: boolean;
  readV3: () => Promise<bigint | number>;
  readLegacy: () => Promise<bigint | number>;
}): Promise<number> {
  return Number(await (input.v3Funding ? input.readV3() : input.readLegacy()));
}
