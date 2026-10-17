import type { OutMessage } from '../../channels/render.js';
import type { InboundMessage } from '../../channels/types.js';
import type { TelegramAccount } from '../../db/telegramAccounts.js';
import { parseUpdate, type TgUpdate } from './parse.js';
import { resolveTap } from './render.js';
import { startPayload } from './routing.js';
import { withLinkedAccount } from './speaker.js';

export interface HandlerDeps {
  now: () => number;
  /// Claims an update id; false when it was handled before.
  claim: (updateId: number) => Promise<boolean>;
  answerCallback: (callbackId: string) => Promise<void>;
  /// The web account this chat was linked to from a profile, if any.
  linkedAddress: (chatId: number) => Promise<string | null>;
  getOrStart: (from: string) => Promise<TelegramAccount>;
  save: (account: TelegramAccount) => Promise<TelegramAccount>;
  dispatch: (m: InboundMessage) => Promise<void>;
  question: (requestId: string) => Promise<{ subjectName: string; job: string; month: string } | null>;
  send: (to: string, m: OutMessage) => Promise<unknown>;
  /// Takes a username away from every other account before this one saves it.
  claimUsername?: (numberHash: string, username: string) => Promise<void>;
}

/// One Telegram update for the agent. The bot has already handled its own
/// commands and the support relay; what reaches here is the person talking to
/// the agent, tapping a card, sending a file, or opening a confirmation link.
export function createTelegramHandler(deps: HandlerDeps) {
  return async function handle(update: TgUpdate): Promise<void> {
    const confirm = update.message?.text ? startPayload(update.message.text) : null;
    if (confirm?.kind === 'clientConfirm' && update.message?.from) {
      if (!(await deps.claim(update.update_id))) return;
      const to = `tg:${update.message.from.id}`;
      const q = await deps.question(confirm.requestId);
      await deps.send(
        to,
        q
          ? {
              kind: 'buttons',
              body: `Did ${q.subjectName} do this job for you: ${q.job}, around ${q.month}?\n\nYour answer goes on their Karwan record. It counts once you have passed the person check yourself.`,
              buttons: [
                { id: `cw:yes:${confirm.requestId}`, title: 'Yes' },
                { id: `cw:no:${confirm.requestId}`, title: 'No' },
              ],
            }
          : { kind: 'text', body: 'This confirmation was already answered or has closed.' },
      );
      return;
    }

    const parsed = parseUpdate(update);
    if (!parsed || !(await deps.claim(update.update_id))) return;
    if (parsed.callbackId) await deps.answerCallback(parsed.callbackId);

    let account = await deps.getOrStart(parsed.inbound.from);
    if (parsed.username !== (account.tgUsername ?? null)) {
      if (parsed.username && deps.claimUsername) await deps.claimUsername(account.numberHash, parsed.username);
      account = await deps.save({ ...account, tgUsername: parsed.username });
    }
    const linked = withLinkedAccount(account, await deps.linkedAddress(parsed.chatId), deps.now());
    if (linked) account = await deps.save(linked);

    let inbound = parsed.messageId !== null ? { ...parsed.inbound, messageRef: String(parsed.messageId) } : parsed.inbound;
    if (inbound.kind === 'button' && inbound.replyId) {
      const pending = Object.keys(account.pendingActions ?? {}).flatMap((id) => [`confirm:${id}`, `cancel:${id}`]);
      inbound = { ...inbound, replyId: resolveTap(inbound.replyId, pending) };
    }
    await deps.dispatch(inbound);
  };
}
