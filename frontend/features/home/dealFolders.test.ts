import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { agentShare, fanSlot, feedKnowsOrigin, folderDeals } from './dealFolders';

const feed = [
  { amountBand: 'under_100' as const, settledAt: 3, origin: 'direct' as const },
  { amountBand: '100_500' as const, settledAt: 9, origin: 'agent' as const },
  { amountBand: 'under_100' as const, settledAt: 7, origin: 'agent' as const },
  { amountBand: '100_500' as const, settledAt: 5 },
  { amountBand: '500_2000' as const, settledAt: 8, origin: 'direct' as const },
];

test('the settled folder holds the newest settlements, whoever matched them', () => {
  assert.deepEqual(folderDeals(feed).map((d) => d.settledAt), [9, 8, 7, 5, 3]);
  assert.deepEqual(folderDeals(feed, undefined, 2).map((d) => d.settledAt), [9, 8]);
});

test('the agent folder holds only deals the feed says an agent matched', () => {
  assert.deepEqual(folderDeals(feed, 'agent').map((d) => d.settledAt), [9, 7]);
  assert.deepEqual(folderDeals(undefined, 'agent'), []);
});

test('the agent share is whole percent of all deals, and absent without deals', () => {
  assert.equal(agentShare({ total: 197, agent: 95, settled: 190, direct: 102 }), 48);
  assert.equal(agentShare({ total: 0, agent: 0, settled: 0, direct: 0 }), null);
  assert.equal(agentShare(undefined), null);
});

test('cards fan evenly from one side to the other', () => {
  assert.equal(fanSlot(0, 1), 0);
  assert.equal(fanSlot(0, 5), -1);
  assert.equal(fanSlot(2, 5), 0);
  assert.equal(fanSlot(4, 5), 1);
});

test('a folder is one honest control: it opens, says so, and shows ranges only', () => {
  const src = readFileSync(new URL('./components/DealFolders.tsx', import.meta.url), 'utf8');
  assert.match(src, /aria-expanded=\{open\}/);
  assert.match(src, /aria-controls=/);
  assert.match(src, /'Escape'/);
  assert.match(src, /sealedRecord\.bands/);
  assert.doesNotMatch(src, /dealAmountUsdc|buyer|seller|title=/);
  const css = readFileSync(new URL('./components/DealFolders.module.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /gradient|blur\(|box-shadow:[^;]*rgba\(0, 0, 0, \.[5-9]/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  for (const [, size] of css.matchAll(/font-size:\s*(\d+)px/g)) assert.ok(Number(size) >= 14);
  const record = readFileSync(new URL('./components/SettlementRecord.tsx', import.meta.url), 'utf8');
  assert.match(record, /<DealFolders /);
});

test('a feed from a server that does not tag origin cannot say no agent deals settled', () => {
  assert.equal(feedKnowsOrigin(feed), true);
  assert.equal(feedKnowsOrigin([{ amountBand: 'under_100' as const, settledAt: 1 }]), false);
  assert.equal(feedKnowsOrigin(undefined), false);
});

test('the folders load with the rest of the record, not after it', () => {
  const folders = readFileSync(new URL('./components/DealFolders.tsx', import.meta.url), 'utf8');
  const record = readFileSync(new URL('./components/SettlementRecord.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(folders, /useQuery/);
  assert.match(record, /api\.dealsStats\(\)/);
  assert.match(folders, /feedKnowsOrigin\(/);
});

test('the folders stay hidden unless every figure is a real count', () => {
  assert.equal(agentShare({ total: 10 } as never), null);
  assert.equal(agentShare({ total: 10, agent: 3, settled: 8 } as never), null);
  assert.equal(agentShare({ total: 10, agent: 3, settled: 8, direct: 7 }), 30);
});
