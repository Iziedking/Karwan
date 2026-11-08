import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// The page policy report door and its admin summary (view 70).
///
///   npx tsx --test src/routes/cspReport.test.ts

assert.equal(process.env.DATABASE_URL, undefined, 'refusing to run: DATABASE_URL is set');
process.chdir(mkdtempSync(join(tmpdir(), 'karwan-csp-report-')));
process.env.ADMIN_API_TOKEN = 'csp-report-admin-token';

const { cspReportRoutes, pagePolicyAdminRoutes } = await import('./cspReport.js');

const report = (ip: string, body: string, type = 'application/csp-report') => ({
  method: 'POST',
  headers: { 'content-type': type, 'x-real-ip': ip },
  body,
});
const legacy = JSON.stringify({
  'csp-report': { 'effective-directive': 'connect-src', 'blocked-uri': 'https://evil.example/x?wallet=0xabc' },
});

test('a report is accepted with no content and shows on the admin summary by origin only', async () => {
  const res = await cspReportRoutes.request('/', report('10.9.0.1', legacy));
  assert.equal(res.status, 204);
  const modern = JSON.stringify([{ type: 'csp-violation', body: { effectiveDirective: 'script-src-elem', blockedURL: 'inline' } }]);
  assert.equal((await cspReportRoutes.request('/', report('10.9.0.1', modern, 'application/reports+json'))).status, 204);

  const summary = await pagePolicyAdminRoutes.request('/page-policy', { headers: { 'x-admin-token': 'csp-report-admin-token' } });
  assert.equal(summary.status, 200);
  const body = (await summary.json()) as { total: number; blocked: { directive: string; blocked: string; count: number }[] };
  assert.equal(body.total, 2);
  assert.deepEqual(
    body.blocked.map((b) => `${b.directive} ${b.blocked} ${b.count}`).sort(),
    ['connect-src https://evil.example 1', 'script-src-elem inline 1'],
  );
  assert.ok(!JSON.stringify(body).includes('wallet=0xabc'));
});

test('the admin summary needs the admin', async () => {
  assert.equal((await pagePolicyAdminRoutes.request('/page-policy')).status, 401);
});

test('a report that is not JSON is refused', async () => {
  assert.equal((await cspReportRoutes.request('/', report('10.9.0.2', 'not json'))).status, 400);
});

test('a report over 64 KB is refused before it is read', async () => {
  const res = await cspReportRoutes.request('/', report('10.9.0.3', 'x'.repeat(64 * 1024 + 1)));
  assert.equal(res.status, 413);
});

test('one address can send 60 reports in 10 minutes', async () => {
  for (let i = 0; i < 60; i++) {
    assert.equal((await cspReportRoutes.request('/', report('10.9.0.4', legacy))).status, 204, `report ${i + 1}`);
  }
  assert.equal((await cspReportRoutes.request('/', report('10.9.0.4', legacy))).status, 429);
});
