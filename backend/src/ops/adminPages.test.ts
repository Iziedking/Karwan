import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { accessFor, allows, cleanPages, levelForRoute, mayCall, routeRule } from './adminPages.js';

///   npx tsx --test src/ops/adminPages.test.ts

const snapshot = readFileSync(resolve(process.cwd(), '../frontend/features/admin/backendRouteSnapshot.generated.ts'), 'utf8');
const ADMIN_OUTSIDE = ['GET /api/feedback', 'POST /api/feedback/:id/status', 'POST /api/listings/:id/photos/clear', 'POST /api/listings/:id/remove', 'POST /api/financier/admin/review'];
/// Sign-in itself: behind Cloudflare Access, before any session or page.
const BEFORE_SIGN_IN = new Set(['POST /api/admin/session']);
const adminRoutes = [
  ...[...snapshot.matchAll(/\{ method: "([A-Z]+)", path: "(\/api\/admin[^"]*)" \}/g)].map((m) => `${m[1]} ${m[2]}`),
  ...ADMIN_OUTSIDE,
];

test('every admin route belongs to a page, the owner, or every member', () => {
  assert.ok(adminRoutes.length > 100);
  const orphans = adminRoutes.filter((line) => {
    if (BEFORE_SIGN_IN.has(line)) return false;
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
  assert.equal(mayCall(member(['payments']), 'POST', '/api/admin/events/backfill'), false, 'payments only reads events');
  assert.equal(mayCall(member(['events']), 'POST', '/api/admin/events/backfill'), true);
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

// ---------------------------------------------------------------- levels (view 79)

test('a stored page list reads as fix, what a tick allowed before levels; levels win when both exist', () => {
  assert.deepEqual(accessFor({ deskPages: ['deals', 'nope'] }), { deals: 'fix' });
  assert.deepEqual(accessFor({ deskPages: ['deals'], deskAccess: { deals: 'read', support: 'fix' } }), { deals: 'read', support: 'fix' });
  assert.deepEqual(accessFor({ deskAccess: { deals: 'admin' as never, nope: 'fix' } }), {});
});

test('levels include each other', () => {
  assert.equal(allows({ deals: 'fix' }, 'deals', 'read'), true);
  assert.equal(allows({ deals: 'fix' }, 'deals', 'change'), true);
  assert.equal(allows({ deals: 'change' }, 'deals', 'fix'), false);
  assert.equal(allows({ deals: 'read' }, 'deals', 'change'), false);
  assert.equal(allows({}, 'deals', 'read'), false);
});

test('the route decides the level', () => {
  assert.equal(levelForRoute('GET', '/api/admin/deals'), 'read');
  assert.equal(levelForRoute('POST', '/api/admin/form-limits'), 'change');
  assert.equal(levelForRoute('POST', '/api/admin/deals/0xabc/force-cancel'), 'fix');
  assert.equal(levelForRoute('POST', '/api/admin/deals/0xabc/release'), 'fix');
  assert.equal(levelForRoute('POST', '/api/admin/usyc/run'), 'fix');
});

test('every route behind two people needs the fix level', () => {
  const sources = [['admin.ts', ''], ['adminUsyc.ts', '/usyc']] as const;
  let seen = 0;
  for (const [file, prefix] of sources) {
    const src = readFileSync(resolve(process.cwd(), 'src/routes', file), 'utf8');
    for (const m of src.matchAll(/\.(post|put|patch|delete)\('([^']+)',\s*twoPeople\(/g)) {
      seen++;
      const path = `/api/admin${prefix}${m[2]!.replace(/:[^/]+/g, 'x')}`;
      assert.equal(levelForRoute(m[1]!.toUpperCase(), path), 'fix', path);
    }
  }
  assert.ok(seen >= 9, `found ${seen}`);
});

test('a member at read reaches the reads of a page and none of its changes', () => {
  const reader = { owner: false, access: { deals: 'read' as const } };
  assert.equal(mayCall(reader, 'GET', '/api/admin/deals'), true);
  assert.equal(mayCall(reader, 'POST', '/api/admin/deals/0xabc/release'), false);
  const changer = { owner: false, access: { deals: 'change' as const } };
  assert.equal(mayCall(changer, 'POST', '/api/admin/deals/0xabc/release'), false);
  const fixer = { owner: false, access: { deals: 'fix' as const } };
  assert.equal(mayCall(fixer, 'POST', '/api/admin/deals/0xabc/release'), true);
});
