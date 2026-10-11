import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoredFact } from '../verification/evidence.js';
import type { ExtractedInvoice } from '../verification/invoice.js';
import { createEvidenceIntake, type IntakeDeps } from './media.js';
import type { OutMessage } from './render.js';

const now = Date.UTC(2026, 9, 12);
const invoice: ExtractedInvoice = {
  issuer: 'Ada Builds',
  counterparty: 'Tunde Stores',
  amount: 250,
  currency: 'USD',
  date: '2026-03-14',
  number: 'INV-1',
};

function setup(over: Partial<IntakeDeps> = {}) {
  const facts: StoredFact[] = [];
  const claimed = new Map<string, string>();
  const deps: IntakeDeps = {
    now: () => now,
    channel: 'whatsapp',
    download: async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' }),
    extract: async () => invoice,
    displayNameOf: async () => 'Ada Builds',
    claimFingerprint: async (fp, address) => {
      const held = claimed.get(fp);
      if (held && held !== address) return false;
      claimed.set(fp, address);
      return true;
    },
    addFact: async (_a, f) => {
      facts.push(f);
      return true;
    },
    ...over,
  };
  return { intake: createEvidenceIntake(deps), facts };
}

const body = (out: OutMessage[]) => out.map((m) => (m.kind === 'template' ? m.params.join(' ') : m.body)).join('\n');
const media = { id: 'm', from: '1', timestamp: now, kind: 'media' as const, mediaId: 'media-1', mimeType: 'image/jpeg' };

test('a good invoice becomes an invoice fact and the agent asks for the client', async () => {
  const { intake, facts } = setup();
  const out = await intake('0xada', media);
  assert.equal(facts.length, 1);
  assert.equal(facts[0].kind, 'invoice');
  assert.equal(facts[0].corroborated, false);
  assert.match(body(out), /Tunde Stores/);
  assert.match(body(out), /WhatsApp number/);
  assert.equal(facts[0].source, 'whatsapp');
});

test('on Telegram the fact names Telegram and the person is offered a link for the client', async () => {
  let hint: string | undefined;
  const { intake, facts } = setup({
    channel: 'telegram',
    download: async (_id, mimeType) => {
      hint = mimeType;
      return { bytes: new Uint8Array([1, 2, 3]), mimeType: mimeType ?? 'application/octet-stream' };
    },
  });
  const out = await intake('0xada', media);
  assert.equal(hint, 'image/jpeg', 'the type Telegram reported reaches the download');
  assert.equal(facts[0].source, 'telegram');
  assert.doesNotMatch(body(out), /WhatsApp/);
  assert.match(body(out), /link/);
});

test('the same invoice from a second account is refused', async () => {
  const { intake, facts } = setup({ claimFingerprint: async () => false });
  const out = await intake('0xkemi', media);
  assert.equal(facts.length, 0);
  assert.match(body(out), /already/i);
});

test('an invoice issued by someone else is not accepted as their work', async () => {
  const { intake, facts } = setup({ displayNameOf: async () => 'Kemi Designs' });
  const out = await intake('0xkemi', media);
  assert.equal(facts.length, 0);
  assert.match(body(out), /issued by you/i);
});

test('an unreadable document asks for a clearer one', async () => {
  const { intake, facts } = setup({ extract: async () => ({}) });
  const out = await intake('0xada', media);
  assert.equal(facts.length, 0);
  assert.match(body(out), /couldn't read/i);
});

test('a file too large or a failed download is answered plainly', async () => {
  const { intake } = setup({ download: async () => null });
  assert.match(body(await intake('0xada', media)), /couldn't open/i);
});

test('only images and PDFs are read', async () => {
  const { intake, facts } = setup({ download: async () => ({ bytes: new Uint8Array([1]), mimeType: 'video/mp4' }) });
  const out = await intake('0xada', { ...media, mimeType: 'video/mp4' });
  assert.equal(facts.length, 0);
  assert.match(body(out), /photo or a PDF/i);
});
