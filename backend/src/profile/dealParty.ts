type Parties = {
  buyer: string;
  seller: string;
  buyerAgentAddress?: string | null;
  sellerAgentAddress?: string | null;
};

/// True when the address is the deal's buyer or seller, or one of their agent
/// wallets. Such an address never acts as the deal's financier.
export function isDealParty(deal: Parties, address: string): boolean {
  const who = address.toLowerCase();
  return [deal.buyer, deal.seller, deal.buyerAgentAddress, deal.sellerAgentAddress].some((a) => !!a && a.toLowerCase() === who);
}
