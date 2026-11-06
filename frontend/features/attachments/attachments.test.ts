import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentHref, dataUrlBytes, fits, MAX_PDF_BYTES, type PickedAttachment } from './attachments';

const one = (size: number): PickedAttachment => ({ name: 'a.pdf', dataUrl: 'data:application/pdf;base64,', kind: 'pdf', size });

test('a data URL is measured by the bytes it carries', () => {
  assert.equal(dataUrlBytes('data:application/pdf;base64,JVBERi0='), 5);
  assert.equal(dataUrlBytes('data:image/png;base64,AAAA'), 3);
});

test('the same limits as the server: four files, a PDF up to 4 MB, 6 MB together', () => {
  assert.equal(fits([one(1), one(1), one(1), one(1)], 1, 'photo'), 'max');
  assert.equal(fits([], MAX_PDF_BYTES + 1, 'pdf'), 'tooLarge');
  assert.equal(fits([one(3_000_000), one(2_500_000)], 600_000, 'photo'), 'tooLarge');
  assert.equal(fits([one(3_000_000)], 1_000_000, 'pdf'), null);
});

test('a request attachment and a deal attachment are read from their own links', () => {
  assert.match(attachmentHref('request', '0xjob', 1), /\/api\/jobs\/0xjob\/attachments\/1$/);
  assert.match(attachmentHref('deal', '0xjob', 0), /\/api\/deals\/direct\/0xjob\/attachments\/0$/);
});
