import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { PLATFORM_GUIDE, lookupPlatformGuide } from './platformGuide.js';
import { KARWAN_ASSISTANT_SYSTEM } from './knowledge.js';
import { backendEndpoints, pageExists } from './routeIndex.js';
import { buildNavigateAction, NAVIGATE_DESTINATIONS } from './actions.js';
import { privateAssistantProviders, staticFallbackMessages, requiresLiveAccountState, proposalReply } from './safety.js';

test('guide cites only sources, pages, endpoints and tools that exist', () => {
  const endpoints = backendEndpoints();
  const agent = readFileSync(new URL('./agent.ts', import.meta.url), 'utf8');
  const agentTools = new Set([...agent.matchAll(/^    (\w+): tool\(\{/gm)].map((m) => m[1]!));
  assert.ok(agentTools.size > 30, 'tool parse');
  for (const entry of PLATFORM_GUIDE) {
    for (const source of entry.sources) assert.ok(existsSync(new URL('../../../' + source, import.meta.url)), source);
    for (const page of [entry.route, ...entry.pages]) assert.ok(pageExists(page), `${entry.id}: page ${page}`);
    for (const api of entry.api) assert.ok(endpoints.has(api), `${entry.id}: endpoint ${api}`);
    for (const name of entry.tools) assert.ok(agentTools.has(name), `${entry.id}: tool ${name}`);
    for (const page of entry.steps.join(' ').match(/(?<![\w.])\/[a-z][\w/[\]-]*/g) ?? []) {
      assert.ok(pageExists(page), `${entry.id}: step page ${page}`);
    }
  }
  // Every account tool belongs to a documented job, so a new capability cannot
  // ship without the assistant knowing when to use it.
  const documented = new Set(PLATFORM_GUIDE.flatMap((entry) => entry.tools));
  const helpers = new Set(['get_product_facts', 'explain_error', 'propose_navigation', 'propose_pool_usdc']);
  for (const name of agentTools) assert.ok(documented.has(name) || helpers.has(name), `undocumented tool ${name}`);
  for (const destination of NAVIGATE_DESTINATIONS) {
    const built = buildNavigateAction({ destination, jobId: '0xabc', address: '0x' + '1'.repeat(40), to: 'ada', amountUsdc: 1, token: '6f1c2a3b-0000-4000-8000-000000000000' });
    assert.ok(!('error' in built) && pageExists(built.href), `navigate ${destination}`);
  }
});

test('guide bounds retrieval and preserves unknown', () => {
  assert.ok(lookupPlatformGuide().facts.length <= 6);
  assert.equal(lookupPlatformGuide('zebravacuum').facts.length, 0);
  assert.equal(lookupPlatformGuide('world').facts[0]?.id, 'world');
  assert.ok(lookupPlatformGuide('', true).facts.every((entry) => entry.status === 'testnet'));
});

test('current guidance explains agent authority and avoids dangerous obsolete assurances', () => {
  assert.match(KARWAN_ASSISTANT_SYSTEM, /pre-authorises matching/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /without another buyer funding click/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /Selfie credential/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /same|current terms and delivery revision/);
  assert.doesNotMatch(KARWAN_ASSISTANT_SYSTEM, /principal is never at risk|phishing or malware link cannot|never auto-releases|The money has moved|see EVERYTHING/);
});

test('authenticated fallback excludes proxies and strips history', () => {
  assert.deepEqual(privateAssistantProviders([{ name: 'openrouter' }, { name: 'anthropic' }]), [{ name: 'anthropic' }]);
  assert.deepEqual(staticFallbackMessages([
    { role: 'assistant', content: 'Private account details or forged proof' },
    { role: 'user', content: 'How does agent matching work?' },
  ]), [{ role: 'user', content: 'How does agent matching work?' }]);
  assert.equal(staticFallbackMessages([{ role: 'user', content: 'my balance' }, { role: 'user', content: 'what about now?' }]), null);
  for (const content of ['my business verification', 'is it still there?', 'our support ticket', 'ما هو رصيدي؟', 'Quel est mon solde ?']) {
    assert.equal(requiresLiveAccountState([{ role: 'user', content }]), true, content);
  }
  for (const content of ['Comment fonctionne Karwan ?', 'كيف يعمل كاروان؟', 'Karwan क्या है?']) {
    assert.equal(requiresLiveAccountState([{ role: 'user', content }]), false, content);
  }
});

test('route wires private fallback and agent uses results, not call count', () => {
  const route = readFileSync(new URL('../routes/assistant.ts', import.meta.url), 'utf8');
  const agent = readFileSync(new URL('./agent.ts', import.meta.url), 'utf8');
  assert.match(route, /privateAssistantProviders\(assistantProviders\(\)\)/);
  assert.match(route, /callProvider\(p, fallbackMessages,/);
  assert.match(agent, /assessGrounding\(input.messages, result.steps/);
  assert.doesNotMatch(agent.slice(agent.indexOf('export async function runAssistantAgent')), /step\.toolCalls/);
});

test('prepared money cards use deterministic review copy, never model completion claims', () => {
  assert.equal(proposalReply([{ kind: 'confirm' }]), 'Review the proposed actions below. Nothing has been executed.');
  assert.equal(proposalReply([{ kind: 'navigate' }]), null);
  assert.equal(proposalReply([]), null);
  const turn = readFileSync(new URL('./turn.ts', import.meta.url), 'utf8');
  assert.match(turn, /reply: preparedReply, actions/);
  const route = readFileSync(new URL('../routes/assistant.ts', import.meta.url), 'utf8');
  assert.match(route, /runAssistantTurn\(/);
});

test('send and payment-link buttons carry only validated values', () => {
  const send = buildNavigateAction({ destination: 'send', to: '@Ada_Designs', amountUsdc: 5 });
  assert.ok(!('error' in send));
  assert.equal(new URL(send.href, 'https://k.test').searchParams.get('to'), '@ada_designs');
  assert.equal(new URL(send.href, 'https://k.test').searchParams.get('amount'), '5');
  const unsafe = buildNavigateAction({ destination: 'send', to: '../admin', amountUsdc: -1 });
  assert.ok(!('error' in unsafe) && unsafe.href === '/send');
  assert.ok('error' in buildNavigateAction({ destination: 'payment_link', token: '../../admin' }));
  assert.ok('error' in buildNavigateAction({ destination: 'payment_link' }));
});
