import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCsp, cspHeaderName, cspMode, makeNonce, originsOf } from './csp';

/// The page policy (view 70).
///
///   npx tsx --test shared/security/csp.test.ts

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values] as [string, string[]];
      }),
  );
}

const base = {
  nonce: 'abc123',
  apiOrigin: 'https://api.karwan.site',
  extraConnect: ['https://dedicated-rpc.example'],
  reportUrl: 'https://api.karwan.site/api/security/csp-report',
};

test('scripts run only with this load’s nonce and what they load', () => {
  const d = directives(buildCsp(base));
  const script = d.get('script-src') ?? [];
  assert.ok(script.includes("'nonce-abc123'"));
  assert.ok(script.includes("'strict-dynamic'"));
  assert.ok(script.includes("'wasm-unsafe-eval'"));
  assert.ok(!script.includes("'unsafe-eval'"));
  assert.ok(!script.some((s) => s.startsWith("'nonce-") && s !== "'nonce-abc123'"));
});

test('the page talks only to itself, the API and the named hosts', () => {
  const d = directives(buildCsp(base));
  const connect = d.get('connect-src') ?? [];
  assert.equal(connect[0], "'self'");
  assert.ok(connect.includes('https://api.karwan.site'));
  assert.ok(connect.includes('https://dedicated-rpc.example'));
  assert.ok(connect.includes('https://rpc.testnet.arc.io'));
  assert.ok(connect.includes('wss://relay.walletconnect.org'));
  assert.ok(!connect.includes('https:'), 'no blanket https');
  assert.ok(!connect.includes('*'));
  assert.equal(new Set(connect).size, connect.length, 'no repeats');
});

test('the four rules enforced today stay, and nothing else is left open', () => {
  const d = directives(buildCsp(base));
  assert.deepEqual(d.get('default-src'), ["'self'"]);
  assert.deepEqual(d.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(d.get('object-src'), ["'none'"]);
  assert.deepEqual(d.get('base-uri'), ["'self'"]);
  assert.deepEqual(d.get('form-action'), ["'self'"]);
  assert.deepEqual(d.get('img-src'), ["'self'", 'data:', 'blob:', 'https:']);
  assert.deepEqual(d.get('worker-src'), ["'self'", 'blob:']);
  assert.deepEqual(d.get('report-uri'), ['https://api.karwan.site/api/security/csp-report']);
  assert.deepEqual(d.get('report-to'), ['csp']);
});

test('with no API host and no report address the policy still holds', () => {
  const d = directives(buildCsp({ nonce: 'n', apiOrigin: null, extraConnect: [], reportUrl: null }));
  assert.equal(d.has('report-uri'), false);
  assert.equal(d.has('report-to'), false);
  assert.equal((d.get('connect-src') ?? [])[0], "'self'");
});

test('a nonce is new every time and safe inside a header', () => {
  const a = makeNonce();
  const b = makeNonce();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
});

test('the policy is enforced only when the switch says exactly enforce', () => {
  assert.equal(cspMode(undefined), 'report');
  assert.equal(cspMode(''), 'report');
  assert.equal(cspMode('Enforce '), 'enforce');
  assert.equal(cspMode('on'), 'report');
  assert.equal(cspHeaderName('report'), 'Content-Security-Policy-Report-Only');
  assert.equal(cspHeaderName('enforce'), 'Content-Security-Policy');
});

test('only real http and websocket origins from settings are added', () => {
  assert.deepEqual(
    originsOf(['https://a.example/rpc?key=1', 'wss://b.example/ws', undefined, '', 'javascript:alert(1)', 'not a url', "https://c.example'; script-src *"]),
    ['https://a.example', 'wss://b.example'],
  );
});
