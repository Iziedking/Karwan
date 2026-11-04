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
  // View 48: the sheet turns while paying, then the Paid in result; no promise of money back.
  assert.match(market.summary, /Paying 120 USDC while the money goes in/);
  assert.match(market.summary, /shows Paid in: the seller has your order/);
  assert.doesNotMatch(market.summary, /you get it back|Protected, the seller/);
  // View 48 batch 6: a request is one screen, parts folded behind Pay in parts.
  const steps = market.steps.join(' ');
  assert.match(steps, /on one screen, What do you need\?/);
  assert.match(steps, /Pay in parts/);
  assert.match(steps, /Finding sellers/);
  assert.doesNotMatch(steps, /in three steps/);
  // View 48 batch 7: the record's three facts and one ask, and the Theme screen from Profile.
  const all = PLATFORM_GUIDE.map((entry) => entry.summary).join(' ');
  // Unsealed (owner, 3 Nov 2026): deals done and on time are public, the score is not.
  assert.match(all, /three facts in one card \(deals done, the average rating and the share on time/);
  assert.match(all, /their recent deals \(date, side and value range/);
  assert.match(all, /one button to ask them for an offer, never the score, an exact amount or who the deals were with/);
  assert.match(all, /how many deals were done and how many on time; the private 0-100 score stays owner-only/);
  assert.doesNotMatch(all, /deal-summary counts remain owner-only/);
  assert.match(all, /the Theme screen \(\/profile\/theme\), opened from the Theme row on Profile/);
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

test('the guide walks Add money and Withdraw as the new look shows them (view 48, batch 9a)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.match(said('deposit'), /pick Send from an app or exchange/);
  assert.match(said('deposit'), /says USDC only/);
  assert.match(said('withdraw'), /the amount and address carry over/);
  assert.match(said('withdraw'), /Review opens the move once more/);
  assert.match(said('withdraw'), /Nothing moves before that/);
});

test('the guide reads a conversation as the new look shows it (view 48, batch 9g)', () => {
  const all = PLATFORM_GUIDE.map((e) => [e.summary, ...e.steps].join(' ')).join(' ');
  assert.match(all, /Your own messages show in ink/);
  assert.match(all, /round Send button is the one green control/);
});

test('the guide knows the owner notes of 4 Nov: deal links keep the person, top-ups use the other agent', () => {
  const all = PLATFORM_GUIDE.map((e) => [e.summary, ...e.steps].join(' ')).join(' ');
  assert.match(all, /every kind keeps them/);
  assert.match(all, /offers to use the other agent's money instead/);
  assert.match(all, /The Transfer balance is one balance that holds USDC from every network together/);
});

test('the guide says bank and card withdrawals are coming soon, never open (owner, 4 Nov)', () => {
  const all = PLATFORM_GUIDE.map((e) => [e.summary, ...e.steps].join(' ')).join(' ');
  assert.match(all, /A bank account and A card are listed under it as Coming soon/);
});

test('the guide reads the finance desk and business verification as the new look shows them (view 48, batch 9h)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.match(said('finance'), /one green button on the desk is Pay the seller/);
  assert.match(said('finance'), /Apply shows one card of three checks/);
  assert.match(said('business'), /Submit for review is the one green button/);
});

test('the guide sends the record to its own page, with one line on Profile (view 48, batch 9e)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.match(said('reputation'), /record in one line/);
  assert.match(said('reputation'), /Trade record page/);
  assert.doesNotMatch(said('reputation'), /Record card/);
});

test('the guide walks a payment link as the new look shows it (view 48, batch 9d)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.match(said('paylink'), /Copy link is the main button/);
  assert.match(said('paylink'), /signed in or not/);
  assert.match(said('paylink'), /marked in ink/);
});

test('the guide reads Activity and its receipt as the new look shows them (view 48, batch 9c)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.match(said('records'), /one card for each day/);
  assert.match(said('records'), /in the same colour/);
  assert.match(said('records'), /Download image is the main button/);
});

test('the guide walks Post an offer and Start a deal as one screen (view 48, batch 9b)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.match(said('sell'), /The form is one screen/);
  assert.match(said('sell'), /Lowest you accept and Pay in parts open in place/);
  assert.match(said('sell'), /Publish offer posts it/);
  assert.match(said('direct'), /What will be delivered/);
  assert.match(said('direct'), /Review shows the deal once more/);
  assert.match(said('direct'), /nothing is paid then/);
  assert.doesNotMatch(said('direct'), /Step \d of 3/);
});

test('the guide describes Profile, the public record and Something is wrong (view 44, Batch 8)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.match(said('reputation'), /Share full record/);
  assert.match(said('reputation'), /\/r\/<tag>/);
  assert.match(said('reputation'), /never the score, an exact amount or who the deals were with/);
  assert.match(said('reputation'), /Other people see your tier, reasons and deal counts, never your score or your amounts, unless you share your full passport/);
  assert.match(said('delivery'), /It needs changes/);
  assert.match(said('delivery'), /It is not what we agreed/);
  assert.match(said('delivery'), /Nothing arrived/);
  assert.match(said('recovery'), /Karwan decides/);
  assert.match(said('recovery'), /held by Karwan until it is decided/);
  assert.match(said('recovery'), /returns the money to the buyer after a check/);
  assert.doesNotMatch(said('recovery'), /returns the money to the buyer automatically/);
});

test('the guide describes the new look of Home and the deal page (view 48)', () => {
  const all = PLATFORM_GUIDE.map((entry) => [entry.summary, ...entry.steps].join(' ')).join(' ');
  assert.match(all, /four round buttons under it: Add money, Send, Request payment and Withdraw/);
  assert.match(all, /Turn on your record with one button/);
  assert.match(all, /the road travelled solid and the road ahead dashed/);
  assert.match(all, /disputed, cancelled or refunded deal shows one status line instead of a route/);
  assert.match(all, /Something is wrong sits under the move/);
  assert.match(all, /has been paid/);
  assert.doesNotMatch(all, /steps card/);
});

test('the guide names the deal pills, the Sell side cards and Trade and money (owner notes, 3 Nov)', () => {
  const all = PLATFORM_GUIDE.map((entry) => [entry.summary, ...entry.steps].join(' ')).join(' ');
  assert.match(all, /each deal with a pill that says where it stands/);
  assert.match(all, /Paid out, Refunded, Refunding, Cancelled or Split/);
  assert.match(all, /What buyers need as picture cards like Buy/);
  assert.match(all, /One Trade and money group/);
  assert.doesNotMatch(all, /sit under Selling/);
  assert.match(all, /starts folded under how many sellers offered, and Show your shortlist opens the order/);
  // A dispute reads as Karwan checking, with the support safety line (owner, 3 Nov 2026).
  assert.match(all, /Karwan checks both sides, the delivery and the deal chat/);
  assert.match(all, /Karwan support will never message you outside Karwan or ask you to send money/);
  assert.doesNotMatch(all, /The judge reads both accounts/);
  // The money page in the new look (view 48, batch 4).
  assert.match(all, /Add money \(the one green button\), Send and Withdraw/);
  assert.match(all, /listed beside the balance with Total held/);
});

test('the guide gives the record one line on Profile and one balance on Arc (1 Nov, batch 9e)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.match(said('reputation'), /record in one line/);
  assert.match(said('reputation'), /What others see, Earlier deals and Where your record comes from/);
  assert.match(said('account'), /one balance on Arc/);
  assert.match(said('account'), /Gateway balance/);
  assert.doesNotMatch(said('account'), /on other networks when there is some/);
});

test('the guide describes the money page and Home as they are after the old pages left (view 44, Batch 9)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.doesNotMatch(said('account'), /Picking a wallet there/);
  assert.match(said('account'), /Telegram is linked from Contact on Profile/);
  assert.doesNotMatch(said('account'), /Telegram card/);
});

test('the guide names the deal page moves that replaced the older page (Batch 9 part B)', () => {
  const said = (id: string) => { const e = PLATFORM_GUIDE.find((entry) => entry.id === id)!; return [e.summary, ...e.steps].join(' '); };
  assert.match(said('delivery'), /Ask them to release/);
  assert.match(said('delivery'), /Refund the buyer or Pay the seller/);
  assert.match(said('delivery'), /Check it again/);
  assert.match(said('delivery'), /there is no older deal page/);
  assert.doesNotMatch(PLATFORM_GUIDE.map((e) => e.summary).join(' '), /with every action as before/);
});

 test('shared assistant language distinguishes requests, direct payments and commitment', () => {
  assert.match(KARWAN_ASSISTANT_SYSTEM, /request for a buyer’s posted need/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /outside deal escrow/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /acceptance or funding requires the final confirmation/);
  for (const [destination, label] of [['request_payment', 'Request a payment'], ['credit_passport', 'View trade record'], ['payment_link', 'View payment request']] as const) {
    const card = buildNavigateAction({ destination, address: '0x' + '1'.repeat(40), token: '6f1c2a3b-0000-4000-8000-000000000000' });
    assert.ok(!('error' in card));
    assert.equal(card.label, label);
  }
 });
