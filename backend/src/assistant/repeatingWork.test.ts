import assert from 'node:assert/strict';
import test from 'node:test';
import { repeatingDirection, repeatingWork } from './repeatingWork.js';

/// View 76: work that repeats is told apart from a one-time job.
///
///   node ../scripts/run-tests.mjs src/assistant/repeatingWork.test.ts

test('a price per month or per hour is repeating work', () => {
  assert.deepEqual(repeatingWork('Maths tutor for my son, 300,000 a month'), { verdict: 'repeating', kind: 'monthly' });
  assert.deepEqual(repeatingWork('Bookkeeper on a monthly retainer'), { verdict: 'repeating', kind: 'monthly' });
  assert.deepEqual(repeatingWork('Lessons three times a week'), { verdict: 'repeating', kind: 'monthly' });
  assert.deepEqual(repeatingWork('Yoga coach, twice a week, paid every month'), { verdict: 'repeating', kind: 'monthly' });
  assert.deepEqual(repeatingWork('Virtual assistant, 15 an hour, 20 hours a week'), { verdict: 'repeating', kind: 'hourly' });
  assert.deepEqual(repeatingWork('Developer paid hourly'), { verdict: 'repeating', kind: 'hourly' });
  assert.deepEqual(repeatingWork('Cleaner 5 USDC per hour'), { verdict: 'repeating', kind: 'hourly' });
});

test('a deadline in weeks or months is not repeating work', () => {
  assert.equal(repeatingWork('Build my website within a month').verdict, 'one_time');
  assert.equal(repeatingWork('Logo design, needed in a week').verdict, 'one_time');
  assert.equal(repeatingWork('Deliver 20 bags of rice in two weeks').verdict, 'one_time');
  assert.equal(repeatingWork('web3 developer to build a trading bot').verdict, 'one_time');
  assert.equal(repeatingWork('A 3 hour photo shoot on Saturday').verdict, 'one_time');
});

test('lessons, classes and sessions with no rhythm named need one question', () => {
  assert.equal(repeatingWork('Piano lessons for my daughter').verdict, 'unsure');
  assert.equal(repeatingWork('French classes').verdict, 'unsure');
  assert.equal(repeatingWork('Someone to tutor my son in maths').verdict, 'unsure');
  assert.equal(repeatingWork('One lesson on fractions before Friday').verdict, 'one_time');
});

test('the direction names the work tools when they are open, and a plain answer when they are not', () => {
  const open = repeatingDirection({ verdict: 'repeating', kind: 'monthly' }, true);
  assert.match(open, /propose_post_hourly_work/);
  assert.match(open, /kind monthly/);
  assert.match(open, /sessions/);
  assert.match(open, /confirmedOneTime/);
  const closed = repeatingDirection({ verdict: 'repeating', kind: 'monthly' }, false);
  assert.doesNotMatch(closed, /propose_post_hourly_work/);
  assert.match(closed, /not open here yet/);
  assert.match(closed, /confirmedOneTime/);
  const unsure = repeatingDirection({ verdict: 'unsure' }, true);
  assert.match(unsure, /one job at a fixed price, or paid by the month/);
  const unsureClosed = repeatingDirection({ verdict: 'unsure' }, false);
  assert.match(unsureClosed, /one job at a fixed price/);
  assert.doesNotMatch(unsureClosed, /propose_post_hourly_work/);
});
