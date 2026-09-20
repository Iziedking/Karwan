/// Who you are dealing with, as measured facts. Every field is named here so
/// the card can never carry an address, a past counterparty or raw profile data.

export interface TrustDeal {
  buyer: string;
  seller: string;
  settledAt?: number;
  cancelledAt?: number;
  disputed?: boolean;
  deliveredAt?: number;
  deadlineUnix?: number;
}

export interface TrustFacts {
  settled: number;
  distinctCounterparties: number;
  onTime: number;
  withDeadline: number;
  disputes: number;
}

export interface TrustCard {
  role: 'seller' | 'buyer';
  name: string | null;
  verifiedBusiness: boolean;
  verifiedPerson: boolean;
  facts: TrustFacts;
  memberSince: number | null;
  stakeUsdc: string | null;
  provenAccounts: Array<'x'>;
  isNew: boolean;
}

export interface TrustCardInput {
  role: 'seller' | 'buyer';
  facts: TrustFacts;
  memberSince: number | null;
  displayName: string | null;
  companyName: string | null;
  businessVerified: boolean;
  personVerified: boolean;
  xProven: boolean;
  stakeUsdc: string | null;
}

export function trustFacts(deals: TrustDeal[], subject: string, role: 'seller' | 'buyer'): TrustFacts {
  const me = subject.toLowerCase();
  const mine = deals.filter((deal) => (role === 'seller' ? deal.seller : deal.buyer).toLowerCase() === me);
  const settled = mine.filter((deal) => deal.settledAt != null && deal.cancelledAt == null);
  const counterparties = new Set(settled.map((deal) => (role === 'seller' ? deal.buyer : deal.seller).toLowerCase()));
  const timed = role === 'seller' ? settled.filter((deal) => deal.deadlineUnix != null && deal.deliveredAt != null) : [];
  return {
    settled: settled.length,
    distinctCounterparties: counterparties.size,
    onTime: timed.filter((deal) => (deal.deliveredAt as number) <= (deal.deadlineUnix as number) * 1000).length,
    withDeadline: timed.length,
    disputes: mine.filter((deal) => deal.disputed).length,
  };
}

export function trustCard(input: TrustCardInput): TrustCard {
  return {
    role: input.role,
    name: input.businessVerified && input.companyName ? input.companyName : input.displayName,
    verifiedBusiness: input.businessVerified,
    verifiedPerson: input.personVerified,
    facts: input.facts,
    memberSince: input.memberSince,
    stakeUsdc: input.stakeUsdc,
    provenAccounts: input.xProven ? ['x'] : [],
    isNew: input.facts.settled === 0,
  };
}
