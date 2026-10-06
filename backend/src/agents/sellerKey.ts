/// The key a seller is stored under, found by address whatever its casing.
/// Chain logs give checksummed addresses and bus events often lowercase ones,
/// so a plain `has()` missed a seller's decline and the agent never moved on.
export function sellerKey(collection: Map<string, unknown> | Set<string>, seller: string): string | null {
  const wanted = seller.toLowerCase();
  for (const key of collection.keys()) {
    if (key.toLowerCase() === wanted) return key;
  }
  return null;
}
