import assert from 'node:assert/strict';
import test from 'node:test';
import { talksOf, type Book, type Negotiation } from './negotiationBook.js';

/// How the request's talks stand, for the request page (bug B-10): once every
/// talk has ended the page stops saying the agent is negotiating.

const talk = (seller: string, state: Negotiation['state']) => [seller, { seller, state } as Negotiation] as const;

test('counts open, waiting on the person, and ended talks', () => {
  const book: Book = new Map([talk('a', 'open'), talk('b', 'asking'), talk('c', 'ended'), talk('d', 'ended'), talk('e', 'agreed')]);
  assert.deepEqual(talksOf(book), { open: 1, asking: 1, ended: 2 });
  assert.deepEqual(talksOf(undefined), { open: 0, asking: 0, ended: 0 });
});
