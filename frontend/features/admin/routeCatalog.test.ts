import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOURCE_ROUTE_SNAPSHOT,
  filterAdminRoutes,
  normalizeAdminRoute,
  workspaceForRoute,
} from './routeCatalog';

test('generated snapshot captures a unique mounted backend inventory', () => {
  assert.ok(SOURCE_ROUTE_SNAPSHOT.length >= 300);
  assert.equal(new Set(SOURCE_ROUTE_SNAPSHOT.map((route) => route.id)).size, SOURCE_ROUTE_SNAPSHOT.length);
  assert.ok(SOURCE_ROUTE_SNAPSHOT.some((route) => route.id === 'GET /api/admin/route-catalog'));
  assert.ok(SOURCE_ROUTE_SNAPSHOT.some((route) => route.path === '/api/circle/webhook'));
});

test('route classification is honest about access and mutation risk', () => {
  assert.equal(normalizeAdminRoute('GET', '/health').access, 'public');
  assert.equal(normalizeAdminRoute('POST', '/api/circle/webhook').risk, 'ingress');
  assert.equal(normalizeAdminRoute('DELETE', '/api/admin/team-keys/:id').risk, 'destructive');
  assert.equal(normalizeAdminRoute('GET', '/api/admin/support').access, 'support');
});

test('routes resolve to the nearest reviewed operator workspace', () => {
  assert.deepEqual(workspaceForRoute('/api/admin/disputes/:jobId/prepare'), {
    href: '/admin/disputes',
    label: 'Dispute desk',
  });
  assert.equal(workspaceForRoute('/api/auth/bootstrap'), null);
});

test('route catalog filters by search, access, and risk', () => {
  const result = filterAdminRoutes(SOURCE_ROUTE_SNAPSHOT, {
    query: 'team',
    access: 'admin',
    risk: 'destructive',
  });
  assert.ok(result.length > 0);
  assert.ok(result.every((route) => route.access === 'admin' && route.risk === 'destructive'));
});
