/// Words and times for the support desk's cases (view 78).

export type CaseKind = 'money_in_deal' | 'transfer_missing' | 'account' | 'using_karwan' | 'other';
export type CaseState = 'new' | 'waiting_us' | 'waiting_person' | 'solved';
export type CaseChannel = 'web' | 'telegram' | 'email';

const MIN = 60_000;
const SOON = 30 * MIN;

function span(ms: number): string {
  const total = Math.max(1, Math.round(ms / MIN));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function dueLabel(dueAt: number, now: number, repliedAt?: number | null): { text: string; tone: 'calm' | 'soon' | 'late' } {
  if (repliedAt) return { text: 'Answered', tone: 'calm' };
  const left = dueAt - now;
  if (left < 0) return { text: `Late by ${span(-left)}`, tone: 'late' };
  return { text: `Due in ${span(left)}`, tone: left <= SOON ? 'soon' : 'calm' };
}

const KIND: Record<CaseKind, string> = {
  money_in_deal: 'Money held in a deal',
  transfer_missing: 'Transfer did not arrive',
  account: 'Account and sign-in',
  using_karwan: 'Using Karwan',
  other: 'Something else',
};

const STATE: Record<CaseState, string> = {
  new: 'New',
  waiting_us: 'Waiting on us',
  waiting_person: 'Waiting on them',
  solved: 'Solved',
};

const CHANNEL: Record<CaseChannel, string> = { web: 'Website', telegram: 'Telegram', email: 'Email' };

export const kindLabel = (k: CaseKind) => KIND[k];
export const stateLabel = (s: CaseState) => STATE[s];
export const channelLabel = (c: CaseChannel) => CHANNEL[c];
