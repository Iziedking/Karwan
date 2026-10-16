/// The public traction proof: waitlist, survey and team counts that anyone can
/// watch grow, with every contact masked so nobody can be reached or identified
/// from it. Self-reported by Karwan, unlike the chain totals in
/// /api/network/lifetime, so it says what it is and stays behind
/// PUBLIC_TRACTION_ENABLED with the other traction routes.

/// Mail providers whose name says nothing about the person. Any other domain
/// can name an employer, so it is masked too.
const COMMON_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'aol.com', 'mail.com', 'gmx.com', 'zoho.com',
]);

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_CHARS = /^[+\d\s().-]+$/;

export function maskEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = `${local.charAt(0)}***`;
  if (COMMON_MAIL_DOMAINS.has(domain)) return `${head}@${domain}`;
  const tld = domain.slice(domain.lastIndexOf('.'));
  return `${head}@${domain.charAt(0)}***${tld}`;
}

export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 9) return '••••';
  return `+${digits.slice(0, 3)}••••${digits.slice(-2)}`;
}

export function maskAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export type ContactKind = 'email' | 'phone' | 'other';

export function maskContact(raw: string): { kind: ContactKind; masked: string } {
  const value = raw.trim();
  if (EMAIL.test(value)) return { kind: 'email', masked: maskEmail(value) };
  const digits = value.replace(/\D/g, '');
  if (PHONE_CHARS.test(value) && digits.length >= 7 && digits.length <= 15) {
    return { kind: 'phone', masked: maskPhone(value) };
  }
  return { kind: 'other', masked: '•••' };
}

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function byDay(times: readonly number[]): Array<{ day: string; count: number }> {
  const counts = new Map<string, number>();
  for (const t of times) counts.set(dayOf(t), (counts.get(dayOf(t)) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }));
}

/// A contact counts once however it is capitalised or spaced.
function contactKey(raw: string): string {
  const value = raw.trim().toLowerCase();
  return EMAIL.test(value) ? value : value.replace(/\D/g, '') || value;
}

export interface ProofInput {
  waitlist: ReadonlyArray<{ email: string; joinedAt: number; useCases?: readonly string[] }>;
  survey: ReadonlyArray<{ createdAt: number; contact: string | null }>;
  team: readonly string[];
  now: number;
}

export function buildTractionProof(input: ProofInput) {
  const waitlistByEmail = new Map<string, number>();
  for (const w of input.waitlist) {
    const key = w.email.trim().toLowerCase();
    if (!waitlistByEmail.has(key)) waitlistByEmail.set(key, w.joinedAt);
  }

  const surveyContacts = new Map<string, { kind: ContactKind; masked: string }>();
  let withContact = 0;
  for (const s of input.survey) {
    if (!s.contact || !s.contact.trim()) continue;
    withContact++;
    const key = contactKey(s.contact);
    if (!surveyContacts.has(key)) surveyContacts.set(key, maskContact(s.contact));
  }
  const kinds = [...surveyContacts.values()];

  const team = [...new Set(input.team.map((a) => a.trim().toLowerCase()))].filter((a) => /^0x[0-9a-f]{40}$/.test(a));

  return {
    generatedAt: new Date(input.now).toISOString(),
    note: 'Self-reported by Karwan from its own database. Contacts are masked. Chain totals are at /api/network/lifetime.',
    waitlist: {
      total: waitlistByEmail.size,
      withUseCase: input.waitlist.filter((w) => (w.useCases?.length ?? 0) > 0).length,
      byDay: byDay([...waitlistByEmail.values()]),
      contacts: [...waitlistByEmail.keys()].map(maskEmail),
    },
    survey: {
      total: input.survey.length,
      withContact,
      distinctContacts: surveyContacts.size,
      emails: kinds.filter((k) => k.kind === 'email').length,
      phones: kinds.filter((k) => k.kind === 'phone').length,
      byDay: byDay(input.survey.map((s) => s.createdAt)),
      contacts: kinds.map((k) => k.masked),
    },
    team: {
      count: team.length,
      accounts: team.map(maskAddress),
    },
  };
}
