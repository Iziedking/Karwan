/// How do you want to pay? (view 44, section 6). Only the kinds that run today
/// are offered: pay on delivery, in parts, rent with a deposit and the business
/// order join when their part of the escrow family is deployed.

export type KindChoice = 'one' | 'stages' | 'hourly' | 'monthly' | 'contest' | 'shipped' | 'in_person';

const ALL: readonly KindChoice[] = ['one', 'stages', 'hourly', 'monthly', 'contest', 'shipped', 'in_person'];

export function kindChoices(features: { hourlyWork: boolean }): { work: KindChoice[]; goods: KindChoice[] } {
  return {
    work: features.hourlyWork ? ['one', 'stages', 'hourly', 'monthly', 'contest'] : ['one', 'stages', 'contest'],
    goods: ['shipped', 'in_person'],
  };
}

/// The kind a deal starts on: the one a link asks for, else what the listing
/// sells (an item ships; a service is one payment), else none.
export function preselectedKind(input: { kind?: string | null; listingKind?: 'goods' | 'in_person' | 'remote' | null }): KindChoice | null {
  if (input.kind && (ALL as readonly string[]).includes(input.kind)) return input.kind as KindChoice;
  if (input.listingKind === 'goods') return 'shipped';
  if (input.listingKind) return 'one';
  return null;
}
