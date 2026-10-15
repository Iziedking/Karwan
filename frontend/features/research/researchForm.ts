export const ROLES = ['seller', 'buyer', 'both', 'platform'] as const;
export const SIGNALS = ['reviews', 'past_work', 'vouch', 'id', 'test_job'] as const;
export const CHECKS = [...SIGNALS, 'nothing', 'other'] as const;
export const SHARE = ['yes', 'if_i_choose', 'one_deal', 'no'] as const;
export const PAYER = ['checker', 'app', 'free', 'not_sure'] as const;

export type Role = (typeof ROLES)[number];
export type Signal = (typeof SIGNALS)[number];
export type Check = (typeof CHECKS)[number];
export type Share = (typeof SHARE)[number];
export type Payer = (typeof PAYER)[number];

export interface ResearchDraft {
  role?: Role;
  checks: Check[];
  otherText: string;
  trustMost?: Signal;
  easiestFake?: Signal;
  share?: Share;
  payer?: Payer;
  contact: string;
  /// Hidden from people; a bot that fills it is thanked and ignored.
  website: string;
}

export type ResearchIssue = 'required' | 'pickOne';
export type ResearchField = 'role' | 'checks' | 'trustMost' | 'easiestFake' | 'share' | 'payer';

export function emptyResearchDraft(): ResearchDraft {
  return { checks: [], otherText: '', contact: '', website: '' };
}

export function researchIssues(d: ResearchDraft): Partial<Record<ResearchField, ResearchIssue>> {
  const issues: Partial<Record<ResearchField, ResearchIssue>> = {};
  if (!d.role) issues.role = 'required';
  if (d.checks.length === 0) issues.checks = 'pickOne';
  if (!d.trustMost) issues.trustMost = 'required';
  if (!d.easiestFake) issues.easiestFake = 'required';
  if (!d.share) issues.share = 'required';
  if (!d.payer) issues.payer = 'required';
  return issues;
}

export function researchPayload(d: ResearchDraft, locale: string) {
  const otherText = d.checks.includes('other') ? d.otherText.trim() || undefined : undefined;
  const contact = d.contact.trim() || undefined;
  return {
    locale,
    role: d.role,
    checks: d.checks,
    otherText,
    trustMost: d.trustMost,
    easiestFake: d.easiestFake,
    share: d.share,
    payer: d.payer,
    contact,
    website: d.website,
  };
}
