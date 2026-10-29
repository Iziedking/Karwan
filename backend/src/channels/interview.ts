import { buildSaveSetupConfirm, type ConfirmAction } from '../assistant/actions.js';
import type { BriefAnswers } from '../agents/agentBriefLines.js';
import { firstPost } from '../agents/firstPost.js';
import type { Goal } from '../db/profiles.js';
import { parsePlace } from '../location/rules.js';
import type { OnboardingResult } from './onboarding.js';
import { renderConfirm, type OutMessage } from './render.js';
import { CARD_TTL_MS, type ChatAccount, type InboundMessage, type OnboardingState, type SetupQuestion } from './types.js';

/// The setup interview after the tag: the questions /start?step=about asks, in
/// the same order, ending with Here's your Karwan as a confirm card. Looks right
/// saves it through the setup route; a first offer or request is offered after
/// that. The website's order is frontend/features/setup/setupSteps.ts, and its
/// defaults for what is not asked are withDefaults there.

export interface InterviewDeps {
  /// Sent when the interview ends: the questions that follow sign-up.
  afterwards: OutMessage[];
  /// The server's reading of the answers: the summary lines, and what has to
  /// be asked again.
  preview: (address: string, answers: BriefAnswers) => Promise<{ lines: string[]; needs: Array<'price'> }>;
  /// Runs the save_setup card, as a tap on any confirm card would.
  save: (address: string, card: ConfirmAction) => Promise<{ ok: true } | { ok: false; message: string }>;
  now?: () => number;
}

const GOALS: Array<[Goal, string]> = [
  ['work', 'Get paid for work'],
  ['sell', 'Sell my products'],
  ['buy', 'Buy or hire'],
  ['business', 'Business deals'],
  ['record', 'Build a record'],
];

type TextQuestion = 'what' | 'price' | 'buy' | 'business' | 'places' | 'where';
type ChoiceQuestion = 'paid' | 'clients' | 'own' | 'reach';

const ASK: Record<TextQuestion, string> = {
  what: 'What do you do? One line in your own words. Your agent uses it to find clients. For example: Logo and brand design.',
  price: 'Your usual price and how fast you deliver, however you say it. For example: 20 to 40 USDC, 3 days.',
  buy: 'What do you usually buy or hire for? And your usual budget, if you have one. For example: Phone repairs, up to 50 USDC.',
  business: 'Your business name, and what it trades. We start your business profile with this. For example: Bello Foods, rice and grains to shops.',
  places: 'Where do you already work or sell? Only accounts you prove are yours count toward your record. For example: Instagram, WhatsApp, Fiverr.',
  where: 'Where are you? Only your country is ever shown. Your city helps find people near you. For example: Lagos, Nigeria.',
};
const SELL_WHAT = 'What do you sell? One line in your own words. Your agent uses it to find buyers. For example: Ankara fabric, 6 yards a piece.';
const PRICE_AGAIN = "I couldn't read a price there. What do you usually charge, in USDC? For example: 20 to 40 USDC.";

const CHOICES: Record<ChoiceQuestion, { body: string; options: Array<[string, string]> }> = {
  paid: {
    body: 'How do clients usually pay you? Your agent offers deals this way. You can add other ways later.',
    options: [['one_time', 'All at once'], ['milestones', 'In stages'], ['goods', 'I send goods']],
  },
  clients: {
    body: 'Do you have clients already, or should Karwan find them?',
    options: [['own', 'I have clients'], ['find', 'Find clients for me'], ['both', 'Both']],
  },
  own: {
    body: 'How much should your agent do on its own? It can make offers within your price, or ask you first. Money never moves without your confirmation.',
    options: [['offers', 'Offer for me'], ['ask', 'Ask me first']],
  },
  reach: {
    body: 'How should we reach you? For new offers, payments and anything that needs you.',
    options: [['telegram', 'Telegram'], ['email', 'Email'], ['both', 'Both']],
  },
};

const isChoice = (q: SetupQuestion): q is ChoiceQuestion => q in CHOICES;
const text = (body: string): OutMessage => ({ kind: 'text', body });

/// The questions these goals need, in the website's order. How someone is paid
/// and how much their agent does alone are not asked (see withDefaults). Where
/// they are comes last: a chat has no Profile page to add it later, and a goods
/// seller ships from there.
export function interviewQuestions(goals: readonly Goal[]): SetupQuestion[] {
  const has = (g: Goal) => goals.includes(g);
  const selling = has('work') || has('sell');
  return [
    'goals',
    ...(selling ? (['what', 'price'] as const) : []),
    ...(has('buy') ? (['buy'] as const) : []),
    ...(has('business') ? (['business'] as const) : []),
    ...(has('record') ? (['places'] as const) : []),
    ...(selling || has('buy') ? (['clients'] as const) : []),
    'reach',
    'where',
  ];
}

/// What was not asked starts where the website starts it: paid all at once (on
/// arrival for someone who only sells goods), and an agent that offers within
/// the price but asks before any deal. Both change later from Profile.
export function withDefaults(answers: BriefAnswers): BriefAnswers {
  const out = { ...answers };
  const goals = answers.goals;
  if ((goals.includes('work') || goals.includes('sell')) && !out.paid) {
    out.paid = goals.includes('sell') && !goals.includes('work') ? 'goods' : 'one_time';
  }
  if (!out.own) out.own = 'offers';
  return out;
}

function goalsMessage(picked: readonly Goal[], lead?: string): OutMessage {
  const body = 'What do you want Karwan to do for you? Pick all that fit, then tap Done.';
  return {
    kind: 'buttons',
    body: lead ? `${lead}\n\n${body}` : body,
    buttons: [
      ...GOALS.map(([goal, title]) => ({ id: `ws:goal:${goal}`, title: picked.includes(goal) ? `✓ ${title}` : title })),
      { id: 'ws:goals:done', title: 'Done' },
    ],
  };
}

function ask(q: SetupQuestion, answers: BriefAnswers): OutMessage {
  if (q === 'goals') return goalsMessage(answers.goals);
  if (isChoice(q)) {
    const c = CHOICES[q];
    return { kind: 'buttons', body: c.body, buttons: c.options.map(([value, title]) => ({ id: `ws:${q}:${value}`, title })) };
  }
  if (q === 'what' && answers.goals.includes('sell') && !answers.goals.includes('work')) return text(SELL_WHAT);
  return text(ASK[q]);
}

const STEPS = new Set<string>(['role', 'offer', 'goals', 'what', 'price', 'paid', 'buy', 'business', 'places', 'clients', 'own', 'reach', 'where', 'confirm', 'post']);

export function createInterview<A extends ChatAccount>(deps: InterviewDeps) {
  const now = deps.now ?? Date.now;
  const at = (account: A, onboarding: OnboardingState): A => ({ ...account, onboarding });
  const finish = (account: A, out: OutMessage[], handOff?: string): OnboardingResult<A> => ({
    account: at(account, { step: 'done' }),
    out: [...out, ...deps.afterwards],
    ...(handOff ? { handOff } : {}),
  });

  async function enter(account: A): Promise<OnboardingResult<A>> {
    const answers: BriefAnswers = { goals: [] };
    return { account: at(account, { step: 'goals', answers }), out: [goalsMessage([], "Let's set up Karwan the way you want to use it.")] };
  }

  /// The question after `q`, or the card when there are no more.
  async function after(account: A, answers: BriefAnswers, q: SetupQuestion): Promise<OnboardingResult<A>> {
    // The price asked again after the card goes straight back to the card.
    if (q === 'price' && answers.retried) return card(account, answers);
    const order = interviewQuestions(answers.goals);
    const i = order.indexOf(q);
    // Someone left at a question the chat no longer asks picks up at the first
    // one they have not answered.
    const next = i >= 0 ? order[i + 1] : order.find((s) => s !== 'goals' && answers[s as keyof BriefAnswers] === undefined);
    if (next) return { account: at(account, { step: next, answers }), out: [ask(next, answers)] };
    return card(account, answers);
  }

  async function card(account: A, asked: BriefAnswers): Promise<OnboardingResult<A>> {
    const answers = withDefaults(asked);
    const read = await deps.preview(account.address!, answers).catch(() => null);
    // The account is returned as it came, so the same answer can be sent again.
    if (!read) return { account, out: [text("I couldn't read that just now. Send your last answer again in a minute.")] };
    if (read.needs.includes('price') && !answers.retried) {
      const retried = { ...answers, retried: true };
      return { account: at(account, { step: 'price', answers: retried }), out: [text(PRICE_AGAIN)] };
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
    // Someone left at the old interview's questions starts the new ones.
    if (state.step === 'role' || state.step === 'offer') return enter(account);

    const answers: BriefAnswers = state.answers ?? { goals: [] };
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
      if (q === 'goals') return finish(account, [text('No problem. Tell me any time what you sell or need.')]);
      return after(account, answers, q);
    }

    if (q === 'goals') {
      const goal = /^ws:goal:(\w+)$/.exec(tapped)?.[1] as Goal | undefined;
      if (goal && GOALS.some(([g]) => g === goal)) {
        const goals = answers.goals.includes(goal) ? answers.goals.filter((g) => g !== goal) : [...answers.goals, goal];
        const picked = { ...answers, goals };
        return { account: at(account, { step: 'goals', answers: picked }), out: [goalsMessage(goals)] };
      }
      if (tapped === 'ws:goals:done' && answers.goals.length) return after(account, answers, 'goals');
      return { account, out: [goalsMessage(answers.goals)] };
    }

    if (isChoice(q)) {
      const value = new RegExp(`^ws:${q}:(\\w+)$`).exec(tapped)?.[1];
      if (!value || !CHOICES[q].options.some(([v]) => v === value)) return { account, out: [ask(q, answers)] };
      return after(account, { ...answers, [q]: value } as BriefAnswers, q);
    }

    if (!said) return { account, out: [ask(q, answers)] };
    if (q === 'where' && !parsePlace(said).country) {
      return { account, out: [text("I didn't catch the country. Where are you? For example: Lagos, Nigeria. Or type skip.")] };
    }
    return after(account, { ...answers, [q]: said }, q);
  }

  async function confirmStep(account: A, answers: BriefAnswers, tapped: string): Promise<OnboardingResult<A>> {
    const tap = /^(confirm|cancel):(.+)$/.exec(tapped);
    const pending = tap ? account.pendingActions?.[tap[2]!] : undefined;
    // A typed message, an old card or one that ran out of time: show the card again.
    if (!tap || !pending || pending.expiresAt < now() || pending.action.intent !== 'save_setup') {
      return card(account, answers);
    }
    const remaining = { ...(account.pendingActions ?? {}) };
    delete remaining[tap[2]!];
    if (tap[1] === 'cancel') {
      const fresh: BriefAnswers = { goals: [] };
      return { account: { ...at(account, { step: 'goals', answers: fresh }), pendingActions: remaining }, out: [goalsMessage([], "Let's go again.")] };
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
