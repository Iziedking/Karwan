import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOperatorRouteCatalog } from './routeCatalog.js';

test('buildOperatorRouteCatalog deduplicates endpoints and excludes middleware', () => {
  const routes = buildOperatorRouteCatalog([
    { method: 'ALL', path: '/api/admin/*' },
    { method: 'get', path: '/api/admin/health' },
    { method: 'GET', path: '/api/admin/health' },
    { method: 'delete', path: '/api/admin/team-keys/:id' },
  ]);

  assert.deepEqual(routes, [
    {
      id: 'GET /api/admin/health',
      method: 'GET',
      path: '/api/admin/health',
      family: 'health',
      access: 'admin',
      risk: 'read',
    },
    {
      id: 'DELETE /api/admin/team-keys/:id',
      method: 'DELETE',
      path: '/api/admin/team-keys/:id',
      family: 'team-keys',
      access: 'admin',
      risk: 'destructive',
    },
  ]);
});

test('buildOperatorRouteCatalog distinguishes public, service, and application routes', () => {
  const routes = buildOperatorRouteCatalog([
    { method: 'GET', path: '/health' },
    { method: 'POST', path: '/api/circle/webhook' },
    { method: 'POST', path: '/api/deals' },
    { method: 'GET', path: '/api/admin/support/whoami' },
  ]);

  assert.equal(routes.find((route) => route.path === '/health')?.access, 'public');
  assert.equal(routes.find((route) => route.path === '/api/circle/webhook')?.risk, 'ingress');
  assert.equal(routes.find((route) => route.path === '/api/deals')?.access, 'application');
  assert.equal(routes.find((route) => route.path.includes('/support/'))?.access, 'support');
});
