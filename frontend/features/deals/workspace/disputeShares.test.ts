import assert from 'node:assert/strict';
import test from 'node:test';
import { linksFrom, proposalNote, splitShares } from './disputeShares';

test('links are one per line, trimmed, http only, five at most', () => {
  assert.deepEqual(linksFrom(' https://a.example \n\nnot a link\nhttp://b.example'), ['https://a.example', 'http://b.example']);
  assert.equal(linksFrom(Array(7).fill('https://x.example').join('\n')).length, 5);
});

test('the split reads as whole percentages for each side', () => {
  assert.deepEqual(splitShares(6200), { seller: 62, buyer: 38 });
  assert.deepEqual(splitShares(0), { seller: 0, buyer: 100 });
});

test('a rule-made or unclear proposal explains itself in plain words', () => {
  assert.equal(proposalNote({ rule: 'silent-seller', confidence: 'clear' }), 'silentSeller');
  assert.equal(proposalNote({ rule: 'both-silent', confidence: 'inconclusive' }), 'bothSilent');
  assert.equal(proposalNote({ rule: 'judge-unavailable', confidence: 'inconclusive' }), 'unavailable');
  assert.equal(proposalNote({ confidence: 'inconclusive' }), 'inconclusive');
  assert.equal(proposalNote({ confidence: 'clear' }), null);
});
