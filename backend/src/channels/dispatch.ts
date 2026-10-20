import { isDeleteCommand } from '../accountDeletion/rules.js';
import type { AssistantAction, ConfirmAction } from '../assistant/actions.js';
import { renderTurn, type OutMessage } from './render.js';
import type { OnboardingResult } from './onboarding.js';
import { CARD_TTL_MS, type ChatAccount, type InboundMessage } from './types.js';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ChatResult =
  | { ok: true; reply: string; actions?: AssistantAction[] }
  | { ok: false; error: string; code?: string };

export type ExecuteResult =
  | { ok: true; summary: string; txHash?: string }
  | { ok: false; reason: 'reused' | 'stale' | 'refused'; message: string };

export interface DispatchDeps<A extends ChatAccount = ChatAccount> {
  now: () => number;
  webBase: string;
  explorerTx: (hash: string) => string;
  getOrStart: (from: string) => Promise<A>;
  acceptTerms: (numberHash: string) => Promise<A>;
  saveAccount: (a: A) => Promise<A>;
  send: (to: string, m: OutMessage) => Promise<{ sent: boolean }>;
  drain: (to: string) => Promise<void>;
  /// One assistant turn as the account, through the same route the app uses.
  chat: (address: string, messages: ChatMessage[]) => Promise<ChatResult>;
  executeConfirm: (account: { address: string }, action: ConfirmAction) => Promise<ExecuteResult>;
  /// A past client's Yes or No to a work confirmation. The client may have no
  /// Karwan account, so this runs before anything else. Returns the reply.
  clientAnswer: (requestId: string, from: string, yes: boolean) => Promise<string>;
  /// A photo or document from an account: evidence intake.
  media: (account: A, m: InboundMessage) => Promise<OutMessage[]>;
  /// How a channel shows a confirm card instead of Confirm and Cancel buttons.
  /// A message returned here is sent as is and the card is not kept, so no
  /// chat tap can confirm it. Used for steps that move money.
  presentConfirm?: (address: string, action: ConfirmAction) => Promise<OutMessage | null>;
  /// The account's own money controls: the check after a long silence, and
  /// the Pause and Remove buttons. A tap it does not know returns null.
  moneyOut?: {
    noteReturn: (address: string, previousAt: number | null) => Promise<OutMessage | null>;
    tap: (address: string, replyId: string) => Promise<OutMessage | null>;
  };
  /// One line a channel adds to the first message after someone joins.
  joinedTip?: string;
  /// Saves the person's answer to the two reputation questions asked after
  /// they join: may agents check their record, may their agent look them up
  /// on platforms they connect.
  consent?: (address: string, patch: { outsideReadable?: boolean; sourceLookup?: boolean }) => Promise<void>;
  /// Deleting the account: the /delete command and its buttons. Answered
  /// before the model runs, so a deletion never depends on it.
  deletion?: {
    command: (address: string) => Promise<OutMessage>;
    tap: (address: string, replyId: string) => Promise<OutMessage | null>;
  };
  /// Signing in or up from the chat. When it takes a message, nothing else
  /// below runs for it, unless it asks to pass the message through.
  onboarding?: { handle: (account: A, m: InboundMessage) => Promise<OnboardingResult<A> | null> };
  /// Where people can be found by their chat username: the question asked
  /// after the lookup one, and once to anyone who never answered it.
  findable?: OutMessage;
}

const HISTORY_MAX = 20;
const ACCEPT_ID = 'terms:accept';

const text = (body: string): OutMessage => ({ kind: 'text', body });

/// The first of the questions asked after someone joins.
export const READABLE_ASK: OutMessage = {
  kind: 'buttons',
  body: 'Agents from other apps can check your Karwan record too, if you allow it. Agents in the Karwan market already can when you post a request or an offer. Each check is paid and logged, and they never see your messages or who you worked with. Allow agents from other apps?',
  buttons: [
    { id: 'rc:readable:yes', title: 'Yes' },
    { id: 'rc:readable:no', title: 'Not now' },
  ],
};

const LOOKUP_ASK: OutMessage = {
  kind: 'buttons',
  body: 'May I look you up on platforms you connect later? I pay a few cents per read and nothing is shared with people.',
  buttons: [
    { id: 'rc:lookup:yes', title: 'Yes' },
    { id: 'rc:lookup:no', title: 'Not now' },
  ],
};

export function createDispatcher<A extends ChatAccount>(deps: DispatchDeps<A>) {
  const acceptButton = (body: string): OutMessage => ({
    kind: 'buttons',
    body,
    buttons: [{ id: ACCEPT_ID, title: 'Accept' }],
  });

  const welcome = () =>
    acceptButton(
      "Hi, I'm the Karwan agent. I find customers and suppliers for you, check who they are, and keep your money in escrow until the work is done.\n\n" +
        `This is a free beta. Please read the terms first: ${deps.webBase}/terms/chat`,
    );

  return async function dispatch(m: InboundMessage): Promise<void> {
    const work = /^cw:(yes|no):(.+)$/.exec(m.replyId ?? '');
    if (work) {
      const answer = await deps.clientAnswer(work[2]!, m.from, work[1] === 'yes');
      await deps.send(m.from, text(answer));
      return;
    }

    const first = await deps.getOrStart(m.from);
    await deps.saveAccount({ ...first, lastInboundAt: deps.now() });
    await deps.drain(first.to);
    // Draining rewrites the stored queue; read again so nothing below writes
    // the drained messages back.
    let account = await deps.getOrStart(m.from);
    const reply = (msg: OutMessage) => deps.send(account.to, msg);

    let handOff: string | undefined;
    if (deps.onboarding) {
      const ob = await deps.onboarding.handle(account, m);
      if (ob) {
        account = await deps.saveAccount(ob.account);
        for (const out of ob.out) await reply(out);
        if (!ob.passThrough && !ob.handOff) return;
        handOff = ob.handOff;
      }
      if (!account.address || !account.activated) return;
    }

    if (!account.address || !account.activated) {
      if (m.replyId !== ACCEPT_ID) {
        await reply(welcome());
        return;
      }
      try {
        account = await deps.acceptTerms(account.numberHash);
      } catch {
        await reply(acceptButton("Setting up your account didn't finish. Tap Accept again in a minute."));
        return;
      }
      const joined = "You're in. Tell me what you sell or buy, and where you work. Then I'll help you get verified so other agents can find you.";
      await reply(text(deps.joinedTip ? `${joined}\n\n${deps.joinedTip}` : joined));
      if (deps.consent) await reply(READABLE_ASK);
      return;
    }
    const address = account.address;

    const findableTap = /^rc:findable:(yes|no)$/.exec(m.replyId ?? '');
    if (findableTap && deps.findable) {
      account = await deps.saveAccount({ ...account, findable: findableTap[1] === 'yes', findableAsked: true });
      await reply(text('Saved. You can change this any time by telling me.'));
      return;
    }

    const consentTap = /^rc:(readable|lookup):(yes|no)$/.exec(m.replyId ?? '');
    if (consentTap && deps.consent) {
      const yes = consentTap[2] === 'yes';
      try {
        await deps.consent(address, consentTap[1] === 'readable' ? { outsideReadable: yes } : { sourceLookup: yes });
      } catch {
        await reply(text("That didn't save. Tap your answer again in a minute."));
        return;
      }
      if (consentTap[1] === 'lookup' && deps.findable) {
        account = await deps.saveAccount({ ...account, findableAsked: true });
        await reply(deps.findable);
        return;
      }
      await reply(consentTap[1] === 'readable' ? LOOKUP_ASK : text('Saved. You can change this any time in Profile.'));
      return;
    }

    if (deps.findable && !account.findableAsked && !m.replyId) {
      account = await deps.saveAccount({ ...account, findableAsked: true });
      await reply(deps.findable);
    }

    if (deps.deletion) {
      const answer = m.replyId
        ? await deps.deletion.tap(address, m.replyId)
        : isDeleteCommand(m.text)
          ? await deps.deletion.command(address)
          : null;
      if (answer) {
        await reply(answer);
        return;
      }
    }

    if (m.replyId && deps.moneyOut) {
      const answer = await deps.moneyOut.tap(address, m.replyId);
      if (answer) {
        await reply(answer);
        return;
      }
    }
    const back = await deps.moneyOut?.noteReturn(address, first.lastInboundAt);
    if (back) await reply(back);

    if (m.replyId?.startsWith('confirm:') || m.replyId?.startsWith('cancel:')) {
      const [verb, ...rest] = m.replyId.split(':');
      const id = rest.join(':');
      const pending = account.pendingActions?.[id];
      const remaining = { ...(account.pendingActions ?? {}) };
      delete remaining[id];
      account = await deps.saveAccount({ ...account, pendingActions: remaining });

      if (!pending || pending.expiresAt < deps.now()) {
        await reply(text("That step has expired or is already done. Ask me again and I'll prepare it fresh."));
        return;
      }
      if (verb === 'cancel') {
        await reply(text('Cancelled. Nothing was done.'));
        return;
      }
      const result = await deps.executeConfirm({ address }, pending.action);
      if (result.ok) {
        const proof = result.txHash ? `\n\nProof on Arc: ${deps.explorerTx(result.txHash)}` : '';
        await reply(text(`${result.summary}${proof}`));
      } else {
        await reply(text(result.message));
      }
      return;
    }

    if (m.kind === 'media') {
      for (const out of await deps.media(account, m)) await reply(out);
      return;
    }

    if (m.kind === 'other') {
      await reply(text("I can't listen to voice notes yet. Please type it."));
      return;
    }

    const said = handOff ?? m.text?.trim();
    if (!said) return;

    const history: ChatMessage[] = [...(account.history ?? []), { role: 'user' as const, content: said }].slice(-HISTORY_MAX);
    const result = await deps.chat(address, history);
    if (!result.ok) {
      const userFacing = result.code === 'assistant_quota_exhausted' ? result.error : "I couldn't check that just now. Try again in a minute.";
      await deps.saveAccount({ ...account, history });
      await reply(text(userFacing));
      return;
    }

    const kept: AssistantAction[] = [];
    const elsewhere: OutMessage[] = [];
    for (const a of result.actions ?? []) {
      const shown = a.kind === 'confirm' && deps.presentConfirm ? await deps.presentConfirm(address, a) : null;
      if (shown) elsewhere.push(shown);
      else kept.push(a);
    }
    const pendingActions = { ...(account.pendingActions ?? {}) };
    for (const a of kept) {
      if (a.kind === 'confirm') pendingActions[a.id] = { action: a, expiresAt: deps.now() + CARD_TTL_MS };
    }
    // Notes Karwan wrote into the chat while the turn ran (an alert, a
    // question) are kept, after the reply.
    const before = account.history ?? [];
    const fresh = await deps.getOrStart(m.from).catch(() => account);
    const arrived = (fresh.history ?? []).filter((h) => !before.some((b) => b.role === h.role && b.content === h.content));
    await deps.saveAccount({
      ...account,
      history: [...history, { role: 'assistant' as const, content: result.reply }, ...arrived].slice(-HISTORY_MAX),
      pendingActions,
    });
    for (const out of renderTurn(result.reply, kept, deps.webBase)) await reply(out);
    for (const out of elsewhere) await reply(out);
  };
}
