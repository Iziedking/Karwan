import assert from 'node:assert/strict';
import test from 'node:test';
import { blockingAdvisories, gateProblems, staleEntries, type AuditReport } from './auditGate';

/// The dependency gate (view 69): a critical or high advisory must be listed,
/// with an expiry that has not passed.
///
///   npx tsx --test scripts/auditGate.test.ts

const NEXT = {
  source: 1,
  name: 'next',
  title: 'Next.js has cache poisoning of SSG and ISR pages in self-hosted applications',
  url: 'https://github.com/advisories/GHSA-4jqv-mc3x-m676',
  severity: 'critical',
  range: '>=10.0.0 <15.5.28',
};
const WS = {
  source: 2,
  name: 'ws',
  title: 'ws: Uninitialized memory disclosure',
  url: 'https://github.com/advisories/GHSA-58qx-3vcg-4xpx',
  severity: 'high',
  range: '>=8.0.0 <8.20.2',
};
const LOW = {
  source: 3,
  name: 'cookie',
  title: 'cookie accepts out of bounds characters',
  url: 'https://github.com/advisories/GHSA-pxg6-pf52-xh8x',
  severity: 'low',
  range: '<0.7.0',
};

const report: AuditReport = {
  vulnerabilities: {
    next: { name: 'next', severity: 'critical', via: [NEXT] },
    ws: { name: 'ws', severity: 'high', via: [WS] },
    '@reown/appkit': { name: '@reown/appkit', severity: 'high', via: ['ws'] },
    '@wagmi/connectors': { name: '@wagmi/connectors', severity: 'high', via: ['@reown/appkit', WS] },
    cookie: { name: 'cookie', severity: 'low', via: [LOW] },
  },
};

test('only the critical and high advisories block, each once, named by its GHSA id', () => {
  assert.deepEqual(blockingAdvisories(report), [
    { id: 'GHSA-4jqv-mc3x-m676', package: 'next', severity: 'critical', title: NEXT.title },
    { id: 'GHSA-58qx-3vcg-4xpx', package: 'ws', severity: 'high', title: WS.title },
  ]);
});

test('an advisory missing from the accepted list fails the gate', () => {
  const accepted = [{ id: 'GHSA-58qx-3vcg-4xpx', package: 'ws', expires: '2026-12-08' }];
  assert.deepEqual(gateProblems('root', report, accepted, '2026-11-08'), [
    'root: critical GHSA-4jqv-mc3x-m676 in next is not accepted (Next.js has cache poisoning of SSG and ISR pages in self-hosted applications)',
  ]);
});

test('an accepted advisory whose expiry has passed fails the gate', () => {
  const accepted = [
    { id: 'GHSA-4jqv-mc3x-m676', package: 'next', expires: '2026-12-08' },
    { id: 'GHSA-58qx-3vcg-4xpx', package: 'ws', expires: '2026-11-07' },
  ];
  assert.deepEqual(gateProblems('backend', report, accepted, '2026-11-08'), [
    'backend: high GHSA-58qx-3vcg-4xpx in ws was accepted until 2026-11-07, review it again',
  ]);
});

test('the expiry day itself still passes', () => {
  const accepted = [
    { id: 'GHSA-4jqv-mc3x-m676', package: 'next', expires: '2026-11-08' },
    { id: 'GHSA-58qx-3vcg-4xpx', package: 'ws', expires: '2026-11-08' },
  ];
  assert.deepEqual(gateProblems('root', report, accepted, '2026-11-08'), []);
});

test('an entry that no lockfile reports any more is stale', () => {
  const accepted = [
    { id: 'GHSA-58qx-3vcg-4xpx', package: 'ws', expires: '2026-12-08' },
    { id: 'GHSA-gone-gone-gone', package: 'axios', expires: '2026-12-08' },
  ];
  assert.deepEqual(staleEntries([report], accepted), [
    { id: 'GHSA-gone-gone-gone', package: 'axios', expires: '2026-12-08' },
  ]);
});
