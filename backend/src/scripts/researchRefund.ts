/// Who gets their research credit back, and where (view 48, decision 2). Pure:
/// the refund script reads the profiles and agent wallets and sends what this
/// returns. Credit was paid from the buying agent, so it goes back there; a
/// person without one gets it in their own wallet.

export interface CreditHolder {
  address: string;
  research?: { active: boolean; creditUsdc: number; activatedAt: number; lastChargedAt?: number; refundTx?: string };
}

export interface RefundRow {
  owner: string;
  to: string;
  toAgent: boolean;
  amountMicros: bigint;
}

export function researchRefundPlan(
  holders: readonly CreditHolder[],
  buyingAgentOf: ReadonlyMap<string, string>,
): { rows: RefundRow[]; totalMicros: bigint } {
  const rows: RefundRow[] = [];
  for (const h of holders) {
    // A refund already sent is never sent again, even if it is not confirmed yet.
    if (h.research?.refundTx) continue;
    const micros = BigInt(Math.floor((h.research?.creditUsdc ?? 0) * 1e6 + 1e-6));
    if (micros <= 0n) continue;
    const agent = buyingAgentOf.get(h.address.toLowerCase()) ?? buyingAgentOf.get(h.address);
    rows.push({ owner: h.address, to: agent ?? h.address, toAgent: !!agent, amountMicros: micros });
  }
  return { rows, totalMicros: rows.reduce((sum, r) => sum + r.amountMicros, 0n) };
}
