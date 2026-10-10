/// What a seller's agent tells another agent, read only from the seller's own
/// listing. A model never fills in a price, a date or a term the seller did
/// not set: an unset field is answered as unknown.

export interface ListingRules {
  askingPriceUsdc: number;
  /// How far below the asking price the seller's agent may go, in percent.
  negotiationMaxDecreasePct?: number;
  readyInDays?: number;
  terms?: string;
}

export type Topic = 'price' | 'timeline' | 'terms';

export type AgentAnswer =
  | { answered: true; topic: 'price'; askingUsdc: number; lowestUsdc: number; fitsBudget?: boolean }
  | { answered: true; topic: 'timeline'; readyInDays: number }
  | { answered: true; topic: 'terms'; terms: string }
  | { answered: false; topic: Topic };

export function answerFromListing(listing: ListingRules, q: { topic: Topic; budgetUsdc?: number }): AgentAnswer {
  switch (q.topic) {
    case 'price': {
      const pct = Math.min(Math.max(listing.negotiationMaxDecreasePct ?? 0, 0), 100);
      const lowest = Math.round(listing.askingPriceUsdc * (1 - pct / 100) * 100) / 100;
      return {
        answered: true,
        topic: 'price',
        askingUsdc: listing.askingPriceUsdc,
        lowestUsdc: lowest,
        ...(q.budgetUsdc !== undefined ? { fitsBudget: q.budgetUsdc >= lowest } : {}),
      };
    }
    case 'timeline':
      return listing.readyInDays && listing.readyInDays > 0
        ? { answered: true, topic: 'timeline', readyInDays: listing.readyInDays }
        : { answered: false, topic: 'timeline' };
    case 'terms':
      return listing.terms?.trim() ? { answered: true, topic: 'terms', terms: listing.terms.trim() } : { answered: false, topic: 'terms' };
  }
}
