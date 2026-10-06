import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecipient, stepForBridgeStatus } from './recipient';

const ADDR = `0x8f3a${'0'.repeat(32)}c41e`;

test('an EVM address works on any network', () => {
  assert.deepEqual(parseRecipient(` ${ADDR} `, 'arc'), { kind: 'address', address: ADDR });
  assert.deepEqual(parseRecipient(ADDR, 'baseSepolia'), { kind: 'address', address: ADDR });
});

test('a Karwan tag works on Arc only, with or without the @', () => {
  assert.deepEqual(parseRecipient('@Ada_Designs', 'arc'), { kind: 'tag', tag: 'ada_designs' });
  assert.deepEqual(parseRecipient('ada_designs', 'arc'), { kind: 'tag', tag: 'ada_designs' });
  assert.equal(parseRecipient('@ada_designs', 'baseSepolia').kind, 'invalid');
});

test('anything else is not a recipient', () => {
  assert.equal(parseRecipient('', 'arc').kind, 'empty');
  assert.equal(parseRecipient('0x123', 'arc').kind, 'invalid');
  assert.equal(parseRecipient('a b', 'arc').kind, 'invalid');
});

test('a withdrawal status reads as one of the four steps, never failed while it moves', () => {
  assert.equal(stepForBridgeStatus({ status: 'approving' }), 'leaving');
  assert.equal(stepForBridgeStatus({ status: 'burning' }), 'leaving');
  assert.equal(stepForBridgeStatus({ status: 'relaying' }), 'arriving');
  assert.equal(stepForBridgeStatus({ status: 'minted' }), 'arrived');
  assert.equal(stepForBridgeStatus({ status: 'relaying', movementState: 'completed' }), 'arrived');
  assert.equal(stepForBridgeStatus({ status: 'error' }), 'failed');
  assert.equal(stepForBridgeStatus({ status: 'burning', movementState: 'needs_attention' }), 'failed');
});
