/// What a deal's two parties actually owe each other, in words.
///
/// Mirror of `backend/src/deals/tradeVocabulary.ts`. The bell renders its own
/// copy from the event payload rather than receiving a rendered string, so both
/// sides need the same vocabulary. They are small and must agree: change both.
///
/// The bug this exists for: every funded deal, whatever it was, was announced as
/// "You can begin the work". That is a freelance sentence, and a buyer who had
/// funded a shipment of supplies read it in the bell, in email and in Telegram.

export type TradeType = 'service' | 'goods' | 'mixed';

/// Absent reads as 'service'. Legacy deals predate the field and were all work.
export function tradeTypeOf(value: unknown): TradeType {
  return value === 'goods' || value === 'mixed' ? value : 'service';
}

/// What the seller is about to do. Reads after "You can " / "The seller can ".
export function startPhrase(trade: TradeType): string {
  switch (trade) {
    case 'goods':
      return 'ship the order';
    case 'mixed':
      return 'start the order';
    default:
      return 'begin the work';
  }
}

/// What was handed over. Reads after a verb: "marked " + noun + " delivered".
export function deliverableNoun(trade: TradeType): string {
  switch (trade) {
    case 'goods':
      return 'the shipment';
    case 'mixed':
      return 'the order';
    default:
      return 'the work';
  }
}
