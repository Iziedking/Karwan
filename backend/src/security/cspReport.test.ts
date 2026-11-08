import assert from 'node:assert/strict';
import test from 'node:test';
import { addCounts, blockedOrigin, parseCspReports, summarise, MAX_KEYS_PER_DAY } from './cspReport.js';

/// What the page policy blocked, counted by rule and origin (view 70).
///
///   npx tsx --test src/security/cspReport.test.ts

test('the old report-uri shape and the Reporting API shape both parse', () => {
  const legacy = {
    'csp-report': {
      'document-uri': 'https://karwan.site/deals/abc?ref=secret',
      'effective-directive': 'connect-src',
      'blocked-uri': 'https://evil.example/collect?wallet=0xabc',
    },
  };
  const modern = [
    { type: 'csp-violation', body: { effectiveDirective: 'script-src-elem', blockedURL: 'inline' } },
    { type: 'deprecation', body: { id: 'x' } },
  ];
  assert.deepEqual(parseCspReports(legacy), [{ directive: 'connect-src', blocked: 'https://evil.example' }]);
  assert.deepEqual(parseCspReports(modern), [{ directive: 'script-src-elem', blocked: 'inline' }]);
});

test('anything that is not a report gives nothing', () => {
  assert.deepEqual(parseCspReports(null), []);
  assert.deepEqual(parseCspReports({ hello: 1 }), []);
  assert.deepEqual(parseCspReports([{ type: 'csp-violation', body: {} }]), []);
});

test('only the origin of a blocked address is kept, never its path or query', () => {
  assert.equal(blockedOrigin('https://evil.example/a/b?token=1'), 'https://evil.example');
  assert.equal(blockedOrigin('wss://relay.walletconnect.org/?projectId=1'), 'wss://relay.walletconnect.org');
  assert.equal(blockedOrigin('inline'), 'inline');
  assert.equal(blockedOrigin('eval'), 'eval');
  assert.equal(blockedOrigin('data'), 'data');
  assert.equal(blockedOrigin('blob:https://karwan.site/123'), 'blob');
  assert.equal(blockedOrigin(''), 'other');
  assert.equal(blockedOrigin('not a url'), 'other');
});

test('a directive name is kept only when it looks like one', () => {
  const out = parseCspReports({ 'csp-report': { 'violated-directive': '<b>x</b>', 'blocked-uri': 'inline' } });
  assert.deepEqual(out, [{ directive: 'other', blocked: 'inline' }]);
});

test('counts add up per day, and a day holds a bounded number of keys', () => {
  let day = addCounts({}, [
    { directive: 'connect-src', blocked: 'https://a.example' },
    { directive: 'connect-src', blocked: 'https://a.example' },
  ]);
  assert.deepEqual(day, { 'connect-src https://a.example': 2 });
  const many = Array.from({ length: MAX_KEYS_PER_DAY + 10 }, (_, i) => ({ directive: 'img-src', blocked: `https://h${i}.example` }));
  day = addCounts(day, many);
  assert.equal(Object.keys(day).length, MAX_KEYS_PER_DAY);
  assert.equal(day['connect-src https://a.example'], 2);
});

test('the summary covers the last 30 days, busiest first', () => {
  const days = [
    { key: '2026-11-08', data: { 'connect-src https://a.example': 3, 'script-src-elem inline': 1 } },
    { key: '2026-11-01', data: { 'connect-src https://a.example': 2 } },
    { key: '2026-09-30', data: { 'frame-src https://old.example': 9 } },
  ];
  assert.deepEqual(summarise(days, '2026-11-08'), {
    since: '2026-10-10',
    total: 6,
    blocked: [
      { directive: 'connect-src', blocked: 'https://a.example', count: 5, lastSeen: '2026-11-08' },
      { directive: 'script-src-elem', blocked: 'inline', count: 1, lastSeen: '2026-11-08' },
    ],
  });
});
