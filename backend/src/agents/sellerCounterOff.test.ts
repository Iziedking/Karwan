import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

/// View 75: a switched-off agent does not bargain. A buyer's counter on an
/// offer it already made is put to the person instead.
///
///   node ../scripts/run-tests.mjs src/agents/sellerCounterOff.test.ts

// Read with plain newlines, so the patterns hold on a Windows checkout too.
const source = (await readFile(new URL('./seller.ts', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
const counter = source.slice(source.indexOf('async function runCounterEvaluation('), source.indexOf('interface JobPostedArgs'));

test('the counter step exists and ends where the next section starts', () => {
  assert.ok(counter.length > 1000);
  assert.match(counter, /nextSellerMove\(/);
});

test('switched off, the counter goes to the person as a question', () => {
  const off = counter.indexOf('if (!(await agentIsOn(seller.userAddress))) {');
  assert.ok(off > 0, 'the switch is read');
  const block = counter.slice(off, counter.indexOf('}', off));
  assert.match(block, /await askAtFloor\(seller, active, buyerCounterPrice, profileFloor, 'last-price-passed'\);/);
  assert.match(block, /active\.lastBuyerPrice = buyerCounterPrice;/);
  assert.match(block, /return;/);
});

test('nothing is researched, paid for, decided or sent before the switch is read', () => {
  const off = counter.indexOf('if (!(await agentIsOn(seller.userAddress))) {');
  for (const later of ['maybeSellerResearch(', 'marketHeat(', 'nextSellerMove(', 'nextMove(', 'replyOnce(', 'generateObject(']) {
    const at = counter.indexOf(later);
    assert.ok(at > off, `${later} comes after the switch`);
  }
  // The floor the question shows is the seller's own, worked out first.
  assert.ok(counter.indexOf('const profileFloor =') < off);
});
