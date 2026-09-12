import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { PLATFORM_GUIDE, lookupPlatformGuide } from './platformGuide.js';
import { KARWAN_ASSISTANT_SYSTEM } from './knowledge.js';
import { privateAssistantProviders, staticFallbackMessages, requiresLiveAccountState, proposalReply } from './safety.js';

test('guide references existing sources and routes, bounds retrieval and preserves unknown', () => {
  for (const entry of PLATFORM_GUIDE) {
    for (const source of entry.sources) assert.ok(existsSync(new URL('../../../' + source, import.meta.url)), source);
    const route = entry.route.split('?')[0];
    assert.ok(existsSync(new URL('../../../frontend/app' + route + '/page.tsx', import.meta.url)), route);
  }
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
  const route = readFileSync(new URL('../routes/assistant.ts', import.meta.url), 'utf8');
  assert.match(route, /reply: preparedReply, actions/);
});
