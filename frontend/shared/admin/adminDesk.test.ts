import assert from 'node:assert/strict';
import test from 'node:test';
import { adminApiUrl, adminGate, adminProxyTarget } from './adminDesk';

///   npx tsx --test shared/admin/adminDesk.test.ts

const ADMIN = 'admin.karwan.site';

test('the public site has no admin desk', () => {
  for (const pathname of ['/admin', '/admin/deals', '/api/admin-proxy/api/admin/deals']) {
    assert.equal(adminGate({ host: 'karwan.site', pathname, adminHost: ADMIN, production: true }), 'not-found', pathname);
  }
  assert.equal(adminGate({ host: 'karwan.site', pathname: '/app', adminHost: ADMIN, production: true }), 'pass');
  assert.equal(adminGate({ host: 'karwan.site', pathname: '/administer-nothing', adminHost: ADMIN, production: true }), 'pass');
});

test('on the admin address the desk needs Cloudflare’s pass, and the bare address opens the desk', () => {
  assert.equal(adminGate({ host: 'admin.karwan.site', pathname: '/admin/deals', adminHost: ADMIN, production: true }), 'check-pass');
  assert.equal(adminGate({ host: 'ADMIN.karwan.site:443', pathname: '/api/admin-proxy/api/admin/x', adminHost: ADMIN, production: true }), 'check-pass');
  assert.equal(adminGate({ host: 'admin.karwan.site', pathname: '/', adminHost: ADMIN, production: true }), 'to-desk');
});

test('in production with no admin address set, the desk is shut everywhere', () => {
  assert.equal(adminGate({ host: 'karwan.site', pathname: '/admin', adminHost: undefined, production: true }), 'not-found');
  assert.equal(adminGate({ host: 'localhost', pathname: '/admin', adminHost: undefined, production: false }), 'pass');
});

test('the proxy forwards only the routes the desk calls', () => {
  assert.equal(adminProxyTarget(['api', 'admin', 'deals', '0xabc', 'release']), '/api/admin/deals/0xabc/release');
  assert.equal(adminProxyTarget(['api', 'feedback']), '/api/feedback');
  assert.equal(adminProxyTarget(['api', 'feedback', 'f1', 'status']), '/api/feedback/f1/status');
  assert.equal(adminProxyTarget(['api', 'feedback', 'f1', 'asset', '0']), '/api/feedback/f1/asset/0');
  assert.equal(adminProxyTarget(['api', 'listings', 'l1', 'photos', 'clear']), '/api/listings/l1/photos/clear');
  assert.equal(adminProxyTarget(['api', 'financier', 'admin', 'review']), '/api/financier/admin/review');
  for (const bad of [
    ['api', 'deals', 'direct'],
    ['api', 'auth', 'session'],
    ['api', 'admin', '..', 'auth'],
    ['api', 'admin', 'a%2F..'.replace('%2F', '/')],
    ['api', 'listings', 'l1'],
    ['api', 'feedback', 'f1', 'asset', 'x'],
    [],
  ]) {
    assert.equal(adminProxyTarget(bad), null, bad.join('/'));
  }
});

test('desk calls go to the same-origin proxy', () => {
  assert.equal(adminApiUrl('/api/admin/usyc'), '/api/admin-proxy/api/admin/usyc');
});
