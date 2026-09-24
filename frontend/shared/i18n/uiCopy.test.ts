import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanUiMessages, stripMechanicalTags } from './uiCopy';

test('stripMechanicalTags turns mechanical labels into natural copy', () => {
  assert.equal(stripMechanicalTags('• [:WORLD ID:]'), 'WORLD ID');
  assert.equal(stripMechanicalTags('[:ERR]'), 'ERR');
});

test('stripMechanicalTags keeps ordinary square-bracket copy intact', () => {
  assert.equal(stripMechanicalTags('Read [optional] details'), 'Read [optional] details');
});

test('stripMechanicalTags keeps the spaces of a sentence split around a link', () => {
  // "On " + <Link>Open buyer dashboard</Link> + ", pick ..." rendered as
  // "OnOpen buyer dashboard" while every message was trimmed.
  assert.equal(stripMechanicalTags('On '), 'On ');
  assert.equal(stripMechanicalTags(', pick a seller. A '), ', pick a seller. A ');
  assert.equal(stripMechanicalTags(' transaction lands on Arc.'), ' transaction lands on Arc.');
});

test('stripMechanicalTags keeps paragraph breaks', () => {
  assert.equal(stripMechanicalTags('First paragraph.\n\nSecond paragraph.'), 'First paragraph.\n\nSecond paragraph.');
});

test('stripMechanicalTags keeps the outer spaces of a split sentence that carries a tag', () => {
  assert.equal(stripMechanicalTags('Pay in [:USDC:] '), 'Pay in USDC ');
});

test('cleanUiMessages cleans nested records and arrays without mutating the source', () => {
  const source = { title: '[:TITLE:]', items: ['[:ONE:]', 'Two'] };
  assert.deepEqual(cleanUiMessages(source), { title: 'TITLE', items: ['ONE', 'Two'] });
  assert.equal(source.title, '[:TITLE:]');
});
