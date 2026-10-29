import assert from 'node:assert/strict';
import test from 'node:test';
import { reachLine, showNobodyYet } from './requestReachLine';
import { agentQuestionsCopy } from '@/shared/i18n/messages/agentQuestions';

const copy = agentQuestionsCopy.en;

test('the reach line counts sellers who offered and sellers checking the price', () => {
  assert.equal(reachLine(copy, { fit: 3, offered: 2, asked: 1, nobodyYet: false }), '3 sellers fit so far: 2 offered, 1 checking the price.');
  assert.equal(reachLine(copy, { fit: 1, offered: 0, asked: 1, nobodyYet: false }), 'One seller fits so far: 0 offered, 1 checking the price.');
});

test('with nobody who fits there is no line, and the nobody block waits for the minute', () => {
  assert.equal(reachLine(copy, { fit: 0, offered: 0, asked: 0, nobodyYet: false }), null);
  assert.equal(reachLine(copy, null), null);
  assert.equal(showNobodyYet({ fit: 0, offered: 0, asked: 0, nobodyYet: false }), false);
  assert.equal(showNobodyYet({ fit: 0, offered: 0, asked: 0, nobodyYet: true }), true);
  assert.equal(showNobodyYet({ fit: 1, offered: 1, asked: 0, nobodyYet: true }), false);
  assert.equal(showNobodyYet(null), false);
});
