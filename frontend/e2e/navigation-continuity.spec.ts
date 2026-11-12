import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { en } from '../shared/i18n/messages/en';
import { ar } from '../shared/i18n/messages/ar';
import { fr } from '../shared/i18n/messages/fr';
import { hi } from '../shared/i18n/messages/hi';
import { sw } from '../shared/i18n/messages/sw';
import { PROFILE, serveSearch } from './searchFixtures';
import { API, ME, funded } from './moneyFixtures';
import { JOB, deliveredDeal } from './fixtures';
import { dealRouteRecoveryKey } from '../features/deals/dealRouteRecovery';
import { ASSISTANT_MODE_ENTRY } from '../features/assistant/assistantModeEntry';
const messages={en,ar,fr,hi,sw};
async function world(page:Page,locale:keyof typeof messages='en',theme='light',signedIn=true){
 await page.context().addCookies([{name:'karwan-locale',value:locale,domain:'127.0.0.1',path:'/'}]);
 await page.addInitScript(theme=>{localStorage.setItem('karwan-theme',theme);localStorage.setItem('karwan:guide:disabled','1');},theme);
 await serveSearch(page,{balances:funded});
 await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.fallback():r.abort());
 if(!signedIn)await page.route(API+'/api/auth/**',r=>r.fulfill({json:{user:null,profile:null}}));
}
const urlOf=(page:Page)=>new URL(page.url()).pathname+new URL(page.url()).search+new URL(page.url()).hash;
for(const locale of ['en','fr','ar','hi','sw'] as const)for(const theme of ['light','dark']){
 test('back and forward preserve market context '+locale+' '+theme,async({page},info)=>{
  await world(page,locale,theme);const t=messages[locale];const source='/market?category=design&q=Logo#results';
  await page.goto(source);await expect(page.getByRole('searchbox',{name:t.marketShop.search})).toHaveValue('Logo');
  await expect.poll(()=>page.evaluate(()=>!!history.state?.__karwanNavigationV2)).toBe(true);
  await page.locator('a[href="/profile"]:visible').first().click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/profile');
  // Profile is a main page, so it has no Back; the browser's own Back returns to the market as it was.
  await expect(page.locator('[data-back]:visible')).toHaveCount(0);
  await page.goBack();await expect.poll(()=>urlOf(page)).toBe(source);
  await expect(page.getByRole('searchbox',{name:t.marketShop.search})).toHaveValue('Logo');
  await page.goForward();await expect.poll(()=>new URL(page.url()).pathname).toBe('/profile');
  await page.goBack();await expect.poll(()=>urlOf(page)).toBe(source);
  await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  const axe=await new AxeBuilder({page}).include('main').analyze();expect(axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
  await page.screenshot({path:info.outputPath('restored-'+locale+'-'+theme+'.png'),fullPage:true});
 });
}
test('same-path query history updates the selected market side and search',async({page})=>{
 await world(page);await page.goto('/market?category=design&q=Logo');
 await expect(page.getByRole('searchbox',{name:en.marketShop.search})).toHaveValue('Logo');
 await expect.poll(()=>page.evaluate(()=>!!history.state?.__karwanNavigationV2)).toBe(true);
 await page.evaluate(()=>history.pushState(null,'','/market?side=sell#requests'));
 await expect(page.getByRole('tab',{name:en.marketShop.sell,exact:true})).toHaveAttribute('aria-selected','true');
 await page.goBack();await expect(page.getByRole('searchbox',{name:en.marketShop.search})).toHaveValue('Logo');
 await page.getByRole('searchbox',{name:en.marketShop.search}).fill('Logo for Ada');
 await expect(page.getByRole('searchbox',{name:en.marketShop.search})).toHaveValue('Logo for Ada');
 await page.reload();await expect(page.getByRole('searchbox',{name:en.marketShop.search})).toHaveValue('Logo for Ada');
});
test('an external previous page is never the product back destination',async({page})=>{
 await world(page);await page.route('https://outside.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<html><body>Outside</body></html>'}));
 await page.goto('https://outside.invalid/');await page.goto('/settings');
 await page.locator('[data-own-back] button[aria-label="'+en.nav.backAria+'"]').first().click();
 await expect.poll(()=>new URL(page.url()).pathname).toBe('/profile');expect(new URL(page.url()).hostname).toBe('127.0.0.1');
});
test('corrupt old and new navigation storage does not break recovery',async({page})=>{
 await world(page);await page.addInitScript(()=>{sessionStorage.setItem('karwan.nav.stack','[null,42]');sessionStorage.setItem('karwan.navigation.v2','{"invalid":true}');});
 await page.goto('/settings');await page.locator('[data-own-back] button[aria-label="'+en.nav.backAria+'"]').first().click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/profile');
});
for(const target of ['/settings?section=notifications#email','/verify/person?from=record','/connect/telegram','/order/route-audit-missing?quantity=2#review'])test('signed-out task keeps its exact return destination '+target,async({page})=>{
 await world(page,'en','light',false);await page.goto(target);
 await expect.poll(()=>new URL(page.url()).pathname).toBe('/start');
 expect(new URL(page.url()).searchParams.get('next')).toBe(target);
});
test('unknown routes offer public recovery without forcing a new sign-in',async({page})=>{
 await world(page,'en','light',false);const res=await page.goto('/not-a-karwan-route');expect(res?.status()).toBe(404);
 await expect(page.getByRole('heading',{name:en.pageNotFound.title})).toBeVisible();
 await expect(page.getByRole('link',{name:en.pageNotFound.home,exact:true})).toHaveAttribute('href','/');
 await expect(page.getByRole('link',{name:en.pageNotFound.help,exact:true})).toHaveAttribute('href','/docs');
});


test('restored account documents recheck the session before showing a shared-device account',async({page})=>{
 await world(page);let signedIn=true;
 await page.route(API+'/api/auth/**',r=>r.fulfill({json:{user:signedIn?{address:ME,method:'circle',hasPasskey:true}:null,profile:signedIn?PROFILE:null}}));
 await page.goto('/settings');await expect(page.getByRole('heading',{name:en.settings.title,exact:true})).toBeVisible();
 signedIn=false;
 await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
 await expect.poll(()=>new URL(page.url()).pathname).toBe('/start');
 expect(new URL(page.url()).searchParams.get('next')).toBe('/settings');
 await expect(page.locator('html')).not.toHaveCSS('visibility','hidden');
});

test('back and reload preserve the reading position on a long help page',async({page},info)=>{
 test.skip(info.project.name!=='desktop','Long reading position uses the desktop article.');
 await world(page);await page.goto('/docs/escrow');await expect(page.getByRole('heading',{level:1})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>!!history.state?.__karwanNavigationV2)).toBe(true);
 await page.mouse.move(1000,450);await page.mouse.wheel(0,700);
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(600);
 await page.evaluate(()=>{const link=document.querySelector<HTMLAnchorElement>('a[href="/"]');if(!link)throw Error('Home link missing');link.click();});
 await expect.poll(()=>new URL(page.url()).pathname).toBe('/');
 await page.goBack();await expect.poll(()=>new URL(page.url()).pathname).toBe('/docs/escrow');
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(600);
 await page.reload();await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(600);
});


test('assistant mode returns to the exact source task on every screen size',async({page},info)=>{
 test.skip(!ASSISTANT_MODE_ENTRY,'The Use assistant switch is parked (owner, 6 Nov 2026).');
 await world(page);const target='/profile?section=record#sources';await page.goto(target);
 if(info.project.name==='desktop')await page.locator('button[aria-pressed="false"]:visible').filter({hasText:en.assistantMode.use}).first().click();
 else await page.getByRole('switch',{name:en.assistantMode.use,exact:true}).click();
 await expect.poll(()=>new URL(page.url()).pathname).toBe('/assistant');
 await page.locator('button[aria-pressed="true"]:visible').first().click();
 await expect.poll(()=>urlOf(page)).toBe(target);
});


test('a failed deal read explains uncertainty and returns to the deal list',async({page},info)=>{
 await world(page,'en','dark');const id='0x'+'ab'.repeat(32);
 await page.route(API+'/api/deals/direct/**',r=>r.fulfill({status:503,json:{error:'SERVER_DETAIL_CANARY'}}));
 await page.goto('/deals/'+id);
 await expect(page.getByText(en.directDealDetail.errorStates.transientBody,{exact:true})).toBeVisible({timeout:20000});
 expect(await page.locator('main').innerText()).not.toMatch(/SERVER_DETAIL_CANARY|still on chain|network hiccup/);
 const axe=await new AxeBuilder({page}).include('main').analyze();expect(axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
 await page.screenshot({path:info.outputPath('deal-read-recovery-dark.png'),fullPage:true});
 await page.locator('[data-shell-back]').click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/deals');
});


test('a render recovery state keeps a safe retry and the canonical deal-list destination',async({page},info)=>{
 await world(page,'en','dark');const path='/deals/'+JOB;
 await page.addInitScript(key=>sessionStorage.setItem(key,String(Date.now())),dealRouteRecoveryKey(path));
 await page.route(API+'/api/deals/direct/**',r=>r.fulfill({json:{deal:{...deliveredDeal,terms:{unexpected:'SERVER_DETAIL_CANARY'}}}}));
 await page.goto(path);
 await expect(page.getByRole('heading',{name:en.directDealDetail.errorStates.transientTitle,exact:true})).toBeVisible({timeout:15000});
 await expect(page.getByText(en.directDealDetail.errorStates.crashBody,{exact:true})).toBeVisible();
 expect(await page.locator('main').innerText()).not.toMatch(/SERVER_DETAIL_CANARY|funds are unchanged/);
 const back=page.getByRole('link',{name:en.directDealDetail.errorStates.notFoundCta,exact:true});await expect(back).toHaveAttribute('href','/deals');
 const axe=await new AxeBuilder({page}).include('main').analyze();expect(axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
 await page.screenshot({path:info.outputPath('deal-render-recovery-dark.png'),fullPage:true});
 await back.click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/deals');
});
