import assert from 'node:assert/strict';
import test from 'node:test';
import { sellerAgreementExpired } from './lifecycle.js';

const expiredDeadline = 1_700_000_000;
const afterDeadlineMs = expiredDeadline * 1000 + 1;

test('expires an unanswered seller agreement window', () => {
  assert.equal(
    sellerAgreementExpired(
      {
        acceptanceDeadlineUnix: expiredDeadline,
      },
      afterDeadlineMs,
    ),
    true,
  );
});

test('does not expire after the seller has agreed and the buyer is reviewing funding', () => {
  assert.equal(
    sellerAgreementExpired(
      {
        acceptanceDeadlineUnix: expiredDeadline,
        sellerApprovedAt: expiredDeadline * 1000 - 1,
      },
      afterDeadlineMs,
    ),
    false,
  );
});

test('does not expire a funded deal or a window that is still open', () => {
  assert.equal(
    sellerAgreementExpired(
      {
        acceptanceDeadlineUnix: expiredDeadline,
        acceptedAt: expiredDeadline * 1000 - 1,
      },
      afterDeadlineMs,
    ),
    false,
  );
  assert.equal(
    sellerAgreementExpired(
      {
        acceptanceDeadlineUnix: expiredDeadline,
      },
      expiredDeadline * 1000,
    ),
    false,
  );
});
