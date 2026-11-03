import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryRequestNotesStore,
  RequestNotesConflictError,
  type RequestNotesStore,
} from '../db/requestNotes.js';
import { NotesWriter } from './notesWriter.js';
import type { RequestNotes } from './requestNotes.js';

interface Fake {
  jobId: string;
  notesVersion: number;
  rounds: number;
}

const notesOf = (f: Fake) => ({ rounds: f.rounds }) as unknown as RequestNotes;

class CountingStore implements RequestNotesStore {
  readonly inner = new InMemoryRequestNotesStore();
  writes: number[] = [];
  failNext = 0;
  async get(jobId: string) {
    return this.inner.get(jobId);
  }
  async save(jobId: string, expected: number, notes: RequestNotes, now: number) {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('database down');
    }
    this.writes.push((notes as unknown as { rounds: number }).rounds);
    return this.inner.save(jobId, expected, notes, now);
  }
}

test('the store writes a new request, then only at the version it was read at', async () => {
  const store = new InMemoryRequestNotesStore();
  const notes = { a: 1 } as unknown as RequestNotes;
  assert.equal(await store.save('0xJob', 0, notes, 1), 1);
  assert.equal(await store.save('0xjob', 1, notes, 2), 2);
  await assert.rejects(store.save('0xjob', 1, notes, 3), RequestNotesConflictError);
  await assert.rejects(store.save('0xjob', 0, notes, 3), RequestNotesConflictError);
  assert.equal((await store.get('0xJOB'))?.version, 2);
});

test('confirmed waits for the write and carries the new version on the request', async () => {
  const store = new CountingStore();
  const writer = new NotesWriter<Fake>(() => store, notesOf);
  const job: Fake = { jobId: '0xjob', notesVersion: 0, rounds: 1 };
  await writer.confirmed(job);
  assert.equal(job.notesVersion, 1);
  job.rounds = 2;
  await writer.confirmed(job);
  assert.equal(job.notesVersion, 2);
  assert.deepEqual(store.writes, [1, 2]);
  assert.equal(((await store.get('0xjob'))?.notes as { rounds: number }).rounds, 2);
});

test('changes that pile up while a write runs land together in one write', async () => {
  const store = new CountingStore();
  const writer = new NotesWriter<Fake>(() => store, notesOf);
  const job: Fake = { jobId: '0xjob', notesVersion: 0, rounds: 1 };
  const first = writer.confirmed(job);
  job.rounds = 2;
  writer.changed(job);
  job.rounds = 3;
  const last = writer.confirmed(job);
  await Promise.all([first, last]);
  assert.deepEqual(store.writes, [3]);
  assert.equal(job.notesVersion, 1);
});

test('a failed write rejects confirmed, and the next change writes the notes', async () => {
  const store = new CountingStore();
  store.failNext = 1;
  const writer = new NotesWriter<Fake>(() => store, notesOf);
  const job: Fake = { jobId: '0xjob', notesVersion: 0, rounds: 1 };
  await assert.rejects(writer.confirmed(job), /database down/);
  assert.equal(job.notesVersion, 0);
  job.rounds = 2;
  await writer.confirmed(job);
  assert.deepEqual(store.writes, [2]);
  assert.equal(job.notesVersion, 1);
});

test('notes changed by another writer are a conflict, never an overwrite', async () => {
  const store = new CountingStore();
  const writer = new NotesWriter<Fake>(() => store, notesOf);
  const job: Fake = { jobId: '0xjob', notesVersion: 0, rounds: 1 };
  await writer.confirmed(job);
  await store.inner.save('0xjob', 1, { rounds: 9 } as unknown as RequestNotes, 5);
  job.rounds = 2;
  await assert.rejects(writer.confirmed(job), RequestNotesConflictError);
  assert.equal(((await store.get('0xjob'))?.notes as { rounds: number }).rounds, 9);
});

test('requests are written independently', async () => {
  const store = new CountingStore();
  const writer = new NotesWriter<Fake>(() => store, notesOf);
  const a: Fake = { jobId: '0xa', notesVersion: 0, rounds: 1 };
  const b: Fake = { jobId: '0xb', notesVersion: 0, rounds: 5 };
  await Promise.all([writer.confirmed(a), writer.confirmed(b)]);
  assert.equal(a.notesVersion, 1);
  assert.equal(b.notesVersion, 1);
});
