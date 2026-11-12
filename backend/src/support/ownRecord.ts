import { getDeal } from '../db/deals.js';
import { getMoneyMovement } from '../db/moneyMovements.js';
import type { CaseRecord } from './caseRules.js';

/// A record belongs on a person's case only when they are a party to it:
/// the buyer or seller of a deal, the sender or a party of a money movement.
export async function ownRecord(address: string, r: CaseRecord): Promise<boolean> {
  const me = address.toLowerCase();
  if (r.kind === 'deal') {
    const d = await getDeal(r.id);
    return !!d && (d.buyer.toLowerCase() === me || d.seller.toLowerCase() === me);
  }
  const m = await getMoneyMovement(r.id);
  return !!m && (m.initiatedBy.toLowerCase() === me || m.participants.some((p) => p.address.toLowerCase() === me));
}
