import assert from 'node:assert/strict';
import test from 'node:test';
import { LINK_RE, linkHref, textParts } from './textLinks';

test('a link in a message becomes its own part, punctuation after it stays text', () => {
  assert.deepEqual(textParts('See https://testnet.karwan.site/credit-passport/0xa0?share=x, thanks'), [
    { text: 'See ' },
    { text: 'https://testnet.karwan.site/credit-passport/0xa0?share=x', href: 'https://testnet.karwan.site/credit-passport/0xa0?share=x' },
    { text: ', thanks' },
  ]);
});

test('a link written without https opens as https', () => {
  assert.deepEqual(textParts('repo: www.github.com/a/b.'), [
    { text: 'repo: ' },
    { text: 'www.github.com/a/b', href: 'https://www.github.com/a/b' },
    { text: '.' },
  ]);
  assert.equal(linkHref('www.github.com'), 'https://www.github.com/');
});

test('text without a link, or a scheme that is not the web, stays text', () => {
  assert.deepEqual(textParts('hi there'), [{ text: 'hi there' }]);
  assert.deepEqual(textParts('javascript:alert(1)'), [{ text: 'javascript:alert(1)' }]);
  assert.equal(linkHref('ftp://x.y'), null);
  assert.ok(LINK_RE.global);
});
