import type { UserRole } from '@/core/api';

export interface EditState {
  role: UserRole;
  /// A business edits its name on the company page, so this form skips it.
  needsName: boolean;
  displayName: string;
  skills: string;
  bio: string;
  sellerMin: number;
  sellerMax: number;
  sellerMinDays: number;
  sellerMaxDays: number;
  buyerMax: number;
  buyerMinDays: number;
  buyerMaxDays: number;
  split: string;
}

export type EditBlocker = 'name' | 'offer' | 'bio' | 'sellerPrice' | 'sellerDays' | 'buyerMax' | 'buyerDays' | 'split';

export function splitPercents(split: string): number[] {
  return split.split(',').map((part) => Number(part.trim())).filter(Number.isFinite);
}

/// Every rule that keeps Save off, named, in the order the fields appear, so
/// the page can say under each field what it needs instead of greying Save
/// out with no reason.
export function editBlockers(s: EditState): EditBlocker[] {
  const out: EditBlocker[] = [];
  if (s.needsName && !s.displayName.trim()) out.push('name');
  const selling = s.role === 'seller' || s.role === 'both';
  const buying = s.role === 'buyer' || s.role === 'both';
  if (selling) {
    if (s.skills.split(',').map((part) => part.trim()).filter(Boolean).length === 0) out.push('offer');
    if (!s.bio.trim()) out.push('bio');
    if (!(s.sellerMin > 0) || !(s.sellerMax > s.sellerMin)) out.push('sellerPrice');
    if (!(s.sellerMinDays > 0) || !(s.sellerMaxDays >= s.sellerMinDays)) out.push('sellerDays');
  }
  if (buying) {
    if (!(s.buyerMax > 0)) out.push('buyerMax');
    if (!(s.buyerMinDays > 0) || !(s.buyerMaxDays >= s.buyerMinDays)) out.push('buyerDays');
    const pcts = splitPercents(s.split);
    if (pcts.length === 0 || pcts.reduce((a, b) => a + b, 0) !== 100) out.push('split');
  }
  return out;
}
