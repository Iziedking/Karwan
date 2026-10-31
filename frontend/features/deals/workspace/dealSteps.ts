import type { DirectDeal } from '@/core/api';

/// The steps of a deal for its kind (view 44, spec section 6): what the track
/// on the deal page shows, and where the money is on a deal paid in stages.

export type DealKind = 'one' | 'stages' | 'shipped' | 'in_person';
export type StepKey =
  | 'agreed' | 'paidIn' | 'delivered' | 'onTheWay' | 'arrived' | 'handedOver' | 'paidOut' | 'stage' | 'cancelled' | 'refunded'
  | 'hoursSent' | 'prizeIn' | 'entries' | 'winners';
export interface DealStep {
  key: StepKey;
  state: 'done' | 'current' | 'upcoming';
  /// Stage steps only: which part, counted from 1, and what happened to it.
  stage?: number;
  stageLine?: 'delivered' | 'paidOut';
}

/// Chain first, then the agreed split, then the first-release field, as the
/// server's stageOf reads it.
function partsOf(deal: DirectDeal): number[] {
  if (deal.onChain?.milestonePcts?.length) return deal.onChain.milestonePcts;
  if (deal.milestonePcts?.length) return deal.milestonePcts;
  const first = deal.firstReleasePct;
  if (first >= 100) return [100];
  return first > 0 ? [first, 100 - first] : [50, 50];
}

export function dealKindOf(deal: DirectDeal): DealKind {
  if (deal.tradeType === 'goods' || deal.tradeType === 'mixed') return deal.goodsWay === 'in_person' ? 'in_person' : 'shipped';
  return partsOf(deal).length > 1 ? 'stages' : 'one';
}

const paidInOf = (deal: DirectDeal) => !!deal.acceptedAt || !!deal.fundTxHash;

function releasedOf(deal: DirectDeal, parts: number): { released: number; settled: boolean } {
  const onChain = deal.onChain?.milestonesReleased ?? 0;
  const settled = !!deal.settledAt || deal.onChain?.state === 3 || onChain >= parts || !!deal.autoReleasedAt;
  return { released: settled ? parts : onChain, settled };
}

function withCurrent(rows: Array<Omit<DealStep, 'state'> & { done: boolean }>, finished: boolean): DealStep[] {
  let marked = finished;
  return rows.map(({ done, ...row }) => {
    if (done) return { ...row, state: 'done' as const };
    if (!marked) {
      marked = true;
      return { ...row, state: 'current' as const };
    }
    return { ...row, state: 'upcoming' as const };
  });
}

export function dealSteps(deal: DirectDeal): DealStep[] {
  const paidIn = paidInOf(deal);
  const agreed = !!deal.sellerApprovedAt || paidIn;
  if (deal.cancelledAt || deal.onChain?.state === 5) {
    const rows: DealStep[] = [];
    if (agreed) rows.push({ key: 'agreed', state: 'done' });
    if (paidIn) rows.push({ key: 'paidIn', state: 'done' });
    rows.push({ key: 'cancelled', state: 'done' });
    if (paidIn) rows.push({ key: 'refunded', state: deal.onChain?.state === 5 ? 'done' : 'current' });
    return rows;
  }
  const parts = partsOf(deal);
  const { released, settled } = releasedOf(deal, parts.length);
  const delivered = !!deal.delivered || !!deal.deliveredAt;
  const kind = dealKindOf(deal);
  const start = [
    { key: 'agreed' as const, done: agreed },
    { key: 'paidIn' as const, done: paidIn },
  ];
  if (kind === 'stages') {
    const stages = parts.map((_, i) => {
      const done = i < released;
      const deliveredHere = !done && i === released && delivered && (deal.deliveredMilestone === undefined || deal.deliveredMilestone === i);
      return {
        key: 'stage' as const,
        stage: i + 1,
        done,
        ...(done ? { stageLine: 'paidOut' as const } : deliveredHere ? { stageLine: 'delivered' as const } : {}),
      };
    });
    return withCurrent([...start, ...stages], settled);
  }
  if (kind === 'shipped') {
    return withCurrent([
      ...start,
      { key: 'onTheWay', done: !!deal.shipment?.dispatchedAt || delivered },
      { key: 'arrived', done: !!deal.shipment?.arrivedAt },
      { key: 'paidOut', done: settled },
    ], settled);
  }
  if (kind === 'in_person') {
    const handedOver = !!deal.shipment?.arrivedAt || !!deal.deliveryHistory?.at(-1)?.handedOverAt;
    return withCurrent([...start, { key: 'handedOver', done: handedOver }, { key: 'paidOut', done: settled }], settled);
  }
  return withCurrent([...start, { key: 'delivered', done: delivered }, { key: 'paidOut', done: settled }], settled);
}

const MICROS = 1_000_000n;

function toMicros(usdc: string): bigint {
  const [whole = '0', fraction = ''] = usdc.split('.');
  return BigInt(whole || '0') * MICROS + BigInt((fraction + '000000').slice(0, 6));
}

function fromMicros(micros: bigint): string {
  const whole = micros / MICROS;
  const fraction = (micros % MICROS).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

/// What has been paid out to the seller and what Karwan still holds, once the
/// money is in. Each part is cut the way the server cuts it (milestoneAmountUsdc).
export function moneySplit(deal: DirectDeal): { paidOutUsdc: string; heldUsdc: string } | null {
  if (!paidInOf(deal) || deal.cancelledAt) return null;
  const parts = partsOf(deal);
  const total = toMicros(deal.dealAmountUsdc);
  const { released } = releasedOf(deal, parts.length);
  const paid = released >= parts.length
    ? total
    : parts.slice(0, released).reduce((sum, pct) => sum + (total * BigInt(pct)) / 100n, 0n);
  return { paidOutUsdc: fromMicros(paid), heldUsdc: fromMicros(total - paid) };
}
