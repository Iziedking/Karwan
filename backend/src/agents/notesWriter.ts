import { logger } from '../logger.js';
import type { RequestNotesStore } from '../db/requestNotes.js';
import type { RequestNotes } from './requestNotes.js';

export interface NotesTarget {
  jobId: string;
  notesVersion: number;
}

/// One writer per request (view 48, decision 8). Writes for a request run one
/// at a time and in order; a write always takes the request's latest notes, so
/// changes that pile up while one write runs land together in the next.
export class NotesWriter<T extends NotesTarget> {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly asked = new Map<string, number>();
  private readonly written = new Map<string, number>();

  constructor(
    private readonly store: () => RequestNotesStore,
    private readonly notesOf: (target: T) => RequestNotes,
    private readonly clock: () => number = Date.now,
  ) {}

  /// A change that does not need to wait: the write is queued and a failure is
  /// logged; the next change or the next `confirmed` retries it.
  changed(target: T): void {
    void this.confirmed(target).catch((err) => {
      logger.warn({ jobId: target.jobId, err: (err as Error).message }, 'request notes write failed');
    });
  }

  /// Resolves once a write covering every change so far has landed. The agent
  /// awaits this before it acts outside itself.
  confirmed(target: T): Promise<void> {
    const key = target.jobId.toLowerCase();
    const mine = (this.asked.get(key) ?? 0) + 1;
    this.asked.set(key, mine);
    const previous = this.chains.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        if ((this.written.get(key) ?? 0) >= mine) return;
        const covers = this.asked.get(key) ?? mine;
        const version = await this.store().save(target.jobId, target.notesVersion, this.notesOf(target), this.clock());
        target.notesVersion = version;
        this.written.set(key, covers);
      });
    this.chains.set(key, next);
    void next.finally(() => {
      if (this.chains.get(key) === next) this.chains.delete(key);
    }).catch(() => undefined);
    return next;
  }

  /// Forget a request the agent no longer holds.
  forget(jobId: string): void {
    const key = jobId.toLowerCase();
    this.asked.delete(key);
    this.written.delete(key);
  }
}
