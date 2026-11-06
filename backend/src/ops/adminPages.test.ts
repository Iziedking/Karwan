import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanPages, mayCall, routeRule } from './adminPages.js';

///   npx tsx --test src/ops/adminPages.test.ts

const snapshot = readFileSync(resolve(process.cwd(), '../frontend/features/admin/backendRouteSnapshot.generated.ts'), 'utf8');
const ADMIN_OUTSIDE = ['GET /api/feedback', 'POST /api/feedback/:id/status', 'POST /api/listings/:id/photos/clear', 'POST /api/financier/admin/review'];
const adminRoutes = [
  ...[...snapshot.matchAll(/\{ method: "([A-Z]+)", path: "(\/api\/admin[^"]*)" \}/g)].map((m) => `${m[1]} ${m[2]}`),
  ...ADMIN_OUTSIDE,
];

test('every admin route belongs to a page, the owner, or every member', () => {
  assert.ok(adminRoutes.length > 100);
  const orphans = adminRoutes.filter((line) => {
    const [method, path] = line.split(' ');
    return routeRule(method!, path!.replace(/:[^/]+/g, 'x')).kind === 'none';
  });
  assert.deepEqual(orphans, []);
});

const member = (pages: string[]) => ({ owner: false, pages });

test('a member reaches only the routes their ticked pages use', () => {
  const support = member(['support']);
  assert.equal(mayCall(support, 'GET', '/api/admin/support'), true);
  assert.equal(mayCall(support, 'POST', '/api/admin/support/t1/reply'), true);
  assert.equal(mayCall(support, 'POST', '/api/admin/deals/0xabc/release'), false);
  assert.equal(mayCall(support, 'POST', '/api/admin/usyc/run'), false);
  assert.equal(mayCall(member(['deals']), 'POST', '/api/admin/deals/0xabc/force-cancel'), true);
  assert.equal(mayCall(member(['usyc']), 'POST', '/api/admin/usyc/cover'), true);
  assert.equal(mayCall(member([]), 'GET', '/api/admin/health'), false);
  assert.equal(mayCall(member(['payments']), 'GET', '/api/admin/events'), true);
});

test('access, team accounts and team keys are the owner’s alone', () => {
  const everything = member(cleanPages(['overview', 'deals', 'support', 'usyc', 'treasury', 'log', 'routes', 'diagnostics']));
  for (const [m, p] of [
    ['PUT', '/api/admin/access/m1'],
    ['POST', '/api/admin/access/m1/revoke'],
    ['POST', '/api/admin/team-members/invites'],
    ['POST', '/api/admin/team-keys'],
  ] as const) {
    assert.equal(mayCall(everything, m, p), false, `${m} ${p}`);
    assert.equal(mayCall({ owner: true, pages: [] }, m, p), true, `${m} ${p}`);
  }
});

test('any member reads their session and manages their own keys', () => {
  assert.equal(mayCall(member([]), 'GET', '/api/admin/session'), true);
  assert.equal(mayCall(member([]), 'POST', '/api/admin/keys'), true);
});

test('a route nobody listed is refused for members', () => {
  assert.equal(mayCall(member(['deals', 'support']), 'POST', '/api/admin/something-new'), false);
});

test('unknown page keys are dropped when the owner saves ticks', () => {
  assert.deepEqual(cleanPages(['support', 'access', 'deals', 'support', 'nope']), ['deals', 'support']);
});
