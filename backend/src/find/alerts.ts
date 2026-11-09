import { tg } from '../i18n/telegram.js';
import type { UserLocale } from '../db/profiles.js';
import type { DistanceLine } from '../location/rules.js';
import type { CreateResult, NewContact, Contact } from './contacts.js';
import type { Find } from './finds.js';
import type { LimitReason } from './limits.js';

/// Deal alerts (view 72, Phase 3): once a buyer picks people from a find and
/// the private request is posted, each person picked is told someone needs
/// their work. The alert rides the agent note every channel already shows,
/// written in the seller's own language and money, with a link to the request
/// where they send their price or say no thanks. Their agent still judges the
/// request as it does any other: it offers within their ways or asks them.

export interface AlertDeps {
  create(c: NewContact, now: number, firstDue: (sentAt: number) => Promise<number | null>): Promise<CreateResult>;
  firstDue(to: string): (sentAt: number) => Promise<number | null>;
  saveFind(f: Find): Promise<Find>;
  locale(person: string): Promise<UserLocale>;
  /// A USDC amount in the person's own currency.
  money(person: string, usdc: number): Promise<string>;
  note(to: string, data: { heading: string; lines: string[]; jobId: string }): void;
  newId(): string;
}

export interface AlertOutcome {
  asked: string[];
  refused: Array<{ name: string; reason: LimitReason }>;
}

function distanceLine(d: DistanceLine, locale: UserLocale): string | null {
  switch (d.key) {
    case 'nearby': return tg('alert.nearby', locale);
    case 'about':
    case 'far': return tg('alert.km', locale, { km: String(d.km) });
    case 'inCity':
    case 'sameCity': return tg('alert.city', locale, { city: d.city });
    default: return null;
  }
}

/// The alert, or one of its reminders, in the seller's language.
export async function alertNote(
  input: { to: string; need: string; budgetUsdc: string; kind: Find['kind']; distance: DistanceLine; byDay: string | null; reminder: boolean },
  deps: Pick<AlertDeps, 'locale' | 'money'>,
): Promise<{ heading: string; lines: string[] }> {
  const locale = await deps.locale(input.to);
  const near = input.kind === 'in_person';
  const heading = tg(input.reminder ? (near ? 'alert.reminderNear' : 'alert.reminder') : near ? 'alert.headingNear' : 'alert.heading', locale);
  const budget = tg('alert.budget', locale, { amount: await deps.money(input.to, Number(input.budgetUsdc)) });
  const lines = [
    `"${input.need}"`,
    [budget, input.byDay ? tg('alert.by', locale, { day: input.byDay }) : null].filter(Boolean).join(' · '),
    near ? distanceLine(input.distance, locale) : null,
    tg('alert.open', locale),
  ].filter((l): l is string => !!l);
  return { heading, lines };
}

/// Alerts the people picked from a find, within the limits, after the private
/// request went up. A person a limit stops is named back, never alerted.
export async function alertPicked(
  input: { find: Find; picks: number[]; jobId: string; byDay: string | null },
  now: number,
  deps: AlertDeps,
): Promise<AlertOutcome> {
  const out: AlertOutcome = { asked: [], refused: [] };
  for (const i of [...new Set(input.picks)]) {
    const row = input.find.rows[i];
    if (!row) continue;
    const made = await deps.create(
      { id: deps.newId(), findId: input.find.id, from: input.find.owner, to: row.user, kind: 'alert', needId: null },
      now,
      deps.firstDue(row.user),
    );
    if (!made.ok) {
      out.refused.push({ name: row.name, reason: made.reason });
      continue;
    }
    out.asked.push(row.name);
    if (made.contact.delivered) {
      deps.note(row.user, { ...(await alertNote({ to: row.user, need: input.find.need, budgetUsdc: input.find.budgetUsdc, kind: input.find.kind, distance: row.distance, byDay: input.byDay, reminder: false }, deps)), jobId: input.jobId });
    }
  }
  await deps.saveFind({ ...input.find, jobId: input.jobId, status: 'contacting', mode: 'choose' });
  return out;
}

/// What the sweep sends for a due contact: the held alert, or a reminder.
export async function sendDue(
  claimed: { contact: Contact; step: 'deliver' | 'remind' },
  find: Find | null,
  deps: Pick<AlertDeps, 'locale' | 'money' | 'note'>,
): Promise<void> {
  const c = claimed.contact;
  if (!find?.jobId || c.kind !== 'alert') return;
  const row = find.rows.find((r) => r.user === c.to);
  if (!row) return;
  const text = await alertNote({ to: c.to, need: find.need, budgetUsdc: find.budgetUsdc, kind: find.kind, distance: row.distance, byDay: null, reminder: claimed.step === 'remind' }, deps);
  deps.note(c.to, { ...text, jobId: find.jobId });
}
