import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captionPurpose, MAX_SENT_FILES, sentFileLine, sentFileStore, sniffSent, useSentFiles, type SentFile } from './sentFiles.js';
import { fileArrived, type FileArrivalDeps } from './fileArrival.js';

const ADA = '0x' + 'a'.repeat(40);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PDF = new TextEncoder().encode('%PDF-1.7 rest');
const NOW = Date.UTC(2026, 10, 7, 9);

function store() {
  const root = mkdtempSync(join(tmpdir(), 'sent-'));
  return { s: sentFileStore(root), done: () => rmSync(root, { recursive: true, force: true }) };
}

test('a sent file is known by its bytes', () => {
  assert.equal(sniffSent(JPEG), 'image/jpeg');
  assert.equal(sniffSent(PDF), 'application/pdf');
  assert.equal(sniffSent(new TextEncoder().encode('<svg onload=1>')), null);
});

test('only a caption that plainly says so places a file; "Laptop photo" does not', () => {
  assert.equal(captionPurpose('Laptop photo', true), null);
  assert.equal(captionPurpose(undefined, true), null);
  assert.equal(captionPurpose('selling this', true), 'offer');
  assert.equal(captionPurpose('packed and delivered', true), 'delivery');
  assert.equal(captionPurpose('my entry', true), 'entry');
  assert.equal(captionPurpose('invoice for March', true), 'record');
  assert.equal(captionPurpose('the quote we agreed', false), 'request');
  assert.equal(captionPurpose('selling this', false), null);
});

test('files are held an hour, four at most, and taken once', () => {
  const { s, done } = store();
  try {
    for (let i = 0; i < MAX_SENT_FILES; i++) assert.ok('held' in s.hold(ADA, JPEG, NOW + i));
    assert.ok('error' in s.hold(ADA, JPEG, NOW + 9));
    assert.equal(s.count(ADA, NOW + 10), MAX_SENT_FILES);
    assert.equal(s.count(ADA, NOW + 61 * 60_000), 0);
    s.hold(ADA, PDF, NOW);
    assert.equal(s.take(ADA, NOW + 1).length, 1);
    assert.equal(s.take(ADA, NOW + 2).length, 0);
    assert.ok('error' in s.hold(ADA, new Uint8Array([1, 2, 3]), NOW));
    assert.ok('error' in s.hold('not-an-address', JPEG, NOW));
  } finally {
    done();
  }
});

test('the chat line says what was sent and what it shows, with nothing that breaks the bracket', () => {
  const line = sentFileLine({ photo: true, caption: 'Laptop photo', reading: { kind: 'item', shows: 'A silver HP Envy laptop [open]' } });
  assert.equal(line, '[I sent a photo, caption "Laptop photo". It shows A silver HP Envy laptop open. Kind: item.]');
  assert.equal(sentFileLine({ photo: false }), '[I sent a PDF, no caption.]');
});

const holds = (calls: string[]) => ({
  holdForOffer: async (_a: string, f: { mimeType: string }) => (calls.push(`offer:${f.mimeType}`), 'Photo added for your next offer.'),
  holdForDelivery: async () => (calls.push('delivery'), 'Photo added to your delivery.'),
  holdForDraft: async () => (calls.push('request'), 'Added to your next request or deal.'),
  holdForEntry: async () => (calls.push('entry'), 'Kept for your entry.'),
});

test('use_sent_photo puts held files where the person said, and a PDF never on an offer', async () => {
  const { s, done } = store();
  try {
    const calls: string[] = [];
    const deps = { now: () => NOW, store: s, readInvoice: async (_a: string, f: SentFile) => (calls.push(`record:${f.mimeType}`), ['Got it: an invoice.']), ...holds(calls) };
    s.hold(ADA, JPEG, NOW);
    s.hold(ADA, PDF, NOW + 1);
    const out = await useSentFiles(ADA, 'offer', deps);
    assert.equal(out.ok, true);
    assert.deepEqual(calls, ['offer:image/jpeg']);
    assert.match(out.said, /PDF can't go on an offer/);
    assert.equal((await useSentFiles(ADA, 'offer', deps)).ok, false);

    s.hold(ADA, PDF, NOW);
    assert.equal((await useSentFiles(ADA, 'record', deps)).said, 'Got it: an invoice.');
    assert.deepEqual(calls.at(-1), 'record:application/pdf');
  } finally {
    done();
  }
});

function arrivalDeps(s: ReturnType<typeof sentFileStore>, calls: string[], reading = { kind: 'item' as const, shows: 'a silver HP Envy laptop' }): FileArrivalDeps {
  return {
    now: () => NOW,
    store: s,
    describe: async () => (calls.push('describe'), reading),
    readInvoice: async () => (calls.push('invoice'), ['Got it: an invoice.']),
    ...holds(calls),
  };
}

test('"Laptop photo" is never read as an invoice: it is held and handed to the assistant (view 66)', async () => {
  const { s, done } = store();
  try {
    const calls: string[] = [];
    const got = await fileArrived(ADA, { bytes: JPEG, mimeType: 'image/jpeg' }, 'Laptop photo', arrivalDeps(s, calls));
    assert.equal(got.turn, true);
    assert.deepEqual(got.replies, []);
    assert.match(got.note!, /caption "Laptop photo"\. It shows a silver HP Envy laptop/);
    assert.deepEqual(calls, ['describe']);
    assert.equal(s.count(ADA, NOW), 1);
  } finally {
    done();
  }
});

test('a plain caption places the file at once with no image read, and the note says so', async () => {
  const { s, done } = store();
  try {
    const calls: string[] = [];
    const got = await fileArrived(ADA, { bytes: JPEG, mimeType: 'image/jpeg' }, 'selling this', arrivalDeps(s, calls));
    assert.equal(got.turn, false);
    assert.deepEqual(calls, ['offer:image/jpeg']);
    assert.match(got.note!, /Photo added for your next offer/);

    const inv = await fileArrived(ADA, { bytes: PDF, mimeType: 'application/pdf' }, 'my invoice', arrivalDeps(s, calls));
    assert.equal(inv.turn, false);
    assert.equal(calls.at(-1), 'invoice');
  } finally {
    done();
  }
});

test('a file that is missing or not a photo or PDF never reaches the chat', async () => {
  const { s, done } = store();
  try {
    const calls: string[] = [];
    const missing = await fileArrived(ADA, null, 'hi', arrivalDeps(s, calls));
    assert.equal(missing.note, undefined);
    const odd = await fileArrived(ADA, { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' }, undefined, arrivalDeps(s, calls));
    assert.equal(odd.note, undefined);
    assert.deepEqual(calls, []);
  } finally {
    done();
  }
});

test('a picture the model could not read is still held, and the line has no guess', async () => {
  const { s, done } = store();
  try {
    const deps = { ...arrivalDeps(s, []), describe: async () => null };
    const got = await fileArrived(ADA, { bytes: JPEG, mimeType: 'image/jpeg' }, undefined, deps);
    assert.equal(got.note, '[I sent a photo, no caption.]');
    assert.equal(got.turn, true);
  } finally {
    done();
  }
});
