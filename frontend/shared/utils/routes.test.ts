import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { getProductBackHref, isPublicAccessRoute, isPublicEditorialRoute, previousRoute } from './routes.js';

test('the public numbers page never asks a visitor to sign in, at its docs home or its old address', () => {
  for (const path of ['/docs/numbers', '/activity/all-time']) {
    assert.equal(isPublicEditorialRoute(path), true, path);
    assert.equal(isPublicAccessRoute(path), true, path);
  }
  assert.equal(getProductBackHref('/docs/numbers'), '/docs');
});

test('the personal activity page stays behind sign-in', () => {
  assert.equal(isPublicAccessRoute('/activity'), false);
});

test('the main pages in the rail have no Back; a page inside one does (owner, 12 Nov 2026)', () => {
  for (const page of ['/app', '/market', '/deals', '/account', '/messages', '/financier', '/profile', '/market?side=sell']) assert.equal(getProductBackHref(page), null, page);
  assert.equal(getProductBackHref('/account', true, false), null);
  assert.equal(getProductBackHref('/activity'), '/app');
  assert.equal(getProductBackHref('/add'), '/account');
});

test('a visitor who is not signed in has no Back on the market, their first page (view 74)', () => {
  assert.equal(getProductBackHref('/market', false), null);
  assert.equal(getProductBackHref('/market?side=sell', false), null);
  assert.equal(getProductBackHref('/listings/lst_1', false), '/market');
});

test('Deals is a place of its own and a deal goes back to it', () => {
  assert.equal(getProductBackHref(`/deals/0x${'ab'.repeat(32)}`), '/deals');
  assert.equal(getProductBackHref('/profile/open-deals'), '/deals');
});

test('Back skips every copy of the page it is on, whatever case the address was written in', () => {
  const own = '/credit-passport/0xa045e8104bc066fff5bfc673abf354871edc03c5';
  const ownChecksum = '/credit-passport/0xA045E8104bc066FFF5bFC673ABf354871eDc03c5';
  assert.deepEqual(previousRoute(['/app', '/profile', ownChecksum, own], own), { route: '/profile', rest: ['/app'] });
  assert.deepEqual(previousRoute([ownChecksum], own), null);
  assert.deepEqual(previousRoute([], own), null);
  assert.deepEqual(previousRoute(['/market', own], own), { route: '/market', rest: [] });
});

test('Back never returns to the marketing site', () => {
  assert.deepEqual(previousRoute(['/', '/docs/numbers', '/credit-passport/0x1'], '/credit-passport/0x1'), null);
});


test('detail pages have useful direct-entry parents across every product family',()=>{
  for(const [path,parent] of [['/messages/ada','/messages'],['/financier/factoring/offer','/financier'],['/financier/po/line','/financier'],['/work/abc','/market'],['/work/requests/abc','/market'],['/contests/abc','/market'],['/r/ada','/market'],['/attested/abc','/market'],['/developers/record','/developers'],['/newsletter/issue','/newsletter'],['/terms/chat','/terms']]) assert.equal(getProductBackHref(path),parent,path);
});

test('mainnet direct deal parents lead to the wallet rather than a blocked list',()=>{
  assert.equal(getProductBackHref('/deals/0xabc',true,false),'/account');
  assert.equal(getProductBackHref('/account',true,false),null);
  assert.equal(getProductBackHref('/settings',true,false),'/profile');
  assert.equal(getProductBackHref('/docs',true,false),'/account');
  assert.equal(getProductBackHref('/financier/factoring/abc',true,false),'/account');
});


test('every checked-in page has a defined direct-entry parent or is a home',()=>{
  const app=fileURLToPath(new URL('../../app',import.meta.url));
  // The main pages in the rail have no Back on purpose (owner, 12 Nov 2026).
  const MAIN=['/market','/deals','/account','/messages','/financier','/profile'];
  const pages:string[]=[];
  function walk(dir:string){for(const e of readdirSync(dir,{withFileTypes:true})){const path=join(dir,e.name);if(e.isDirectory())walk(path);else if(e.name==='page.tsx')pages.push(path);}}
  walk(app);
  for(const file of pages){
    const route='/'+relative(app,file).split(sep).join('/').replace(/\/?page\.tsx$/,'');
    if(route==='/'||route==='/app'||MAIN.includes(route))continue;
    assert.ok(getProductBackHref(route,true),route+' has no direct-entry parent');
  }
});
