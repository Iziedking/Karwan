import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearCookies, cookiesAfter, deskBackend, readDeskCookies, refusesChange, sessionCookies } from './deskCookies';

test('the session cookies close with the browser and no page script can read them', () => {
  const [session, net] = sessionCookies('tok', 'mainnet');
  for (const c of [session!, net!]) {
    assert.match(c, /HttpOnly/);
    assert.match(c, /Secure/);
    assert.match(c, /SameSite=Strict/);
    assert.match(c, /Path=\//);
    assert.doesNotMatch(c, /Max-Age|Expires/);
  }
  assert.ok(session!.startsWith('karwan_desk=tok;'));
  assert.ok(net!.startsWith('karwan_desk_net=mainnet;'));
});

test('signing out clears both cookies', () => {
  const cleared = clearCookies();
  assert.equal(cleared.length, 2);
  for (const c of cleared) assert.match(c, /Max-Age=0/);
  assert.ok(cleared.some((c) => c.startsWith('karwan_desk=;')));
  assert.ok(cleared.some((c) => c.startsWith('karwan_desk_net=;')));
});

test('a refused session clears the cookies; a renewed one replaces the session', () => {
  assert.deepEqual(cookiesAfter(401, null, 'testnet'), clearCookies());
  const renewed = cookiesAfter(200, 'b', 'mainnet');
  assert.equal(renewed.length, 1);
  assert.ok(renewed[0]!.startsWith('karwan_desk=b;'));
  assert.deepEqual(cookiesAfter(200, null, 'testnet'), []);
});

test('mainnet has no server until its address is set', () => {
  assert.equal(deskBackend('mainnet', {}), null);
  assert.equal(deskBackend('mainnet', { ADMIN_MAINNET_BACKEND_URL: 'https://mainnet-api.karwan.site/' }), 'https://mainnet-api.karwan.site');
  assert.equal(deskBackend('testnet', { NEXT_PUBLIC_BACKEND_URL: 'https://api.karwan.site' }), 'https://api.karwan.site');
  assert.equal(deskBackend('testnet', {}), 'http://localhost:8787');
});

test('a change must carry the desk header; reads need nothing', () => {
  assert.equal(refusesChange('POST', new Headers()), true);
  assert.equal(refusesChange('DELETE', new Headers()), true);
  assert.equal(refusesChange('POST', new Headers({ 'x-karwan-desk': '1' })), false);
  assert.equal(refusesChange('GET', new Headers()), false);
});

test('the cookies are read back; an unknown network reads as testnet', () => {
  assert.deepEqual(readDeskCookies('a=1; karwan_desk=tok; karwan_desk_net=mainnet'), { token: 'tok', net: 'mainnet' });
  assert.deepEqual(readDeskCookies('karwan_desk_net=moon'), { token: null, net: 'testnet' });
  assert.deepEqual(readDeskCookies(null), { token: null, net: 'testnet' });
});
