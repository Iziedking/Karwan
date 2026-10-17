import type { OnboardingResult } from './onboarding.js';
import type { OutMessage } from './render.js';
import type { ChatAccount, InboundMessage } from './types.js';

/// The workspace interview after the tag: do you sell, buy or both, what, and
/// at what price and pace. The answers go to the agent as the person's own
/// words, and the agent posts the first offer or request with its usual card.

export interface InterviewDeps {
  /// Sent when the interview ends: the questions that follow sign-up.
  afterwards: OutMessage[];
}

const ROLE: OutMessage = {
  kind: 'buttons',
  body: 'Do you sell, buy, or both?',
  buttons: [
    { id: 'ws:sell', title: 'I sell' },
    { id: 'ws:buy', title: 'I buy' },
    { id: 'ws:both', title: 'Both' },
  ],
};

const PRICE = 'Your usual price and how long it takes, in your own words. For example: 50 to 80 USDC, 3 days.';
const ROLES = { 'ws:sell': 'sell', 'ws:buy': 'buy', 'ws:both': 'both' } as const;

const text = (body: string): OutMessage => ({ kind: 'text', body });

export function createInterview<A extends ChatAccount>(deps: InterviewDeps) {
  const done = (account: A): A => ({ ...account, onboarding: { step: 'done' } });

  async function enter(account: A): Promise<OnboardingResult<A>> {
    return { account: { ...account, onboarding: { step: 'role' } }, out: [ROLE] };
  }

  async function handle(account: A, m: InboundMessage): Promise<OnboardingResult<A> | null> {
    const state = account.onboarding;
    if (!state || (state.step !== 'role' && state.step !== 'offer' && state.step !== 'price')) return null;
    const said = m.kind === 'text' ? (m.text ?? '').trim() : '';

    if (/^skip$/i.test(said)) {
      return { account: done(account), out: [text('No problem. Tell me any time what you sell or need.'), ...deps.afterwards] };
    }

    if (state.step === 'role') {
      const role = m.kind === 'button' ? ROLES[m.replyId as keyof typeof ROLES] : undefined;
      if (!role) return { account, out: [ROLE] };
      const ask = role === 'buy' ? 'What do you need? One sentence is enough.' : 'What do you sell? One sentence is enough.';
      return { account: { ...account, onboarding: { step: 'offer', role } }, out: [text(ask)] };
    }

    if (!said) return { account, out: [text(state.step === 'offer' ? 'One sentence is enough.' : PRICE)] };

    if (state.step === 'offer') {
      return { account: { ...account, onboarding: { ...state, step: 'price', offer: said } }, out: [text(PRICE)] };
    }

    const buying = state.role === 'buy';
    const handOff = buying
      ? `I need: ${state.offer}. My budget and timing: ${said}. Post this as my request.`
      : `I sell: ${state.offer}. Usually ${said}. Post this as my offer.`;
    return {
      account: done(account),
      out: [text(`Got it. Here's your ${buying ? 'request' : 'offer'} to check.`), ...deps.afterwards],
      handOff,
    };
  }

  return { enter, handle };
}
