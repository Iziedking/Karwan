import { fill } from '@/features/deals/workspace/presentation';
import type { AgentNudgesCopy } from '@/shared/i18n/messages/agentNudges';
import type { SellerDesk } from './sellerDeskView';

/// What the seller's agent did between two loads of the desk, as short notes.
/// The first load is the starting point, so it says nothing.
export function deskNudges(prev: SellerDesk | null, next: SellerDesk, copy: AgentNudgesCopy): string[] {
  if (!prev) return [];
  const out: string[] = [];
  const before = new Map(prev.bidding.map((b) => [b.jobId.toLowerCase(), b]));
  for (const b of next.bidding) {
    const title = b.title ?? copy.aRequest;
    const was = before.get(b.jobId.toLowerCase());
    if (!was) {
      if (b.state === 'passed') {
        out.push(fill(copy.desk.passed, { title }));
        continue;
      }
      if (b.check) out.push(fill(copy.desk.checked, { amount: b.check.paidUsdc.toFixed(2), title }));
      if (b.state === 'offered' || b.state === 'negotiating') out.push(fill(copy.desk.bid, { amount: b.priceUsdc, title }));
      continue;
    }
    if (b.state !== was.state) {
      if (b.state === 'negotiating') out.push(fill(copy.desk.negotiating, { title }));
      else if (b.state === 'passed') out.push(fill(copy.desk.passed, { title }));
      else if (b.state === 'won') out.push(fill(copy.desk.won, { title }));
      else if (b.state === 'lost') out.push(fill(copy.desk.lost, { title }));
    } else if (b.check && !was.check) {
      out.push(fill(copy.desk.checked, { amount: b.check.paidUsdc.toFixed(2), title }));
    }
  }
  const asked = new Set(prev.worldChecks.map((w) => w.jobId.toLowerCase()));
  for (const w of next.worldChecks) {
    if (!asked.has(w.jobId.toLowerCase())) {
      out.push(fill(copy.world.sellerLine, { title: w.title ?? copy.aRequest, amount: w.priceUsdc }));
    }
  }
  const waiting = new Set(prev.needsYou.map((m) => m.jobId.toLowerCase()));
  for (const m of next.needsYou) {
    if (!waiting.has(m.jobId.toLowerCase())) out.push(fill(copy.desk.chosen, { title: m.title ?? copy.aRequest }));
  }
  return out;
}
