/// What a deal's two parties actually owe each other, in words.
///
/// Every notification about a funded deal used to say the same sentence:
///
///   'The escrow is funded and the seller can begin the work.'
///
/// which is right for a freelancer and wrong for everyone else. A buyer who had
/// just funded a container of supplies was told their supplier could begin the
/// work, in an email, in Telegram and in the bell, three times over. The deal
/// already knows which it is: `tradeType` is set at creation from the parties'
/// account types and drives the milestone vocabulary on the deal page. These
/// notifications simply never asked it.
///
/// Mirrored on the frontend at `shared/deals/tradeVocabulary.ts`, which the bell
/// reads. The two files are small and must say the same thing; change both.

export type TradeType = 'service' | 'goods' | 'mixed';

/// Absent reads as 'service'. Legacy deals predate the field entirely and every
/// one of them was freelance work, so the old wording stays right for them.
export function tradeTypeOf(deal: { tradeType?: TradeType | null } | null | undefined): TradeType {
  const t = deal?.tradeType;
  return t === 'goods' || t === 'mixed' ? t : 'service';
}

/// What the seller is about to do, once escrow is funded. Reads after a subject:
/// "You can " + startPhrase(...), "The seller can " + startPhrase(...).
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

/// What was handed over, as the object of a sentence. Reads after a verb:
/// "marked " + deliverableNoun(...) + " delivered".
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

/// The same thing as a bare noun, for a sentence that already has an article or
/// a possessive in front of it: "review your " + deliverableBare(...).
export function deliverableBare(trade: TradeType): string {
  return deliverableNoun(trade).replace(/^the /, '');
}
