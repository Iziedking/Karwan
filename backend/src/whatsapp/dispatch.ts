import type { AssistantAction, ConfirmAction } from '../assistant/actions.js';
import type { WhatsappAccount } from '../db/whatsapp.js';
import { renderTurn, type OutMessage } from './render.js';
import type { InboundMessage } from './types.js';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ChatResult =
  | { ok: true; reply: string; actions?: AssistantAction[] }
  | { ok: false; error: string; code?: string };

export type ExecuteResult =
  | { ok: true; summary: string; txHash?: string }
  | { ok: false; reason: 'reused' | 'stale' | 'refused'; message: string };

export interface DispatchDeps {
  now: () => number;
  webBase: string;
  explorerTx: (hash: string) => string;
  getOrStart: (from: string) => Promise<WhatsappAccount>;
  acceptTerms: (numberHash: string) => Promise<WhatsappAccount>;
  saveAccount: (a: WhatsappAccount) => Promise<WhatsappAccount>;
  send: (to: string, m: OutMessage) => Promise<{ sent: boolean }>;
  drain: (to: string) => Promise<void>;
  /// One assistant turn as the account, through the same route the app uses.
  chat: (address: string, messages: ChatMessage[]) => Promise<ChatResult>;
  executeConfirm: (account: { address: string }, action: ConfirmAction) => Promise<ExecuteResult>;
  /// A past client's Yes or No to a work confirmation. The client may have no
  /// Karwan account, so this runs before anything else. Returns the reply.
  clientAnswer: (requestId: string, from: string, yes: boolean) => Promise<string>;
  /// A photo or document from an account: evidence intake.
  media: (account: WhatsappAccount, m: InboundMessage) => Promise<OutMessage[]>;
}

const HISTORY_MAX = 20;
const CARD_TTL_MS = 30 * 60_000;
const ACCEPT_ID = 'terms:accept';

const text = (body: string): OutMessage => ({ kind: 'text', body });

export function createDispatcher(deps: DispatchDeps) {
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
      await reply(
        text("You're in. Tell me what you sell or buy, and where you work. Then I'll help you get verified so other agents can find you."),
      );
      return;
    }
    const address = account.address;

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

    const said = m.text?.trim();
    if (!said) return;

    const history: ChatMessage[] = [...(account.history ?? []), { role: 'user' as const, content: said }].slice(-HISTORY_MAX);
    const result = await deps.chat(address, history);
    if (!result.ok) {
      const userFacing = result.code === 'assistant_quota_exhausted' ? result.error : "I couldn't check that just now. Try again in a minute.";
      await deps.saveAccount({ ...account, history });
      await reply(text(userFacing));
      return;
    }

    const pendingActions = { ...(account.pendingActions ?? {}) };
    for (const a of result.actions ?? []) {
      if (a.kind === 'confirm') pendingActions[a.id] = { action: a, expiresAt: deps.now() + CARD_TTL_MS };
    }
    await deps.saveAccount({
      ...account,
      history: [...history, { role: 'assistant' as const, content: result.reply }].slice(-HISTORY_MAX),
      pendingActions,
    });
    for (const out of renderTurn(result.reply, result.actions, deps.webBase)) await reply(out);
  };
}
