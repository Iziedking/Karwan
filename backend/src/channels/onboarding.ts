import { normalizeEmail, type EmailCodeCheck } from '../auth/otpStore.js';
import type { OutMessage } from './render.js';
import type { ChatAccount, InboundMessage, OnboardingState } from './types.js';

/// Signing in or up from a chat, before the agent takes over. Someone picks
/// "I have a Karwan account" or "I'm new", proves an email with a 6-digit
/// code (or signs in with a wallet on Karwan and connects Telegram there), accepts the
/// terms when new, then picks a tag. The same account as the website: the
/// email is the account.

/// other_chat: the account is already linked to another Telegram.
/// passkey: the email signs in with a passkey on the website, which the chat cannot use.
export type JoinKind = 'joined' | 'new' | 'not_invited' | 'email_taken' | 'other_chat' | 'passkey';

export interface EmailAccounts<A extends ChatAccount> {
  joinOrCreate: (email: string, account: A) => Promise<{ kind: JoinKind; account: A }>;
  create: (email: string, account: A) => Promise<A>;
}

export interface OnboardingResult<A extends ChatAccount> {
  account: A;
  out: OutMessage[];
  /// The person's own words, run as one assistant turn after `out` is sent.
  handOff?: string;
  /// Send `out`, then carry on with the message as usual.
  passThrough?: boolean;
}

export interface OnboardingDeps<A extends ChatAccount> {
  webBase: string;
  /// False when the email has had too many codes and must wait.
  sendCode: (email: string) => Promise<boolean>;
  checkCode: (email: string, code: string) => EmailCodeCheck;
  emailAccounts: EmailAccounts<A>;
  tagOf: (address: string) => Promise<string | null>;
  /// The account's email is a chat placeholder, so the website cannot sign it in.
  placeholderEmail: (address: string) => Promise<boolean>;
  /// Moves to the tag step and says what to do there.
  enterTag: (account: A) => Promise<OnboardingResult<A>>;
  /// Steps after the tag (the workspace interview); null when the step is not theirs.
  later?: (account: A, m: InboundMessage) => Promise<OnboardingResult<A> | null>;
  deleteMessage: (m: InboundMessage) => Promise<void>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^\d(?:\s*\d){5}$/;
const LIMITED = 'Too many codes for this email. Wait 10 minutes and try again.';

const text = (body: string): OutMessage => ({ kind: 'text', body });

const CHOOSE: OutMessage = {
  kind: 'buttons',
  body: "Hi, I'm the Karwan agent. I find customers and suppliers, check who they are, and hold the money in escrow until the work is done.",
  buttons: [
    { id: 'ob:have', title: 'I have a Karwan account' },
    { id: 'ob:new', title: "I'm new" },
  ],
};

const HAVE: OutMessage = {
  kind: 'buttons',
  body: 'How do you sign in to Karwan?',
  buttons: [
    { id: 'ob:email', title: 'With my email' },
    { id: 'ob:wallet', title: 'With a wallet' },
  ],
};

const ASK_EMAIL = text("What's your email? I'll send you a 6-digit code.");

const ADD_EMAIL: OutMessage = {
  kind: 'buttons',
  body: 'Add your email so you can also sign in on the website.',
  buttons: [{ id: 'ob:addemail', title: 'Add email' }],
};

const codeSent = (email: string): OutMessage => ({
  kind: 'buttons',
  body: `I sent a code to ${email}. Type it here.`,
  buttons: [{ id: 'ob:restart', title: 'Use another email' }],
});

export function createOnboarding<A extends ChatAccount>(deps: OnboardingDeps<A>) {
  const at = (account: A, state: OnboardingState): A => ({ ...account, onboarding: state });
  const isFinished = (a: A) =>
    a.onboarding ? a.onboarding.step === 'done' : !!(a.address && a.activated);
  /// Back to done for an account that already works, otherwise to the start.
  const settle = (a: A): OnboardingState => (a.address && a.activated ? { step: 'done' } : { step: 'choose' });

  async function finishOrTag(account: A): Promise<OnboardingResult<A>> {
    const tag = account.address ? await deps.tagOf(account.address) : null;
    if (!tag) return deps.enterTag(account);
    return {
      account: at(account, { step: 'done' }),
      out: [text(`You're in, @${tag}. Ask me anything, or tell me what you want to do.`)],
    };
  }

  async function onCode(account: A, state: OnboardingState, m: InboundMessage): Promise<OnboardingResult<A>> {
    await deps.deleteMessage(m);
    const email = state.email!;
    const check = deps.checkCode(email, m.text ?? '');
    if (check === 'wrong') return { account, out: [text("That code didn't match. Try again.")] };
    if (check === 'locked') {
      return { account, out: [{ kind: 'buttons', body: 'Too many tries. Tap Use another email, or wait 10 minutes.', buttons: [{ id: 'ob:restart', title: 'Use another email' }] }] };
    }
    if (check === 'expired' || check === 'none') {
      if (!(await deps.sendCode(email))) return { account, out: [text(LIMITED)] };
      return { account, out: [text("That code expired. I've sent a new one.")] };
    }

    const joined = await deps.emailAccounts.joinOrCreate(email, account);
    if (joined.kind === 'joined') return finishOrTag(joined.account);
    if (joined.kind === 'new') {
      return {
        account: at(joined.account, { step: 'terms', mode: 'new', email }),
        out: [{
          kind: 'buttons',
          body: `This is a free beta. Please read the terms first: ${deps.webBase}/terms/chat`,
          buttons: [{ id: 'ob:terms', title: 'Accept' }],
        }],
      };
    }
    if (joined.kind === 'other_chat') {
      return {
        account: at(joined.account, settle(joined.account)),
        out: [text('That Karwan account is already linked to another Telegram. Unlink it in your profile on karwan.site, then try again.')],
      };
    }
    if (joined.kind === 'passkey') {
      return {
        account: at(joined.account, settle(joined.account)),
        out: [{ kind: 'link', body: 'That email signs in to Karwan with a passkey. Sign in on Karwan, then tap Connect Telegram.', label: 'Open Karwan', url: `${deps.webBase}/connect/telegram` }],
      };
    }
    if (joined.kind === 'not_invited') {
      return {
        account: at(joined.account, { step: 'choose' }),
        out: [text("Karwan is invite-only on mainnet for now. You're on the waitlist and we'll email you.")],
      };
    }
    return {
      account: at(joined.account, settle(joined.account)),
      out: [text('That email already has a Karwan account. Use another email.')],
    };
  }

  async function handle(account: A, m: InboundMessage): Promise<OnboardingResult<A> | null> {
    const said = m.kind === 'text' ? (m.text ?? '').trim() : '';
    const tapped = m.kind === 'button' ? m.replyId ?? '' : '';

    if (isFinished(account)) {
      if (said === '/start') {
        const tag = account.address ? await deps.tagOf(account.address) : null;
        return { account, out: [text(tag ? `Welcome back, @${tag}. What do you want to do?` : 'Welcome back. What do you want to do?')] };
      }
      if (tapped === 'ob:addemail') return { account: at(account, { step: 'email', mode: 'have' }), out: [ASK_EMAIL] };
      if (tapped.startsWith('ob:')) return { account, out: [] };
      if (!account.emailAsked && account.address && (await deps.placeholderEmail(account.address))) {
        return { account: { ...account, emailAsked: true }, out: [ADD_EMAIL], passThrough: true };
      }
      return null;
    }

    const state = account.onboarding;
    // An account that already works goes back to the agent, never to the start.
    if (said === '/start' && account.address && account.activated) {
      return { account: at(account, { step: 'done' }), out: [text('Welcome back. What do you want to do?')] };
    }
    if (!state || said === '/start' || tapped === 'ob:restart') {
      if (tapped === 'ob:restart' && state?.mode === 'have' && account.address && account.activated) {
        return { account: at(account, { step: 'email', mode: 'have' }), out: [ASK_EMAIL] };
      }
      return { account: at(account, { step: 'choose' }), out: [CHOOSE] };
    }

    switch (state.step) {
      case 'choose':
        if (tapped === 'ob:new') return { account: at(account, { step: 'email', mode: 'new' }), out: [ASK_EMAIL] };
        if (tapped === 'ob:have') return { account: at(account, { step: 'have' }), out: [HAVE] };
        return { account, out: [CHOOSE] };
      case 'have':
        if (tapped === 'ob:email') return { account: at(account, { step: 'email', mode: 'have' }), out: [ASK_EMAIL] };
        if (tapped === 'ob:wallet') {
          // The link is started by the wallet owner on Karwan, so nobody can
          // send someone else a page that links a chat to their wallet.
          return {
            account,
            out: [{ kind: 'link', body: 'Sign in on Karwan with your wallet, then tap Connect Telegram. It opens this chat and links it.', label: 'Open Karwan', url: `${deps.webBase}/connect/telegram` }],
          };
        }
        return { account, out: [HAVE] };
      case 'email': {
        if (!EMAIL.test(said)) return { account, out: [text("That doesn't look like an email. Try again.")] };
        const email = normalizeEmail(said);
        if (!(await deps.sendCode(email))) return { account, out: [text(LIMITED)] };
        return { account: at(account, { ...state, step: 'code', email }), out: [codeSent(email)] };
      }
      case 'code':
        // Only something shaped like a code counts as a guess.
        if (!CODE.test(said)) return { account, out: [text('Type the 6-digit code from the email.'), codeSent(state.email!)] };
        return onCode(account, state, m);
      case 'terms': {
        if (tapped !== 'ob:terms') return { account, out: [{ kind: 'buttons', body: `Please read the terms first: ${deps.webBase}/terms/chat`, buttons: [{ id: 'ob:terms', title: 'Accept' }] }] };
        let created: A;
        try {
          created = await deps.emailAccounts.create(state.email!, account);
        } catch {
          return { account, out: [{ kind: 'buttons', body: "Setting up your account didn't finish. Tap Accept again in a minute.", buttons: [{ id: 'ob:terms', title: 'Accept' }] }] };
        }
        return deps.enterTag(created);
      }
      default: {
        const later = deps.later ? await deps.later(account, m) : null;
        return later ?? { account: at(account, settle(account)), out: [] };
      }
    }
  }

  return { handle };
}
