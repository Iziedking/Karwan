import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkEntryFile, entryFileStore, entryFingerprint, MAX_ENTRY_FILES, MAX_ENTRY_FILE_BYTES } from './entryFiles.js';

/// A contest entry's files (view 40): checked by their bytes, kept under data/,
/// fingerprinted for the chain.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 9]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 3, 0, 0, 0]);

test('a file is taken by what its bytes are, never by its name', () => {
  assert.deepEqual(checkEntryFile(PNG), { bytes: PNG, contentType: 'image/png' });
  assert.deepEqual(checkEntryFile(PDF), { bytes: PDF, contentType: 'application/pdf' });
  assert.ok('error' in checkEntryFile(EXE), 'a program renamed .png is refused');
  assert.ok('error' in checkEntryFile(new Uint8Array(MAX_ENTRY_FILE_BYTES + 1).fill(0x25)));
});

test('the fingerprint changes with any file or the note, and only then', () => {
  const a = entryFingerprint([PNG, PDF], 'three colours');
  assert.equal(a, entryFingerprint([PNG, PDF], 'three colours'));
  assert.notEqual(a, entryFingerprint([PDF, PNG], 'three colours'));
  assert.notEqual(a, entryFingerprint([PNG, PDF], 'two colours'));
  assert.match(a, /^0x[0-9a-f]{64}$/);
});

test('files are kept per entry, at most four, and read back in order', () => {
  const root = mkdtempSync(join(tmpdir(), 'entries-'));
  try {
    const store = entryFileStore(root);
    store.saveFiles('e_1', [{ bytes: PNG, contentType: 'image/png' }, { bytes: PDF, contentType: 'application/pdf' }]);
    assert.deepEqual(store.readFile('e_1', 1)?.bytes, PDF);
    assert.equal(store.readFile('e_1', 2), null);
    assert.equal(store.readFile('../e_1', 0), null, 'no path out of the store');
    assert.throws(() => store.saveFiles('e_2', Array.from({ length: MAX_ENTRY_FILES + 1 }, () => ({ bytes: PNG, contentType: 'image/png' as const }))));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a file sent in chat is held for an entry only when its caption says so', async () => {
  const { holdForEntry, isEntryCaption } = await import('./entryFiles.js');
  assert.equal(isEntryCaption('my entry for the logo'), true);
  assert.equal(isEntryCaption('Enter this contest please'), true);
  assert.equal(isEntryCaption('invoice for March'), false);
  assert.equal(isEntryCaption(undefined), false);
  const root = mkdtempSync(join(tmpdir(), 'held-'));
  try {
    const store = entryFileStore(root);
    const who = '0x3333333333333333333333333333333333333333';
    assert.match(await holdForEntry(who, { bytes: PNG, mimeType: 'image/png' }, 1, store), /1 of 4/);
    assert.match(await holdForEntry(who, { bytes: EXE, mimeType: 'image/png' }, 2, store), /images/);
    assert.equal(store.heldCount(who, 3), 1);
    assert.equal(store.takeHeld(who, 4).length, 1);
    assert.equal(store.heldCount(who, 5), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
