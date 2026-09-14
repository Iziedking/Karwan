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

test('cleanUiMessages cleans nested records and arrays without mutating the source', () => {
  const source = { title: '[:TITLE:]', items: ['[:ONE:]', 'Two'] };
  assert.deepEqual(cleanUiMessages(source), { title: 'TITLE', items: ['ONE', 'Two'] });
  assert.equal(source.title, '[:TITLE:]');
});
