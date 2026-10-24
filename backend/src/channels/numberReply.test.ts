import assert from 'node:assert/strict';
import test from 'node:test';
import { choicesNote, CHOICES_TTL_MS, expandNumberReply, type ChatChoices } from './numberReply.js';
import { choicesFromShortlist } from './shortlistChoices.js';

/// Replying "5" to a shortlist in chat chooses offer 5, never a rating or
/// anything else that happens to be waiting.
///
///   npx tsx --test src/channels/numberReply.test.ts

const JOB = '0x' + 'cd'.repeat(32);
const NOW = 1_760_000_000_000;
const entries = [
  { rank: 1, seller: '0x' + '1'.repeat(40), name: 'Realnica', tag: null, priceUsdc: 116.06, state: 'ready' },
  { rank: 2, seller: '0x' + '2'.repeat(40), name: 'pamcollins', tag: null, priceUsdc: 90, state: 'ready' },
  { rank: 3, seller: '0x' + '3'.repeat(40), name: 'Poz', tag: null, priceUsdc: 113.32, state: 'unavailable' },
  { rank: 5, seller: '0x' + '5'.repeat(40), name: 'grachi', tag: 'grachidefi', priceUsdc: 114.95, state: 'ready' },
];
const choices = choicesFromShortlist(JOB, entries, NOW) as ChatChoices;

test('the shortlist sent to the chat becomes the numbered choices, without offers no longer open', () => {
  assert.deepEqual(choices.options.map((o) => o.n), [1, 2, 5]);
  assert.equal(choices.options[2]!.name, 'grachi @grachidefi');
  assert.equal(choicesFromShortlist(JOB, [], NOW), null);
});

test('a bare number chooses that offer on the shortlist', () => {
  for (const said of ['5', ' 5 ', '#5', '5.', '5)']) {
    const out = expandNumberReply(said, choices, NOW + 33 * 60_000);
    assert.equal(out, `I choose number 5 on my shortlist for request ${JOB}: grachi @grachidefi at 114.95 USDC (seller 0x${'5'.repeat(40)}). Prepare the choose card for that offer.`, said);
  }
});

test('anything else is read as typed: words, a number not on the list, no list, an old list', () => {
  assert.equal(expandNumberReply('5 stars', choices, NOW), null);
  assert.equal(expandNumberReply('rate it 5', choices, NOW), null);
  assert.equal(expandNumberReply('3', choices, NOW), null);
  assert.equal(expandNumberReply('4', choices, NOW), null);
  assert.equal(expandNumberReply('5', null, NOW), null);
  assert.equal(expandNumberReply('5', choices, NOW + CHOICES_TTL_MS + 1), null);
});

test('the note tells the assistant what each number means', () => {
  assert.match(choicesNote(choices), /^I sent the shortlist for request 0x(cd)+\. A reply with a number chooses that offer: 1 = Realnica at 116\.06 USDC/);
});
