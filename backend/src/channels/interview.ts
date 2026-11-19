import { buildSaveSetupConfirm, type ConfirmAction } from '../assistant/actions.js';
import type { BriefAnswers } from '../agents/agentBriefLines.js';
import { firstPost } from '../agents/firstPost.js';
import { splitSellLine } from '../agents/sellLine.js';
import type { Goal } from '../db/profiles.js';
import { parsePlace } from '../location/rules.js';
import type { OnboardingResult } from './onboarding.js';
import { renderConfirm, type OutMessage } from './render.js';
import { CARD_TTL_MS, type ChatAccount, type InboundMessage, type OnboardingState, type SetupQuestion } from './types.js';

/// The setup interview after the tag (view 39, "Set up in two minutes", 19
/// Nov): what brings you, where you are, one line for what you sell or need,
/// and how we reach you, ending with Here's your Karwan as a confirm card.
/// Looks right saves it through the setup route; a first offer or request is
/// offered after that. Where you are comes second in chat, because there it
/// sets the currency amounts are read in. A shared location is answered with
/// the nearest town from Karwan's own list.

export interface InterviewDeps {
  /// Sent when the interview ends: the questions that follow sign-up.
  afterwards: OutMessage[];
  /// The server's reading of the answers: the summary lines, and what has to
  /// be asked again.
  preview: (address: string, answers: BriefAnswers) => Promise<{ lines: string[]; needs: Array<'price'> }>;
  /// Runs the save_setup card, as a tap on any confirm card would.
  save: (address: string, card: ConfirmAction) => Promise<{ ok: true } | { ok: false; message: string }>;
  /// The town nearest a shared location, or null when none is near.
  near: (point: { lat: number; lng: number }) => Promise<{ country: string; city: string; admin: string } | null>;
  now?: () => number;
}

/// What the chat collects: the reader's answers, plus the place picked, whose
/// position the setup route keeps to about a kilometre.
export type InterviewAnswers = BriefAnswers & {
  place?: { country: string; city?: string; admin?: string; point?: { lat: number; lng: number } };
};

type Brings = 'sell' | 'buy' | 'both';
const BRINGS: Array<[Brings, string]> = [['sell', 'Sell'], ['buy', 'Buy or hire'], ['both', 'Both']];
const GOALS_FOR: Record<Brings, Goal[]> = { sell: ['work'], buy: ['buy'], both: ['work', 'buy'] };

const BRINGS_ASK = 'What brings you to Karwan?';
const SELL_ASK = 'What do you sell, and your usual price? One line, the way you would tell a client. For example: Logo design, 20 to 40 USDC, 3 days.';
const BUY_ASK = 'What do you need, and your budget? For example: A designer for my brand, up to 50 USDC.';
const WHERE_ASK = 'Where are you? Tap Share my location, or type your city and country. Only your country is ever shown. Your city helps me find people near you.';
const WHERE_AGAIN = "I didn't catch the country. Type your city and country, for example: Lagos, Nigeria. Or tap Share my location.";
const NOT_PLACED = "I couldn't place that location. Type your city and country, for example: Lagos, Nigeria.";
const PRICE_AGAIN = "I couldn't read a price there. What do you usually charge? One price, or your lowest to your usual. For example: 20 to 40 USDC.";
const REACH: { body: string; options: Array<[string, string]> } = {
  body: 'How should we reach you? For new offers, payments and anything that needs you.',
  options: [['telegram', 'Telegram'], ['email', 'Email'], ['both', 'Both']],
};
/// Steps of the earlier interviews: someone left there starts again.
const OLD_STEPS = new Set(['role', 'offer', 'goals', 'what', 'paid', 'business', 'places', 'clients', 'own']);

const text = (body: string): OutMessage => ({ kind: 'text', body });
const selling = (a: BriefAnswers) => a.goals.includes('work') || a.goals.includes('sell');
const buying = (a: BriefAnswers) => a.goals.includes('buy');

/// The questions these answers need, in order.
export function interviewQuestions(answers: BriefAnswers): SetupQuestion[] {
  return ['brings', 'where', ...(selling(answers) ? (['sell'] as const) : []), ...(buying(answers) ? (['buy'] as const) : []), 'reach'];
}

/// What was not asked starts where the website starts it: one payment, and an
/// agent that offers within the price but asks before any deal.
export function withDefaults(answers: InterviewAnswers): InterviewAnswers {
  const out = { ...answers };
  if (selling(answers) && !out.paid) out.paid = 'one_time';
  if (!out.own) out.own = 'offers';
  return out;
}

function ask(q: SetupQuestion): OutMessage {
  if (q === 'brings') return { kind: 'buttons', body: BRINGS_ASK, buttons: BRINGS.map(([v, title]) => ({ id: `ws:brings:${v}`, title })) };
  if (q === 'reach') return { kind: 'buttons', body: REACH.body, buttons: REACH.options.map(([v, title]) => ({ id: `ws:reach:${v}`, title })) };
  if (q === 'where') return { kind: 'ask_location', body: WHERE_ASK, label: 'Share my location' };
  if (q === 'sell') return text(SELL_ASK);
  if (q === 'buy') return text(BUY_ASK);
  return text(PRICE_AGAIN);
}

const answered = (a: InterviewAnswers, q: SetupQuestion) =>
  q === 'brings' ? a.goals.length > 0 : q === 'sell' ? a.what !== undefined : q === 'buy' ? a.buy !== undefined : q === 'where' ? a.where !== undefined : q === 'reach' ? a.reach !== undefined : true;

const STEPS = new Set<string>([...OLD_STEPS, 'brings', 'sell', 'price', 'buy', 'reach', 'where', 'confirm', 'post']);

export function createInterview<A extends ChatAccount>(deps: InterviewDeps) {
  const now = deps.now ?? Date.now;
  const at = (account: A, onboarding: OnboardingState): A => ({ ...account, onboarding });
  const finish = (account: A, out: OutMessage[], handOff?: string): OnboardingResult<A> => ({
    account: at(account, { step: 'done' }),
    out: [...out, ...deps.afterwards],
    ...(handOff ? { handOff } : {}),
  });

  async function enter(account: A, lead = "Let's set up Karwan the way you want to use it."): Promise<OnboardingResult<A>> {
    const first = ask('brings');
    return {
      account: at(account, { step: 'brings', answers: { goals: [] } }),
      out: [first.kind === 'buttons' ? { ...first, body: `${lead}\n\n${first.body}` } : first],
    };
  }

  /// The question after `q`, or the card when there are no more.
  async function after(account: A, answers: InterviewAnswers, q: SetupQuestion, lead: OutMessage[] = []): Promise<OnboardingResult<A>> {
    // The price asked again after the card goes straight back to the card.
    if (q === 'price') return card(account, answers);
    const order = interviewQuestions(answers);
    const i = order.indexOf(q);
    const next = (i >= 0 ? order.slice(i + 1) : order).find((s) => !answered(answers, s));
    if (next) return { account: at(account, { step: next, answers }), out: [...lead, ask(next)] };
    const done = await card(account, answers);
    return { ...done, out: [...lead, ...done.out] };
  }

  async function card(account: A, asked: InterviewAnswers): Promise<OnboardingResult<A>> {
    const answers = withDefaults(asked);
    const read = await deps.preview(account.address!, answers).catch(() => null);
    // The account is returned as it came, so the same answer can be sent again.
    if (!read) return { account, out: [text("I couldn't read that just now. Send your last answer again in a minute.")] };
    if (read.needs.includes('price') && !answers.retried) {
      return { account: at(account, { step: 'price', answers: { ...answers, retried: true } }), out: [text(PRICE_AGAIN)] };
    }
    const action = buildSaveSetupConfirm(answers, read.lines);
    // One setup card at a time: showing it again replaces the earlier one.
    const others = Object.entries(account.pendingActions ?? {}).filter(([, p]) => p.action.intent !== 'save_setup');
    const pendingActions = { ...Object.fromEntries(others), [action.id]: { action, expiresAt: now() + CARD_TTL_MS } };
    return { account: { ...at(account, { step: 'confirm', answers }), pendingActions }, out: [renderConfirm(action)] };
  }

  async function handle(account: A, m: InboundMessage): Promise<OnboardingResult<A> | null> {
    const state = account.onboarding;
    if (!state || !STEPS.has(state.step)) return null;
    if (!account.address) return finish(account, []);
    // Someone left at an earlier interview's questions starts these.
    if (OLD_STEPS.has(state.step)) return enter(account);

    const answers: InterviewAnswers = state.answers ?? { goals: [] };
    const said = m.kind === 'text' ? (m.text ?? '').trim() : '';
    const tapped = m.kind === 'button' ? (m.replyId ?? '') : '';

    if (state.step === 'confirm') return confirmStep(account, answers, tapped);
    if (state.step === 'post') {
      const post = firstPost(answers);
      if (tapped === 'ws:post:yes' && post) return finish(account, [text(`Here's your ${post.kind} to check.`)], post.handOff);
      return finish(account, [text('No problem. Tell me any time what you sell or need.')]);
    }

    const q = state.step as SetupQuestion;
    if (/^skip$/i.test(said)) {
      if (q === 'brings') return finish(account, [text('No problem. Tell me any time what you sell or need.')]);
      return after(account, q === 'where' ? { ...answers, where: '' } : answers, q);
    }

    if (q === 'brings') {
      const v = /^ws:brings:(\w+)$/.exec(tapped)?.[1] as Brings | undefined;
      if (!v || !GOALS_FOR[v]) return { account, out: [ask('brings')] };
      return after(account, { ...answers, goals: GOALS_FOR[v] }, 'brings');
    }

    if (q === 'reach') {
      const v = /^ws:reach:(\w+)$/.exec(tapped)?.[1];
      if (!v || !REACH.options.some(([o]) => o === v)) return { account, out: [ask('reach')] };
      return after(account, { ...answers, reach: v as BriefAnswers['reach'] }, 'reach');
    }

    if (q === 'where') {
      // The keyboard with Share my location closes once the place is known.
      const placed = (where: string) => ({ kind: 'text' as const, body: `Got it: ${where}.` });
      if (m.kind === 'location' && m.location) {
        const town = await deps.near(m.location).catch(() => null);
        if (!town) return { account, out: [text(NOT_PLACED)] };
        const where = `${town.city}, ${town.country}`;
        const place = { country: town.country, city: town.city, admin: town.admin, point: m.location };
        return after(account, { ...answers, where, place }, 'where', [{ ...placed(where), closeKeyboard: true }]);
      }
      if (!said) return { account, out: [ask('where')] };
      const parsed = parsePlace(said);
      if (!parsed.country) return { account, out: [text(WHERE_AGAIN)] };
      const place = { country: parsed.country, ...(parsed.city ? { city: parsed.city } : {}) };
      return after(account, { ...answers, where: said, place }, 'where', [{ ...placed(said), closeKeyboard: true }]);
    }

    if (!said) return { account, out: [ask(q)] };
    if (q === 'sell') {
      const { what, price } = splitSellLine(said);
      return after(account, { ...answers, what, ...(price ? { price } : {}) }, 'sell');
    }
    if (q === 'price') return after(account, { ...answers, price: said }, 'price');
    return after(account, { ...answers, [q]: said }, q);
  }

  async function confirmStep(account: A, answers: InterviewAnswers, tapped: string): Promise<OnboardingResult<A>> {
    const tap = /^(confirm|cancel):(.+)$/.exec(tapped);
    const pending = tap ? account.pendingActions?.[tap[2]!] : undefined;
    // A typed message, an old card or one that ran out of time: show the card again.
    if (!tap || !pending || pending.expiresAt < now() || pending.action.intent !== 'save_setup') {
      return card(account, answers);
    }
    const remaining = { ...(account.pendingActions ?? {}) };
    delete remaining[tap[2]!];
    if (tap[1] === 'cancel') {
      const again = await enter({ ...account, pendingActions: remaining } as A, "Let's go again.");
      return again;
    }
    const saved = await deps.save(account.address!, pending.action);
    if (!saved.ok) return { account, out: [text(saved.message)] };
    const done = { ...account, pendingActions: remaining };
    const post = firstPost(answers);
    if (!post) return finish(done, [text('Saved. Your agents now work this way.')]);
    return {
      account: at(done, { step: 'post', answers }),
      out: [
        text('Saved. Your agents now work this way.'),
        {
          kind: 'buttons',
          body: `Post this as your first ${post.kind}?`,
          buttons: [{ id: 'ws:post:yes', title: 'Post it' }, { id: 'ws:post:no', title: 'Not now' }],
        },
      ],
    };
  }

  return { enter, handle };
}
