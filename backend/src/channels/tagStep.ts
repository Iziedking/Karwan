import type { KarwanTagCheck } from '../profile/karwanTag.js';
import type { OnboardingResult } from './onboarding.js';
import type { OutMessage } from './render.js';
import type { ChatAccount, InboundMessage } from './types.js';

/// Picking a Karwan tag in chat. The Telegram username is offered first when
/// it passes the tag rules and nobody has it; otherwise the person types one.

type WithUsername = ChatAccount & { tgUsername?: string | null };

export interface TagStepDeps<A extends WithUsername> {
  check: (raw: string) => KarwanTagCheck;
  available: (tag: string, address: string) => Promise<boolean>;
  /// Claims the tag for the account through the same route the website uses.
  signup: (address: string, tag: string) => Promise<{ ok: true } | { ok: false; code: string }>;
  /// What comes after the tag: the workspace interview.
  afterTag: (account: A) => Promise<OnboardingResult<A>>;
}

const PICK = 'Pick your Karwan tag. People find and pay you by it.';
const RULE = 'Tags are 3 to 20 letters, numbers or single underscores, starting with a letter.';
const TAKEN = 'That tag is taken. Try another.';

export function createTagStep<A extends WithUsername>(deps: TagStepDeps<A>) {
  async function suggest(tgUsername: string | null | undefined, address: string): Promise<string | null> {
    if (!tgUsername) return null;
    const check = deps.check(tgUsername);
    if (!check.ok) return null;
    return (await deps.available(check.tag, address)) ? check.tag : null;
  }

  async function prompt(account: A): Promise<OutMessage> {
    const suggestion = account.address ? await suggest(account.tgUsername, account.address) : null;
    if (!suggestion) return { kind: 'text', body: `${PICK} Type the tag you want.` };
    return { kind: 'buttons', body: PICK, buttons: [{ id: 'tag:take', title: `Use @${suggestion}` }] };
  }

  async function enter(account: A): Promise<OnboardingResult<A>> {
    const next = { ...account, onboarding: { step: 'tag' as const } };
    return { account: next, out: [await prompt(next)] };
  }

  async function claim(address: string, raw: string): Promise<{ ok: true; tag: string } | { ok: false; message: string }> {
    const check = deps.check(raw);
    if (!check.ok) return { ok: false, message: check.reason === 'reserved' ? TAKEN : RULE };
    if (!(await deps.available(check.tag, address))) return { ok: false, message: TAKEN };
    const r = await deps.signup(address, check.tag);
    if (r.ok) return { ok: true, tag: check.tag };
    return { ok: false, message: r.code === 'tag_taken' || r.code === 'reserved' ? TAKEN : "That didn't save. Try again in a minute." };
  }

  async function handle(account: A, m: InboundMessage): Promise<OnboardingResult<A> | null> {
    if (account.onboarding?.step !== 'tag' || !account.address) return null;
    const raw =
      m.kind === 'button' && m.replyId === 'tag:take'
        ? await suggest(account.tgUsername, account.address)
        : m.kind === 'text'
          ? (m.text ?? '').trim()
          : '';
    if (!raw) return { account, out: [await prompt(account)] };
    const result = await claim(account.address, raw);
    if (!result.ok) return { account, out: [{ kind: 'text', body: result.message }] };
    const next = await deps.afterTag(account);
    return { ...next, out: [{ kind: 'text', body: `Done. You're @${result.tag} on Karwan.` }, ...next.out] };
  }

  return { suggest, enter, claim, handle };
}
