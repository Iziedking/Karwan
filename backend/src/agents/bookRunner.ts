import { counterSent, type Book, type BookAction } from './negotiationBook.js';
import type { PendingCounter } from './requestNotes.js';

/// Carries out what the negotiation book decided (view 73, task 8). Counters
/// are stored before any is sent, each goes out on its own, and one seller's
/// failure or silence never holds up another's negotiation.

export interface BookDeps {
  /// Store the request's notes, with the book as it now stands.
  persist(): Promise<void>;
  send(counter: PendingCounter, betterOffer: boolean): Promise<void>;
  agree(seller: string, priceUsdc: string): Promise<void>;
  ask(seller: string, priceUsdc: string, gapUsdc: string): Promise<void>;
  end(seller: string, reason: string): Promise<void>;
  armWait(seller: string, dueAt: number): void;
  clearWait(seller: string): void;
  warn(seller: string, err: Error): void;
}

export async function runBook(book: Book, actions: BookAction[], deps: BookDeps): Promise<void> {
  if (!actions.length) return;
  await deps.persist();
  for (const a of actions) {
    try {
      switch (a.kind) {
        case 'counter': {
          await deps.send(a.counter, a.betterOffer);
          counterSent(book, a.seller, a.counter.key);
          const due = book.get(a.seller.toLowerCase())?.watchdogDueAt;
          if (due) deps.armWait(a.seller, due);
          break;
        }
        case 'agree':
          deps.clearWait(a.seller);
          await deps.agree(a.seller, a.priceUsdc);
          break;
        case 'ask-person':
          deps.clearWait(a.seller);
          await deps.ask(a.seller, a.priceUsdc, a.gapUsdc);
          break;
        case 'end':
          deps.clearWait(a.seller);
          await deps.end(a.seller, a.reason);
          break;
      }
    } catch (err) {
      deps.warn(a.seller, err as Error);
      const n = book.get(a.seller.toLowerCase());
      if (a.kind === 'counter' && n) {
        n.state = 'ended';
        n.pending = null;
        n.watchdogDueAt = null;
        await deps.end(a.seller, 'counter-not-sent').catch((e: Error) => deps.warn(a.seller, e));
      }
    }
  }
  await deps.persist();
}
