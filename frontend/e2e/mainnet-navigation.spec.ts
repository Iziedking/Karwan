import {expect,test} from '@playwright/test';
import {serveSearch} from './searchFixtures';
import {API,funded} from './moneyFixtures';
import {BUYER,JOB,deliveredDeal} from './fixtures';
import {en} from '../shared/i18n/messages/en';
import {dealRouteRecoveryKey} from '../features/deals/dealRouteRecovery';

async function world(page:import('@playwright/test').Page){
 await page.addInitScript(()=>{localStorage.setItem('karwan:guide:disabled','1');localStorage.setItem('karwan-theme','dark');});
 await serveSearch(page,{balances:funded});
 await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.fallback():r.abort());
}
async function dealWorld(page:import('@playwright/test').Page,deal:unknown=deliveredDeal){
 await page.addInitScript(()=>localStorage.setItem('karwan:guide:disabled','1'));
 await page.route(API+'/**',r=>{
  const p=new URL(r.request().url()).pathname;
  if(p==='/api/auth/bootstrap'||p==='/api/auth/me')return r.fulfill({json:{user:{address:BUYER,method:'circle',email:'tg-ab12cd34ef56ab12cd34ef56@telegram.invalid',hasPasskey:false},profile:null}});
  if(p==='/api/profile')return r.fulfill({json:{profile:null}});
  if(p==='/api/terms/status')return r.fulfill({json:{currentVersion:'1',acceptedVersion:'1'}});
  if(p==='/api/deals/direct/'+JOB)return r.fulfill({json:{deal}});
  if(p.startsWith('/api/client-errors'))return r.fulfill({status:204,body:''});
  return r.fulfill({json:{items:[],events:[],movements:[],messages:[]}});
 });
}
test('mainnet wallet home has no back link that redirects to itself',async({page})=>{
 await world(page);await page.goto('/account');await expect.poll(()=>new URL(page.url()).pathname).toBe('/account');
 await expect(page.locator('[data-shell-back]')).toHaveCount(0);await page.reload();
 await expect(page.locator('[data-shell-back]')).toHaveCount(0);
});
test('a direct mainnet deal goes back to the wallet rather than a closed deal list',async({page})=>{
 await dealWorld(page);
 await page.goto('/deals/'+JOB);await expect(page.locator('[data-steps-card]')).toBeVisible();
 await page.locator('button[aria-label="'+en.nav.backAria+'"]:visible').first().click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/account');
});
test('unknown mainnet routes recover directly to the signed-in wallet',async({page})=>{
 await world(page);await page.goto('/unknown-route-on-mainnet');
 await expect(page.getByRole('link',{name:en.pageNotFound.home,exact:true})).toHaveAttribute('href','/account');
 await page.getByRole('link',{name:en.pageNotFound.home,exact:true}).click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/account');
});


test('assistant mode returns to the exact mainnet account context',async({page},info)=>{
 test.skip(info.project.name!=='desktop','The mainnet account toolbar exposes entry on desktop.');
 await world(page);const target='/account?section=money#balance';await page.goto(target);
 const toggle=page.locator('button[aria-pressed="false"]:visible').filter({hasText:new RegExp(en.assistantMode.use+'|'+en.assistantMode.short)}).first();
 await toggle.click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/assistant');
 await page.locator('button[aria-pressed="true"]:visible').first().click();
 await expect.poll(()=>new URL(page.url()).pathname+new URL(page.url()).search+new URL(page.url()).hash).toBe(target);
});


test('a directly opened assistant closes to the mainnet wallet on every screen size',async({page})=>{
 await world(page);await page.goto('/assistant');
 await page.locator('button[aria-pressed="true"]:visible').first().click();
 await expect.poll(()=>new URL(page.url()).pathname).toBe('/account');
});


test('mainnet render recovery returns directly to the wallet',async({page},info)=>{
 const path='/deals/'+JOB;await page.addInitScript(key=>sessionStorage.setItem(key,String(Date.now())),dealRouteRecoveryKey(path));
 await dealWorld(page,{...deliveredDeal,terms:{unexpected:'SERVER_DETAIL_CANARY'}});
 await page.goto(path);await expect(page.getByText(en.directDealDetail.errorStates.crashBody,{exact:true})).toBeVisible({timeout:15000});
 expect(await page.locator('main').innerText()).not.toMatch(/SERVER_DETAIL_CANARY|funds are unchanged/);
 const home=page.locator('main').getByRole('link',{name:en.nav.home,exact:true});await expect(home).toHaveAttribute('href','/account');
 await page.screenshot({path:info.outputPath('mainnet-render-recovery.png'),fullPage:true});
 await home.click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/account');
});
