import type { OutMessage } from '../channels/render.js';
import { utc } from '../moneyOut/messages.js';
import { NULLIFIER_KEEP_MS, WAIT_MS, refusalFor, type Standing } from './rules.js';
import type { DeletionRecord, DeletionRequest, DeletionStore } from './store.js';

/// Chat buttons. None of them moves money, so they are allowed in chat.
const YES = 'del:yes:';
const NO = 'del:no';
const CANCEL = 'del:cancel';
const CARD_TTL_MS = 30 * 60_000;

/// The stores of one account, each delete safe to run again.
export interface Eraser {
  /// The Circle wallets left behind, read before the wallet rows go.
  walletIds: (address: string) => Promise<string[]>;
  /// Withdraws every fact, so the publisher revokes the written ones on Arc.
  revokeFacts: (address: string) => Promise<void>;
  /// True when every fact written to Arc shows its revoke there.
  factsSettled: (address: string) => Promise<boolean>;
  dropFacts: (address: string) => Promise<void>;
  stores: { name: string; run: (address: string) => Promise<void> }[];
  /// The chat account, its link and its counters. Runs after the last message.
  dropChatAccount: (address: string) => Promise<void>;
  /// The World ID hash, once it has been kept long enough.
  releaseNullifiers: (address: string) => Promise<void>;
}

export interface DeletionDeps {
  now: () => number;
  newId: () => string;
  store: DeletionStore;
  /// The chat account at this address, or null for a web account, including
  /// a web account that linked this chat.
  chatAccount: (address: string) => Promise<{ channel: string } | null>;
  standing: (address: string) => Promise<Standing>;
  tell: (address: string, m: OutMessage) => Promise<void>;
  erase: Eraser;
  warn?: (message: string, data: Record<string, unknown>) => void;
}

const KEPT = [
  'deals, payments and deal messages, which are also the other party’s record',
  'the World ID hash, for 12 months',
  'the empty Circle wallets',
];

const text = (body: string): OutMessage => ({ kind: 'text', body });
const KEEP_BUTTON = { id: CANCEL, title: 'Keep my account' };

const CARD =
  '*Delete your Karwan account?*\n\n' +
  'Deleted: your profile and tag, my copy of our chats, your verified facts (also revoked on Arc), your saved addresses and your activity.\n\n' +
  'Kept: your deals and payments, because they are also the other party’s record. They hold wallet addresses and amounts, not your name. The one-way hash of your World ID is kept 12 months, then deleted.\n\n' +
  'The deletion runs 7 days after you confirm, and you can cancel until then. After that it cannot be undone.';

const LINKED = 'This chat is linked to an account made on karwan.site. Ask for its deletion through support on karwan.site.';

function waiting(r: DeletionRequest): OutMessage {
  if (r.state === 'erasing') return text('Your account is being deleted now.');
  return {
    kind: 'buttons',
    body: `Your account will be deleted on ${utc(r.dueAt)}. Until then everything works as usual, and you can cancel.`,
    buttons: [KEEP_BUTTON],
  };
}

export function createAccountDeletion(deps: DeletionDeps) {
  const { store, erase } = deps;
  const warn = deps.warn ?? (() => {});

  async function command(address: string): Promise<OutMessage> {
    if (!(await deps.chatAccount(address))) return text(LINKED);
    const open = await store.open(address);
    if (open) return waiting(open);
    const refusal = refusalFor(await deps.standing(address));
    if (refusal) return text(refusal.message);
    return {
      kind: 'buttons',
      body: CARD,
      buttons: [
        { id: `${YES}${deps.now()}`, title: 'Delete my account' },
        { id: NO, title: 'Keep it' },
      ],
    };
  }

  async function schedule(address: string, via: 'chat' | 'admin') {
    const account = await deps.chatAccount(address);
    if (!account) return { ok: false as const, message: LINKED };
    const open = await store.open(address);
    if (open) return { ok: false as const, message: 'A deletion is already waiting.', open };
    const refusal = refusalFor(await deps.standing(address));
    if (refusal) return { ok: false as const, message: refusal.message };
    const now = deps.now();
    const r = await store.schedule({
      id: deps.newId(),
      address,
      channel: account.channel,
      requestedVia: via,
      requestedAt: now,
      dueAt: now + WAIT_MS,
    });
    if (!r) return { ok: false as const, message: 'A deletion is already waiting.', open: await store.open(address) };
    return { ok: true as const, request: r };
  }

  async function confirm(address: string, issuedAt: number): Promise<OutMessage> {
    if (!(await deps.chatAccount(address))) return text(LINKED);
    if (!(deps.now() - issuedAt <= CARD_TTL_MS && issuedAt <= deps.now())) {
      return text('That button has expired. Send /delete to start again.');
    }
    const r = await schedule(address, 'chat');
    if (r.ok) return waiting(r.request);
    return 'open' in r && r.open ? waiting(r.open) : text(r.message);
  }

  async function cancel(address: string): Promise<OutMessage> {
    const open = await store.open(address);
    if (!open) return text('There is no deletion to cancel.');
    if (open.state !== 'scheduled') return waiting(open);
    const moved = await store.move(open.id, 'scheduled', { state: 'cancelled', closedAt: deps.now() });
    return moved ? text('Cancelled. Your account stays.') : waiting((await store.get(open.id))!);
  }

  async function tap(address: string, replyId: string): Promise<OutMessage | null> {
    if (replyId.startsWith(YES)) return confirm(address, Number(replyId.slice(YES.length)));
    if (replyId === NO) return text('OK. Nothing changes.');
    if (replyId === CANCEL) return cancel(address);
    return null;
  }

  /// For a person who asked by email or on karwan.site. They are told in chat
  /// and can cancel there; the same wait applies.
  async function requestByAdmin(address: string) {
    const r = await schedule(address.toLowerCase(), 'admin');
    if (!r.ok) return { ok: false as const, message: r.message };
    await deps.tell(r.request.address, {
      kind: 'buttons',
      body: `Karwan received a request to delete your account. It will be deleted on ${utc(r.request.dueAt)}. If you did not ask for this, tap Keep my account.`,
      buttons: [KEEP_BUTTON],
    });
    return { ok: true as const, request: r.request };
  }

  async function refuseByAdmin(id: string, reason: string): Promise<boolean> {
    const r = await store.get(id);
    if (!r || !(await store.move(id, 'scheduled', { state: 'refused', closedAt: deps.now(), reason }))) return false;
    await deps.tell(r.address, text(`Your account deletion was stopped. ${reason}`));
    return true;
  }

  async function begin(r: DeletionRequest): Promise<DeletionRequest | null> {
    const refusal = refusalFor(await deps.standing(r.address));
    if (refusal?.code === 'unreadable') return null;
    if (refusal) {
      if (await store.move(r.id, 'scheduled', { state: 'refused', closedAt: deps.now(), reason: refusal.code })) {
        await deps.tell(r.address, text(`Your account was not deleted. ${refusal.message}`));
      }
      return null;
    }
    const record: DeletionRecord = { removed: [], kept: KEPT, walletIds: await erase.walletIds(r.address) };
    if (!(await store.move(r.id, 'scheduled', { state: 'erasing', record }))) return null;
    return { ...r, state: 'erasing', record };
  }

  async function finish(r: DeletionRequest): Promise<void> {
    await erase.revokeFacts(r.address);
    for (const s of erase.stores) await s.run(r.address);
    const record: DeletionRecord = {
      ...r.record,
      removed: ['facts', ...erase.stores.map((s) => s.name), 'chat account'],
    };
    if (record.toldAt === undefined) {
      await deps.tell(r.address, text('Your Karwan account is deleted.')).catch((err: Error) => {
        warn('account deletion: last message not sent', { id: r.id, err: err.message });
      });
      record.toldAt = deps.now();
      await store.setRecord(r.id, record);
    }
    await erase.dropChatAccount(r.address);
    await store.setRecord(r.id, record);
    if (!(await erase.factsSettled(r.address))) return;
    await erase.dropFacts(r.address);
    const now = deps.now();
    await store.move(r.id, 'erasing', { state: 'done', closedAt: now, nullifiersUntil: now + NULLIFIER_KEEP_MS, record });
  }

  /// Runs the deletions whose wait has ended, finishes any left half done,
  /// and releases World ID hashes kept long enough. Safe to run again.
  async function sweep(): Promise<number> {
    let worked = 0;
    for (const due of await store.due(deps.now())) {
      try {
        const r = due.state === 'scheduled' ? await begin(due) : due;
        if (!r) continue;
        await finish(r);
        worked++;
      } catch (err) {
        warn('account deletion: step failed, retried next sweep', { id: due.id, err: (err as Error).message });
      }
    }
    for (const r of await store.nullifiersDue(deps.now())) {
      try {
        await erase.releaseNullifiers(r.address);
        await store.markNullifiersReleased(r.id, deps.now());
        worked++;
      } catch (err) {
        warn('account deletion: World ID hash not released, retried next sweep', { id: r.id, err: (err as Error).message });
      }
    }
    return worked;
  }

  return { command, tap, requestByAdmin, refuseByAdmin, sweep, list: (limit: number) => store.list(limit) };
}

export type AccountDeletion = ReturnType<typeof createAccountDeletion>;
