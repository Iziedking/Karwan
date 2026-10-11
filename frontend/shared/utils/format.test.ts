import assert from 'node:assert/strict';
import test from 'node:test';
import { relativeTime } from './format';

const DAY = 86_400_000;
const rtf = (locale: string) => new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });

test('relative times are written in the reader’s language', () => {
  const past = Date.now() - 13 * DAY;
  const future = Date.now() + 17 * DAY + 60_000;
  assert.equal(relativeTime(past, 'en'), rtf('en').format(-13, 'day'));
  assert.equal(relativeTime(future, 'fr'), rtf('fr').format(17, 'day'));
  const arabic = relativeTime(past, 'ar');
  assert.match(arabic, /[؀-ۿ]/);
  assert.doesNotMatch(arabic, /ago|\bd\b/);
  assert.notEqual(relativeTime(past, 'sw'), relativeTime(past, 'en'));
});

test('seconds-old moments read as now, and seconds take the largest whole unit', () => {
  assert.equal(relativeTime(Date.now() - 5_000, 'en'), rtf('en').format(0, 'second'));
  assert.equal(relativeTime(Date.now() - 3 * 3_600_000, 'hi'), rtf('hi').format(-3, 'hour'));
  assert.equal(relativeTime(Math.floor((Date.now() - 2 * 60_000) / 1000), 'en'), rtf('en').format(-2, 'minute'), 'unix seconds are read as seconds');
});
