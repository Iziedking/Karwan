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
  const agent = ['./agent.ts', './dealTools.ts', './verificationTools.ts', './networkTools.ts', './directDealTools.ts', './chatTools.ts', './locationTools.ts', './messageTools.ts', './ratingTools.ts', './counterpartyTools.ts', './memoryTools.ts', './passportShareTools.ts', './financeTools.ts', './contestTools.ts', './workTools.ts', './moneyTools.ts', './accountTools.ts', './dealLink.ts'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  const agentTools =new Set([...agent.matchAll(/^    (\w+): tool\(\{/gm)].map((m) => m[1]!));
  assert.ok(agentTools.size > 30, 'tool parse');
  // Descriptions and error text tell the model which tool to call next, so
  // every tool they name has to exist too.
  for (const [name] of agent.matchAll(/\b(?:list|propose|get|ask|whats)_[a-z_]+\b/g)) assert.ok(agentTools.has(name), `named tool ${name}`);
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
    const built = buildNavigateAction({ destination, jobId: '0xabc', address: '0x' + '1'.repeat(40), to: 'ada', amountUsdc: 1, token: '6f1c2a3b-0000-4000-8000-000000000000', listingId: 'lst_0123456789abcdef' });
    assert.ok(!('error' in built) && pageExists(built.href), `navigate ${destination}`);
  }
});

test('guide bounds retrieval and preserves unknown', () => {
  assert.ok(lookupPlatformGuide().facts.length <= 6);
  assert.equal(lookupPlatformGuide('zebravacuum').facts.length, 0);
  assert.equal(lookupPlatformGuide('world').facts[0]?.id, 'world');
  // What the Home "Trending on Karwan" card shows, the assistant can say too.
  const trends = lookupPlatformGuide('whats trending in karwan market this week').facts[0];
  assert.equal(trends?.id, 'market');
  assert.ok(trends?.tools.includes('get_market_trends'));
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
  for (const content of ['my business verification', 'is it still there?', 'our support ticket', 'ما هو رصيدي؟', 'Quel est mon solde ?', 'KWN-3E4G-TRNQ-E6YZ check this']) {
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

test('a direct deal button carries only a checked tag, amount and short text', () => {
  const deal = buildNavigateAction({ destination: 'direct_deal', to: '@Ada_Designs', amountUsdc: 150, terms: 'Logo design' });
  assert.ok(!('error' in deal));
  const url = new URL(deal.href, 'https://k.test');
  assert.equal(url.pathname, '/buyer');
  assert.equal(url.searchParams.get('mode'), 'direct');
  assert.equal(url.searchParams.get('seller'), '@ada_designs');
  assert.equal(url.searchParams.get('amount'), '150');
  assert.equal(url.searchParams.get('terms'), 'Logo design');
  const bare = buildNavigateAction({ destination: 'direct_deal', to: '<script>' });
  assert.ok(!('error' in bare) && bare.href === '/buyer?mode=direct');
  assert.ok('error' in buildNavigateAction({ destination: 'offer', listingId: '../admin' }));
});

test('the guide says who can check a record: agents on a request you posted, outside agents only with your yes', () => {
  const text = JSON.stringify(PLATFORM_GUIDE);
  assert.match(text, /posting a request or an offer/i);
  assert.match(text, /outside Karwan/);
});

test('the guide explains attested deals and how to remove them', () => {
  const text = JSON.stringify(PLATFORM_GUIDE);
  assert.match(text, /attested/i);
  assert.match(text, /Remove my published deals/);
});

test('the guide and the assistant send people to one market (view 17)', () => {
  const market = PLATFORM_GUIDE.find((entry) => entry.id === 'market')!;
  assert.equal(market.route, '/market');
  for (const entry of PLATFORM_GUIDE) {
    for (const page of [entry.route, ...entry.pages]) assert.doesNotMatch(page, /^\/(p2p|b2b|partners|supply)(\/|$)/, `${entry.id}: ${page}`);
  }
  const business = buildNavigateAction({ destination: 'partners' });
  assert.ok('href' in business);
  assert.equal(business.href, '/market?scope=business');
});

test('the guide says how a person confirms and the three things that ask (view 27)', () => {
  assert.equal(lookupPlatformGuide('how do I confirm with a passkey').facts[0]?.id, 'confirm');
  assert.equal(lookupPlatformGuide('I forgot my PIN').facts[0]?.id, 'confirm');
  assert.equal(lookupPlatformGuide('why was I not asked to confirm paying a deal').facts[0]?.id, 'confirm');
  const entry = PLATFORM_GUIDE.find((e) => e.id === 'confirm')!;
  assert.ok(entry.api.includes('POST /api/confirm') && entry.api.includes('POST /api/confirm/pin/reset'));
  assert.match(entry.summary, /passkey/);
  assert.match(entry.summary, /6-digit Karwan PIN/);
  assert.match(entry.summary, /set up your Karwan record/);
  assert.match(entry.summary, /deal guarantee/);
  assert.match(entry.summary, /money leaves Karwan/);
  assert.match(entry.summary, /15 minutes/);
  assert.match(entry.summary, /never asked in a chat/i);
  assert.match(entry.summary, /Paying into a deal, accepting, delivering and releasing are not asked/);
  assert.doesNotMatch(entry.summary, /\bstake|yield|vault|—/i);
});

test('the guide says getting paid early runs on new deals, with the hold and the 24 hours', () => {
  const finance = PLATFORM_GUIDE.find((e) => e.id === 'finance')!;
  const text = `${finance.summary} ${finance.steps.join(' ')}`;
  assert.doesNotMatch(text, /not open on deals made on the new escrow yet/);
  assert.match(text, /from acceptance/);
  assert.match(text, /deal guarantee/);
  assert.match(text, /24 hours/);
  assert.ok(finance.tools.includes('propose_pay_the_seller'));
  assert.ok(finance.api.includes('POST /api/factoring/offers/:offerId/open'));
});

test('a hidden entry never comes back from the guide', () => {
  const ids = lookupPlatformGuide('hourly by the hour virtual assistant', false, ['hourly-work']).facts.map((f) => f.id);
  assert.ok(!ids.includes('hourly-work'));
  assert.ok(lookupPlatformGuide('hourly by the hour virtual assistant').facts.some((f) => f.id === 'hourly-work'));
});

test('the guide calls older positions Earlier deals, never Legacy contracts', () => {
  const text = PLATFORM_GUIDE.map((e) => `${e.title} ${e.summary} ${e.steps.join(' ')}`).join(' ');
  assert.ok(!/legacy contracts/i.test(text));
});

test('the assistant can send someone to Deals, where every deal lives', () => {
  assert.ok((NAVIGATE_DESTINATIONS as readonly string[]).includes('deals'));
  const built = buildNavigateAction({ destination: 'deals' as never });
  assert.ok(!('error' in built) && built.href === '/deals' && built.label === 'Your deals');
  for (const entry of PLATFORM_GUIDE) assert.ok(!entry.pages.includes('/profile/open-deals'), `${entry.id} still names open deals`);
});

test('the assistant can open the Sell side, and the guide describes the market as a shop', () => {
  assert.ok((NAVIGATE_DESTINATIONS as readonly string[]).includes('market_sell'));
  const built = buildNavigateAction({ destination: 'market_sell' as never });
  assert.ok(!('error' in built) && built.href === '/market?side=sell' && built.label === 'What buyers need');
  const market = PLATFORM_GUIDE.find((entry) => entry.id === 'market')!;
  for (const words of ['Buy', 'Sell', 'categor', 'Fits what you sell']) assert.match(market.summary, new RegExp(words));
  assert.doesNotMatch(market.summary, /Start a trade/);
});

test('the guide knows the order path: one fee line, the agent accepting, and the assistant ordering (view 44, Batch 4)', () => {
  const market = PLATFORM_GUIDE.find((entry) => entry.id === 'market')!;
  assert.match(market.summary, /Price, Karwan fee and You pay/);
  assert.match(market.summary, /accepted at once by the seller's agent/);
  assert.ok(market.tools.includes('order_listing'));
  assert.ok(market.pages.includes('/order/[listingId]'));
  assert.ok(market.api.includes('GET /api/listings/:id/quote'));
});

test('the guide says a goods offer takes one order at a time', () => {
  const market = PLATFORM_GUIDE.find((entry) => entry.id === 'market')!;
  assert.match(market.summary, /one order at a time/);
  assert.match(market.summary, /Someone has already ordered this/);
});

test('the guide describes the deal page for every kind (view 44, Batch 5)', () => {
  const delivery = PLATFORM_GUIDE.find((entry) => entry.id === 'delivery')!;
  assert.match(delivery.summary, /Checked by Karwan/);
  assert.match(delivery.summary, /On the way, Arrived/);
  assert.match(delivery.summary, /Ask for changes/);
  assert.match(delivery.summary, /Release 120 USDC to Ada\?/);
});

test('the guide knows the request page and how a deal is paid (view 44, Batch 6)', () => {
  const market = PLATFORM_GUIDE.find((entry) => entry.id === 'market')!;
  const said = [market.summary, ...market.steps].join(' ');
  assert.match(said, /Best fit, picked by your agent/);
  assert.match(said, /Nothing is paid until you accept an offer/);
  const direct = PLATFORM_GUIDE.find((entry) => entry.id === 'direct')!;
  assert.match(direct.summary, /How do you want to pay\?/);
});

test('the guide describes money, withdrawing and the guarantee as money pages (view 44, Batch 7)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.match(said('account'), /held in your deals/);
  assert.match(said('withdraw'), /Where should it go\?/);
  assert.match(said('reputation'), /What your guarantee does/);
  assert.match(said('reputation'), /It shows no score/);
});

test('the guide describes Profile, the public record and Something is wrong (view 44, Batch 8)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.match(said('reputation'), /Share your record/);
  assert.match(said('reputation'), /\/r\/<tag>/);
  assert.match(said('reputation'), /never a score or counts/);
  assert.match(said('delivery'), /It needs changes/);
  assert.match(said('delivery'), /It is not what we agreed/);
  assert.match(said('delivery'), /Nothing arrived/);
  assert.match(said('recovery'), /Karwan decides/);
  assert.match(said('recovery'), /held by Karwan until it is decided/);
  assert.match(said('recovery'), /returns the money to the buyer after a check/);
  assert.doesNotMatch(said('recovery'), /returns the money to the buyer automatically/);
});

test('the guide gives one Record card on Profile and one balance on Arc (1 Nov)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.match(said('reputation'), /one Record card/);
  assert.match(said('reputation'), /What others see, Earlier deals and Share your record/);
  assert.match(said('account'), /one balance on Arc/);
  assert.match(said('account'), /Gateway balance/);
  assert.doesNotMatch(said('account'), /on other networks when there is some/);
});

test('the guide describes the money page and Home as they are after the old pages left (view 44, Batch 9)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.doesNotMatch(said('account'), /Picking a wallet there/);
  assert.match(said('account'), /a Telegram card sits beside them/);
});
