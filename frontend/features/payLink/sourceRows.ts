/// The rows of "Pay from": Arc always first, then the chains holding USDC,
/// most first. Chains with nothing fold behind Show, so the list stays short.
export interface SourceRow<K extends string> {
  key: 'arc' | K;
  /// null when no wallet is connected yet, so nothing is known.
  amount: number | null;
}

export function sourceRows<K extends string>(input: {
  connected: boolean;
  arc: number | null;
  chains: K[];
  amounts: Partial<Record<K, number>>;
}): { listed: SourceRow<K>[]; empty: SourceRow<K>[] } {
  const arc: SourceRow<K> = { key: 'arc', amount: input.connected ? input.arc : null };
  if (!input.connected) return { listed: [arc], empty: input.chains.map((key) => ({ key, amount: null })) };
  const withAmount = input.chains.map((key) => ({ key, amount: input.amounts[key] ?? 0 }));
  const funded = withAmount.filter((r) => r.amount > 0).sort((a, b) => b.amount - a.amount);
  return { listed: [arc, ...funded], empty: withAmount.filter((r) => r.amount <= 0) };
}
