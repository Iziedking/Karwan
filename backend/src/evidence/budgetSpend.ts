import type { DataBudget } from '../x402/dataGate.js';
import type { EvidencePurchaseRecord, EvidenceRuntimeRepository } from './runtime.js';

/// Records a settled evidence purchase against its owner's weekly data budget
/// (view 48, step 6), once. The spend is recorded first and the purchase marked
/// after, so a failure between the two can only count a read twice against the
/// budget, never drop it. A retry or a duplicate observation repairs a missing
/// mark. Returns the marked purchase, or null when there was nothing to record.
export async function recordEvidenceSpend(
  repository: EvidenceRuntimeRepository,
  purchase: EvidencePurchaseRecord,
  budget: DataBudget | undefined,
  now: number,
): Promise<EvidencePurchaseRecord | null> {
  const data = purchase.data as Record<string, unknown>;
  if (!budget || purchase.state !== 'settled' || data.budgetRecorded === true) return null;
  if (typeof data.budgetOwner !== 'string') return null;
  await budget.spent(data.budgetOwner, Number(purchase.priceUsdc), 'research');
  return repository.updatePurchase(purchase.id, purchase.version, purchase.state, {
    data: { budgetRecorded: true },
    now,
  });
}
