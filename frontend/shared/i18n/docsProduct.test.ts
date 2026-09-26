import assert from 'node:assert/strict';
import test from 'node:test';
import { docsProductCopy } from './messages/docsProduct';

const locales = Object.keys(docsProductCopy) as Array<keyof typeof docsProductCopy>;

test('the product overview never shows x402 or mainnet escrow as live', () => {
  for (const loc of locales) {
    const rows = docsProductCopy[loc].today.rows;
    assert.equal(rows.length, 8, loc);
    const [signup, escrow, agents, , disputes, , totals, x402] = rows;
    assert.equal(signup!.mainnet, 'invite', loc);
    assert.equal(escrow!.mainnet, 'planned', loc);
    assert.equal(agents!.mainnet, 'planned', loc);
    assert.equal(disputes!.mainnet, 'planned', loc);
    assert.equal(totals!.mainnet, 'planned', loc);
    assert.equal(x402!.testnet, 'planned', loc);
    assert.equal(x402!.mainnet, 'planned', loc);
  }
});

test('the roadmap starts from what is true now and shows no dates', () => {
  assert.equal(docsProductCopy.en.roadmap.milestones[0]!.when, 'Now');
  for (const loc of locales) {
    const roadmap = docsProductCopy[loc].roadmap;
    assert.equal(roadmap.milestones.length, 5, loc);
    assert.doesNotMatch(JSON.stringify(roadmap), /20\d\d/, loc);
  }
});

test('no em dashes anywhere in the overview copy', () => {
  for (const loc of locales) assert.doesNotMatch(JSON.stringify(docsProductCopy[loc]), /—/, loc);
});
