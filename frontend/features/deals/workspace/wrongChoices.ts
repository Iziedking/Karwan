import type { DirectDeal } from '@/core/api';

export type WrongChoice = 'changes' | 'notAgreed' | 'nothingArrived';

/// Something is wrong (view 44, P11): for the buyer once something was
/// delivered, three plain choices. It needs changes opens Messages; the other
/// two open a problem. Null means the sheet keeps its usual options (the
/// seller, and anyone before a delivery or once a problem is open).
export function wrongChoices(deal: DirectDeal, viewer: 'buyer' | 'seller' | null): WrongChoice[] | null {
  const stage = deal.view?.stage;
  if (viewer !== 'buyer' || !(deal.delivered || deal.deliveredAt)) return null;
  if (stage !== 'awaiting-first-release' && stage !== 'awaiting-final-release') return null;
  const goodsOnTheWay = (deal.tradeType === 'goods' || deal.tradeType === 'mixed') && !deal.shipment?.arrivedAt;
  return goodsOnTheWay ? ['changes', 'notAgreed', 'nothingArrived'] : ['changes', 'notAgreed'];
}
