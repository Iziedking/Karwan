import type { DirectDeal } from '../db/deals.js';
import {
  judgeDispute,
  judgeReady,
  silentProposal,
  type JudgeGenerate,
  type JudgeInput,
} from './disputeJudge.js';

export interface DisputeJudgeDeps {
  listMessages(jobId: string): Promise<Array<{ sender: string; kind?: string; body: string; ts: number }>>;
  generate: JudgeGenerate;
  patchDeal(jobId: string, patch: Partial<DirectDeal>): Promise<unknown>;
  /// Posts the deal-chat line both sides see.
  postSystem(eventType: string, deal: DirectDeal, now: number): Promise<void>;
  /// Tells a reviewer there is a proposal to confirm.
  notifyReviewer(deal: DirectDeal): void;
}

const CHAT_LIMIT = 40;

/// Gathers what the judge reads: the agreed terms, the delivery with its check
/// result, both statements and the recent deal chat by side.
export async function judgeInputFor(deal: DirectDeal, deps: Pick<DisputeJudgeDeps, 'listMessages'>): Promise<JudgeInput> {
  const buyer = deal.buyer.toLowerCase();
  const sellerSide = new Set([deal.seller, deal.sellerAgentAddress].filter(Boolean).map((a) => a!.toLowerCase()));
  const messages = await deps.listMessages(deal.jobId);
  const chat = messages
    .filter((m) => m.kind !== 'system' && m.body.trim())
    .slice(-CHAT_LIMIT)
    .map((m) => ({
      from: (sellerSide.has(m.sender.toLowerCase()) ? 'seller' : m.sender.toLowerCase() === buyer ? 'buyer' : 'system') as JudgeInput['chat'][number]['from'],
      text: m.body.trim().slice(0, 500),
    }))
    .filter((m) => m.from !== 'system');
  return {
    terms: deal.terms ?? '',
    deliveries: deal.deliveryProof
      ? [{ proof: deal.deliveryProof, verdict: deal.deliveryMatch?.verdict, detail: deal.deliveryMatch?.reason }]
      : [],
    statements: deal.disputeStatements ?? {},
    chat,
  };
}

/// One watcher pass for one disputed v2 deal. A silent side is decided by the
/// rule; otherwise the model proposes. Either way it is only a proposal: it is
/// stored on the deal for a reviewer to confirm on the disputes desk.
export async function runDisputeJudge(
  deal: DirectDeal,
  now: number,
  deps: DisputeJudgeDeps,
  settings: { windowMs: number },
): Promise<'none' | 'proposed'> {
  if (!judgeReady(deal, now, settings.windowMs)) return 'none';
  const input = await judgeInputFor(deal, deps);
  const proposal = silentProposal(input, now) ?? (await judgeDispute(input, deps.generate, now));
  await deps.patchDeal(deal.jobId, { judgeProposal: proposal });
  await deps.postSystem('deal.dispute.proposed', deal, now);
  deps.notifyReviewer(deal);
  return 'proposed';
}
