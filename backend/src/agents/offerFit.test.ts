import assert from 'node:assert/strict';
import test from 'node:test';
import { offerTopicalMatch } from './offerFit.js';

const brief = ['landing page', 'contact form', 'interior design', 'responsive', 'next.js', 'source code'];

const offer = {
  title: 'Landing page with a contact form',
  description: 'I design and build fast, responsive landing pages in Next.js, with a working contact form, deployed and handed over with the source code.',
};

test('a seller offer written for the request scores as a strong skill fit', () => {
  assert.ok(offerTopicalMatch(brief, [offer]) >= 80);
});

test('the best of several offers counts, and no offers scores zero', () => {
  const unrelated = { title: 'Arabic translation', description: 'English to Arabic, 1,000 words a day.' };
  assert.equal(offerTopicalMatch(brief, [unrelated, offer]), offerTopicalMatch(brief, [offer]));
  assert.equal(offerTopicalMatch(brief, []), 0);
});
