/// The link a seller sends someone they already agreed with: it opens the
/// buyer's deal form with the seller filled in. The assistant's
/// share_my_deal_link builds the same one (backend/src/assistant/dealLink.ts).
export function sellerDealLink(origin: string, tag: string): string {
  return `${origin.replace(/\/+$/, '')}/buyer?mode=direct&seller=${encodeURIComponent(`@${tag}`)}`;
}
