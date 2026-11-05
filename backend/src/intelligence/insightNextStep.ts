import type { Insight } from './insights.js';

/// The tool that carries out an insight's one action (view 52, step 1). Every
/// one of them shows the person a card to confirm; the insight never changes
/// anything by itself. A request's budget and due date are fixed on chain, so
/// changing either means taking the request down and posting it again.
export function insightNextStep(i: Pick<Insight, 'action'>): { tool: string; args: Record<string, unknown>; label: string; then?: string } {
  const a = i.action;
  switch (a.kind) {
    case 'set-request-budget':
      return { tool: 'propose_take_down', args: { jobId: a.jobId }, label: `Post it again at ${a.budgetUsdc} USDC`, then: `propose_post_request with a budget of ${a.budgetUsdc} USDC` };
    case 'set-request-days':
      return { tool: 'propose_take_down', args: { jobId: a.jobId }, label: `Post it again with ${a.days} days`, then: `propose_post_request with ${a.days} days to deliver` };
    case 'set-lowest-price':
      return { tool: 'set_way_i_deal', args: { side: 'sell', priceMin: a.priceUsdc }, label: `Lower to ${a.priceUsdc} USDC` };
    case 'show-offers':
      return { tool: 'list_offers_on_request', args: { jobId: a.jobId }, label: 'Show them' };
  }
}
