import test from 'node:test';
import assert from 'node:assert/strict';
import { supportPageCopy } from '../../shared/i18n/messages/supportPage';
import { caseTitle, helpPrefill, stateWords, whoWords } from './casePresentation';

const en = supportPageCopy.en;

test('a case reads in plain words', () => {
  assert.equal(caseTitle('KT-1042', en), 'Case KT-1042');
  assert.equal(stateWords('new', en), 'Waiting for a reply');
  assert.equal(stateWords('waiting_person', en), 'Replied');
  assert.equal(stateWords('solved', en), 'Solved');
  assert.equal(whoWords('person', en), 'You');
  assert.equal(whoWords('teammate', en), 'Karwan team');
  assert.equal(whoWords('bot', en), 'Help bot');
});

test('every locale says "case", none says ticket', () => {
  for (const [loc, copy] of Object.entries(supportPageCopy)) {
    assert.ok(!/ticket/i.test(JSON.stringify(copy)), loc);
    assert.ok(copy.caseTitle.includes('{ref}'), loc);
  }
});

test('Get help with this opens the bot about that record', () => {
  assert.deepEqual(helpPrefill({ deal: `0x${'d1'.repeat(32)}`, dealRef: 'D1D1-D1D1' }, en), { text: 'About my deal D1D1-D1D1', viewingDeal: `0x${'d1'.repeat(32)}` });
  assert.deepEqual(helpPrefill({ transfer: 'KR-7Q2M' }, en), { text: 'About my transfer KR-7Q2M', viewingDeal: undefined });
  assert.equal(helpPrefill({}, en), null);
  assert.equal(helpPrefill({ deal: 'not-a-deal' }, en), null);
  assert.equal(helpPrefill({ transfer: '<script>' }, en), null);
});
