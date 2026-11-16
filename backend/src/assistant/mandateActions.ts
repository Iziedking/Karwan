import { mandatePatchSchema, previewPatch, sayMandate, validatePatch, type Mandate, type MandatePatch } from '../agents/mandate.js';
import { effectOf, type Effect } from '../agents/mandateEffect.js';
import { passedForPrice } from '../agents/replan.js';
import { widens } from '../agents/widening.js';
import type { AgentQuestion } from '../db/agentQuestions.js';
import type { ProgressRow } from '../db/agentProgress.js';
import type { UserLocale } from '../db/profiles.js';
import { confirmNonce, type ChangeMandateConfirm } from './actions.js';

/// The card for one mandate change (view 52, step 3): the lines that change,
/// before and after, and what the change does next. Moves no money, so there
/// is no warning; a change that lets the agent spend or agree to more is still
/// only made when the person presses the button.

const LABELS: Record<UserLocale, { title: string; summary: string; now: string; after: string; next: string; confirm: string; cancel: string; toConfirm: string; passkey: string }> = {
  en: { title: 'Change what your agent may do', summary: 'Nothing changes until you confirm.', now: 'Now', after: 'After', next: 'What it does next', confirm: 'Make the change', cancel: 'Not now', toConfirm: 'To confirm', passkey: 'Your passkey, on Karwan' },
  fr: { title: 'Changer ce que votre agent peut faire', summary: 'Rien ne change avant votre confirmation.', now: 'Maintenant', after: 'Après', next: 'Ce qu’il fera ensuite', confirm: 'Faire le changement', cancel: 'Pas maintenant', toConfirm: 'Pour confirmer', passkey: 'Votre clé d’accès, sur Karwan' },
  ar: { title: 'غيّر ما يمكن لوكيلك فعله', summary: 'لا يتغير شيء حتى تؤكد.', now: 'الآن', after: 'بعد', next: 'ما سيفعله بعد ذلك', confirm: 'نفّذ التغيير', cancel: 'ليس الآن', toConfirm: 'للتأكيد', passkey: 'مفتاح المرور، على Karwan' },
  hi: { title: 'बदलें कि आपका एजेंट क्या कर सकता है', summary: 'आपकी पुष्टि तक कुछ नहीं बदलता।', now: 'अभी', after: 'बाद में', next: 'आगे यह क्या करेगा', confirm: 'बदलाव करें', cancel: 'अभी नहीं', toConfirm: 'पुष्टि के लिए', passkey: 'आपकी पासकी, Karwan पर' },
  sw: { title: 'Badilisha anachoweza kufanya wakala wako', summary: 'Hakuna kinachobadilika hadi uthibitishe.', now: 'Sasa', after: 'Baadaye', next: 'Atakachofanya baadaye', confirm: 'Fanya mabadiliko', cancel: 'Si sasa', toConfirm: 'Kuthibitisha', passkey: 'Passkey yako, kwenye Karwan' },
};

export function buildChangeMandateConfirm(m: Mandate, p: MandatePatch, effect: Effect, now: number, locale: UserLocale = 'en'): ChangeMandateConfirm {
  const l = LABELS[locale] ?? LABELS.en;
  const before = sayMandate(m, locale);
  const after = sayMandate(previewPatch(m, p, now), locale);
  const gone = before.filter((line) => !after.includes(line));
  const added = after.filter((line) => !before.includes(line));
  return {
    kind: 'confirm',
    id: `change_mandate:${confirmNonce()}`,
    intent: 'change_mandate',
    title: l.title,
    summary: l.summary,
    fields: [
      ...(gone.length ? [{ label: l.now, value: gone.join(' ') }] : []),
      ...(added.length ? [{ label: l.after, value: added.join(' ') }] : []),
      { label: l.next, value: effect.line },
      // Letting the agent lock more is confirmed where the agent cannot answer (view 87).
      ...(widens(m, p) ? [{ label: l.toConfirm, value: l.passkey }] : []),
    ],
    payload: { patch: p },
    confirmLabel: l.confirm,
    cancelLabel: l.cancel,
  };
}

/// What the three mandate tools read, injected so they are tested without a database.
export interface MandateToolDeps {
  read: (address: string, now: number) => Promise<{ mandate: Mandate; locale: UserLocale } | null>;
  questionsSince: (address: string, since: number) => Promise<AgentQuestion[]>;
  openRequests: (address: string, now: number) => Promise<Array<{ jobId: string; budgetUsdc: number }>>;
  toldSince: (address: string, since: number) => Promise<ProgressRow[]>;
  /// Whether Lock money is open on this network (view 87). Closed when absent.
  lockOpen?: () => boolean;
}

const WEEK_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;

export async function showMyMandate(deps: MandateToolDeps, address: string, now: number) {
  const r = await deps.read(address, now);
  if (!r) return { error: 'Finish setting up your agent first.' };
  return { lines: sayMandate(r.mandate, r.locale), mandate: r.mandate, next: 'Say the lines as given. A change goes through propose_change_mandate, one part at a time.' };
}

/// One change as a card, never applied here: the person confirms it.
export async function proposeChangeMandate(deps: MandateToolDeps, address: string, input: unknown, now: number): Promise<{ card: ChangeMandateConfirm; effect: string; needsPresence: boolean } | { error: string }> {
  const parsed = mandatePatchSchema.safeParse(input);
  if (!parsed.success) return { error: 'Change one part at a time: a selling price, one switch for what it does alone, the limits for locking money, the weekly limit, the buying limit, a goal, the brief or quiet hours.' };
  const r = await deps.read(address, now);
  if (!r) return { error: 'Finish setting up your agent first.' };
  const patch = parsed.data;
  const locks = (patch.part === 'switch' && patch.name === 'lock' && patch.on) || patch.part === 'lock-rules';
  if (locks && deps.lockOpen?.() !== true) return { error: 'Lock money is not open here yet.' };
  const refusal = validatePatch(r.mandate, patch, r.locale);
  if (refusal) return { error: refusal };
  const [questions, openRequests] = await Promise.all([
    patch.part === 'sell-price' ? deps.questionsSince(address, now - WEEK_MS) : Promise.resolve([]),
    patch.part === 'buy-most' ? deps.openRequests(address, now) : Promise.resolve([]),
  ]);
  const effect = effectOf(r.mandate, patch, { now, passedForPrice: passedForPrice(questions), openRequests }, r.locale);
  return { card: buildChangeMandateConfirm(r.mandate, patch, effect, now, r.locale), effect: effect.line, needsPresence: widens(r.mandate, patch) };
}

/// What the agent told the person today or this week, newest first.
export async function whatDidMyAgentDo(deps: MandateToolDeps, address: string, range: 'today' | 'week', now: number) {
  const all = await deps.toldSince(address, now - (range === 'today' ? DAY_MS : WEEK_MS));
  // A quiet day, or an insight already inside a brief, has no lines of its own.
  const rows = all
    .map((row) => ({
      at: new Date(row.at).toISOString(),
      kind: row.kind === 'insight' ? 'note' : row.kind,
      sent: row.state === 'sent',
      lines: Array.isArray(row.data.lines) ? (row.data.lines as unknown[]).filter((l): l is string => typeof l === 'string') : [],
    }))
    .filter((row) => row.lines.length > 0);
  return {
    told: rows,
    next: rows.length > 0 ?'Say what it told them in plain lines, newest first; say a line that is not marked sent is still on its way.' : 'Say the agent has not sent them anything in that time.',
  };
}
