import assert from 'node:assert/strict';
import test from 'node:test';
import { apiCallsFromSource, classifyGuard, findRoute, pageProblems, type BackendRoute } from './pageRouteMap';

///   npx tsx --test scripts/pageRouteMap.test.ts

const API = `
export const api = {
  baseUrl: BASE,
  deal: (jobId: string, caller?: string | null) => json<X>(withCaller(\`/api/deals/direct/\${jobId}\`, caller)),
  fund: (jobId: string) => json<X>(\`/api/deals/direct/\${jobId}/fund\`, { method: 'POST', body: '{}' }),
  rates: () => json<X>('/api/money/rates?fresh=1'),
  gone: () => json<X>('/api/old/thing', { method: 'DELETE' }),
  open: (token: string) => json<X>(\`/api/pay/\${token}/open\`, { method: 'POST' }),
  feedback: () => json<X>('/api/feedback', { method: 'POST' }),
  built: (kind: string) => { const path = \`/api/\${kind}/list\`; return json<X>(path); },
};
`;

const routes: BackendRoute[] = [
  { method: 'GET', path: '/api/deals/direct/:jobId', guard: 'session' },
  { method: 'POST', path: '/api/deals/direct/:jobId/fund', guard: 'step-up' },
  { method: 'GET', path: '/api/money/rates', guard: 'none' },
  { method: 'POST', path: '/api/pay/:token/open', guard: 'none' },
  { method: 'POST', path: '/api/feedback', guard: 'limited' },
];

test('api methods resolve to a method and a path pattern', () => {
  const calls = apiCallsFromSource(API);
  assert.deepEqual(calls.get('deal'), [{ method: 'GET', path: '/api/deals/direct/:' }]);
  assert.deepEqual(calls.get('fund'), [{ method: 'POST', path: '/api/deals/direct/:/fund' }]);
  assert.deepEqual(calls.get('rates'), [{ method: 'GET', path: '/api/money/rates' }]);
  assert.deepEqual(calls.get('built'), [{ method: 'GET', path: '/api/:/list' }]);
  assert.equal(calls.has('baseUrl'), false);
});

test('a call matches a backend route whatever its params are named', () => {
  assert.equal(findRoute({ method: 'POST', path: '/api/deals/direct/:/fund' }, routes)?.guard, 'step-up');
  assert.equal(findRoute({ method: 'GET', path: '/api/deals/direct/:/fund' }, routes), null);
});

test('a page that calls a route the backend does not have fails', () => {
  const problems = pageProblems([{ page: '/broken', calls: ['gone'] }], apiCallsFromSource(API), routes, new Map());
  assert.deepEqual(problems, [{ page: '/broken', api: 'gone', route: 'DELETE /api/old/thing', problem: 'missing route' }]);
});

test('a page that calls a mutation with no guard fails unless it is allowed with a reason', () => {
  const calls = apiCallsFromSource(API);
  const pages = [{ page: '/pay/[token]', calls: ['open', 'rates', 'deal', 'fund'] }];
  assert.deepEqual(pageProblems(pages, calls, routes, new Map()), [
    { page: '/pay/[token]', api: 'open', route: 'POST /api/pay/:token/open', problem: 'mutation without a guard' },
  ]);
  assert.deepEqual(pageProblems(pages, calls, routes, new Map([['POST /api/pay/:token/open', 'the link token is the credential']])), []);
});

test('a public write that is only rate limited still needs a reason', () => {
  const calls = apiCallsFromSource(API);
  const pages = [{ page: '/feedback', calls: ['feedback'] }];
  assert.equal(pageProblems(pages, calls, routes, new Map())[0]?.problem, 'mutation without a guard');
  assert.deepEqual(pageProblems(pages, calls, routes, new Map([['POST /api/feedback', 'public form, 10 an hour']])), []);
});

test('guards are read from the handler and the helpers it calls', () => {
  assert.equal(classifyGuard('const s = deps.session(c); if (!s) return c.json({ error: "not authenticated" }, 401);', '/x'), 'session');
  assert.equal(classifyGuard('requirePresence(c, { action: "payout" }); readSession(c)', '/x'), 'step-up');
  assert.equal(classifyGuard('if (!ownTicket(c, id)) return c.json({ error: "not-found" }, 404);', '/:id/close'), 'token');
  assert.equal(classifyGuard('requireAdmin', '/api/admin/x'), 'admin');
  assert.equal(classifyGuard('verifyWebhookSignature(body)', '/hook'), 'signed');
  assert.equal(classifyGuard('return c.json(await rates())', '/api/money/rates'), 'none');
  assert.equal(classifyGuard('if (!deps.isSelf(c, address)) return c.json({}, 403)', '/x'), 'session');
  assert.equal(classifyGuard('const t = useTicket(body.ticket, true)', '/api/recovery/release'), 'token');
  assert.equal(classifyGuard("post('/', rateLimit({ max: 10 }), handler)", '/api/feedback'), 'limited');
});
