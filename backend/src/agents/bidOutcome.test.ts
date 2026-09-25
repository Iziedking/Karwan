import assert from 'node:assert/strict';
import test from 'node:test';
import { appendCapped, requestTitle, settleBid, type BidOutcomeRecord } from './bidOutcome.js';

const bid = { jobId: '0xjob', sellerAgent: '0xagent', sellerUser: '0xme', deadlineUnix: 2_000 };

test('a deal with this seller is won, by agent or by user', () => {
  assert.equal(settleBid(bid, { seller: '0xother', sellerAgentAddress: '0xAGENT' }, 0), 'won');
  assert.equal(settleBid(bid, { seller: '0xME' }, 0), 'won');
});

test('a deal with anyone else is lost', () => {
  assert.equal(settleBid(bid, { seller: '0xother', sellerAgentAddress: '0xotheragent' }, 0), 'lost');
});

test('no deal and past the deadline is expired; before it, nothing is settled', () => {
  assert.equal(settleBid(bid, null, 2_000_001), 'expired');
  assert.equal(settleBid(bid, null, 1_999_000), null);
});

test('a legacy bid with no owner address is never matched on an empty seller', () => {
  assert.equal(settleBid({ ...bid, sellerUser: '' }, { seller: '' }, 0), 'lost');
});

test('the title is the first line of the brief, trimmed, never a hash', () => {
  assert.equal(requestTitle('  Logo for my bakery\nSVG and PNG please'), 'Logo for my bakery');
  assert.equal(requestTitle('x'.repeat(120))?.length, 80);
  assert.equal(requestTitle(''), null);
  assert.equal(requestTitle(null), null);
  assert.equal(requestTitle(undefined), null);
});

test('outcomes keep the newest 50 and replace a repeat for the same request', () => {
  let list: BidOutcomeRecord[] = [];
  for (let i = 0; i < 60; i++) {
    list = appendCapped(list, { jobId: `0x${i}`, sellerAgent: '0xa', title: null, outcome: 'lost', lastPrice: '1', at: i });
  }
  assert.equal(list.length, 50);
  assert.equal(list[0].jobId, '0x59');
  list = appendCapped(list, { jobId: '0x59', sellerAgent: '0xa', title: null, outcome: 'won', lastPrice: '1', at: 99 });
  assert.equal(list.filter((r) => r.jobId === '0x59').length, 1);
  assert.equal(list[0].outcome, 'won');
});
