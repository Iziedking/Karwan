import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachmentStore, decodeAttachments, holdForDraft, isDraftCaption, joinAttachments, MAX_ATTACHMENTS, MAX_PDF_BYTES, safeName } from './attachments.js';

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 0x20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const url = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`;

test('photos and PDFs are read by their bytes, never by the name or the claimed type', () => {
  const ok = decodeAttachments([
    { name: 'plan.pdf', dataUrl: url('application/pdf', PDF) },
    { name: 'shelf.png', dataUrl: url('image/png', PNG) },
  ]);
  assert.ok(!('error' in ok));
  assert.deepEqual(ok.map((a) => a.contentType), ['application/pdf', 'image/png']);
  const lying = decodeAttachments([{ name: 'invoice.pdf', dataUrl: url('application/pdf', Buffer.from('<html>hi</html>')) }]);
  assert.ok('error' in lying);
});

test('at most four, a PDF at most 4 MB, and all of them together at most 6 MB', () => {
  const five = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => ({ name: `${i}.pdf`, dataUrl: url('application/pdf', PDF) }));
  assert.ok('error' in decodeAttachments(five));
  const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_PDF_BYTES, 0x20)]);
  assert.ok('error' in decodeAttachments([{ name: 'big.pdf', dataUrl: url('application/pdf', big) }]));
  const three = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(2_500_000, 0x20)]);
  const together = decodeAttachments([1, 2, 3].map((i) => ({ name: `${i}.pdf`, dataUrl: url('application/pdf', three) })));
  assert.ok('error' in together);
});

test('a saved name keeps only a plain file name', () => {
  assert.equal(safeName('../../etc/passwd', 'application/pdf'), 'passwd.pdf');
  assert.equal(safeName('C:\\Users\\me\\Quote "final".pdf', 'application/pdf'), 'Quote final.pdf');
  assert.equal(safeName('', 'image/png'), 'photo.png');
});

test('a set is saved under its own folder and read back one at a time', () => {
  const root = mkdtempSync(join(tmpdir(), 'att-'));
  try {
    const store = attachmentStore(root);
    const items = decodeAttachments([
      { name: 'plan.pdf', dataUrl: url('application/pdf', PDF) },
      { name: 'shelf.png', dataUrl: url('image/png', PNG) },
    ]);
    assert.ok(!('error' in items));
    const saved = store.save(items, 1000);
    assert.match(saved.folder, /^att_[a-f0-9]{16}$/);
    assert.deepEqual(saved.items.map((i) => [i.name, i.contentType, i.at]), [['plan.pdf', 'application/pdf', 1000], ['shelf.png', 'image/png', 1000]]);
    const back = store.read(saved.folder, 1);
    assert.equal(back?.contentType, 'image/png');
    assert.equal(Buffer.from(back!.bytes).equals(PNG), true);
    assert.equal(store.read(saved.folder, 4), null);
    assert.equal(store.read('../x', 0), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a photo or PDF sent to the assistant about a request or deal is held for the next one, then taken once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'att-held-'));
  try {
    const store = attachmentStore(root);
    const ME = '0x' + 'a'.repeat(40);
    assert.match(await holdForDraft(ME, { bytes: new Uint8Array(PDF), mimeType: 'application/pdf' }, 1000, store), /1 of 4/);
    assert.match(await holdForDraft(ME, { bytes: new Uint8Array(PNG), mimeType: 'image/png' }, 2000, store), /2 of 4/);
    assert.match(await holdForDraft(ME, { bytes: new Uint8Array(Buffer.from('nope')), mimeType: 'image/png' }, 2000, store), /photo or a PDF/);
    assert.equal(store.heldCount(ME, 3000), 2);
    const taken = store.takeHeld(ME, 3000);
    assert.deepEqual(taken.map((t) => t.contentType), ['application/pdf', 'image/png']);
    assert.equal(store.heldCount(ME, 3000), 0);
    // Held for an hour.
    await holdForDraft(ME, { bytes: new Uint8Array(PDF), mimeType: 'application/pdf' }, 5000, store);
    assert.equal(store.heldCount(ME, 5000 + 60 * 60_000), 1);
    assert.equal(store.heldCount(ME, 5000 + 60 * 60_000 + 1), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('held files join the form\'s files under the same limits', () => {
  const pdf = { bytes: new Uint8Array(3_500_000), contentType: 'application/pdf' as const, name: 'a.pdf' };
  assert.ok('error' in joinAttachments([pdf], [pdf]));
  assert.ok('error' in joinAttachments([pdf, pdf].map((p) => ({ ...p, bytes: new Uint8Array(10) })), Array.from({ length: 3 }, () => ({ ...pdf, bytes: new Uint8Array(10) }))));
  const ok = joinAttachments([{ ...pdf, bytes: new Uint8Array(10) }], [{ ...pdf, bytes: new Uint8Array(10), name: 'b.pdf' }]);
  assert.ok(!('error' in ok));
  assert.equal(ok.length, 2);
});

test('words about a request or a deal keep the file for it; an invoice never does', () => {
  for (const words of ['for my request', 'I need shelves like this', 'looking for this', 'for the deal with Ada', 'this is what we agreed']) assert.equal(isDraftCaption(words), true, words);
  for (const words of ['my invoice for June', 'receipt', '', undefined]) assert.equal(isDraftCaption(words), false, String(words));
});
