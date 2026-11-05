import {expect,test,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {en} from '../shared/i18n/messages/en';
import {fr} from '../shared/i18n/messages/fr';
import {ar} from '../shared/i18n/messages/ar';
import {hi} from '../shared/i18n/messages/hi';
import {sw} from '../shared/i18n/messages/sw';
import {API,ME,TX,funded} from './moneyFixtures';
import {serveTopUpTokenBalances} from './instantTopUpFixtures';
import {JOB,PROFILE,makeJob,serveSearch} from './searchFixtures';
import {formatUsdc} from '../shared/utils/format';
const messages={en,fr,ar,hi,sw};
const SELLER='0x5555555555555555555555555555555555555555';
async function world(page:Page,locale:keyof typeof messages,options:Parameters<typeof serveSearch>[1]={balances:funded}){
 await page.context().addCookies([{name:'karwan-locale',value:locale,domain:'127.0.0.1',path:'/'}]);
 await page.addInitScript(()=>{localStorage.setItem('karwan:guide:disabled','1');localStorage.setItem('karwan-theme','light');sessionStorage.setItem('karwan:search','v2');});
 await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.fallback():r.abort());
 await serveSearch(page,{...options,job:makeJob()});
}
async function sound(page:Page){
 await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 const v=(await new AxeBuilder({page}).include('main').analyze()).violations;
 expect(v.filter(x=>x.impact==='serious'||x.impact==='critical')).toEqual([]);
}
for(const locale of ['en','fr','ar','hi','sw'] as const){
 test('language audit balance, uncertain transfer and same-request recheck '+locale,async({page},info)=>{
  const m=messages[locale],t=m.money;const fifty=new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:6}).format(50);const calls:Array<{requestId?:string;amountUsdc?:number}>=[];
  await world(page,locale,{balances:funded,fundAgent:async route=>{calls.push(route.request().postDataJSON());return route.fulfill({status:calls.length===1?202:200,json:{accepted:true,code:calls.length===1?'funding_unconfirmed':undefined,txHash:TX,reference:'KWN-2026-B6',movementState:calls.length===1?'submitted':'completed'}});}});
  await page.goto('/account');await expect(page.getByRole('heading',{level:1})).toContainText(m.moneyMove.one.yourBalance);
  await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
  await page.getByRole('button',{name:new RegExp(m.moneyMove.one.whereItIs)}).click();
  await page.getByRole('dialog').locator('[data-part="agent"]').getByRole('button',{name:m.moneyMove.one.addToAgent,exact:true}).click();
  // Topping up the agent is its own page (view 51, fifth round).
  await expect(page).toHaveURL(/\/account\/agent\?move=topUp/);
  const dialog=page.locator('[data-money-page]');await dialog.getByLabel(t.sheet.amountLabel,{exact:true}).fill('50');
  await dialog.getByRole('button',{name:t.sheet.ctaTopUp.replace('{amount}',fifty),exact:true}).click();
  await expect(dialog.getByText(t.sheet.slow,{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:t.sheet.tryAgain,exact:true})).toHaveCount(0);
  await sound(page);await page.screenshot({path:info.outputPath('pending-'+locale+'.png'),fullPage:true});
  const recheck=dialog.getByRole('button',{name:t.sheet.checkAgain,exact:true});await recheck.focus();await expect(recheck).toBeFocused();await recheck.click();
  await expect(dialog.getByText(t.sheet.doneTopUpBuyer.replace('{amount}',fifty),{exact:true})).toBeVisible();
  expect(calls).toHaveLength(2);expect(calls[0].requestId).toBeTruthy();expect(calls[1].requestId).toBe(calls[0].requestId);
  await page.screenshot({path:info.outputPath('confirmed-'+locale+'.png'),fullPage:true});
 });
 test('language audit guarantee request, wait and collect '+locale,async({page},info)=>{
  const m=messages[locale],g=m.dealGuarantee;await world(page,locale);let ready=false;const mutations:string[]=[];
  await page.route(API+'/api/guarantee',r=>r.fulfill({json:{available:true,hasRecord:true,inPlaceUsdc:'125',heldUsdc:'25',freeUsdc:'100',comingBackUsdc:'15',readyAt:Math.floor(Date.now()/1000)+7*86400,ready,previousUsdc:'0',waitDays:7}}));
  await page.route(API+'/api/guarantee/**',r=>{mutations.push(r.request().method());return r.fulfill({status:403,json:{error:'fixture prevents submission'}});});
  const p=m.moneyPages.guarantee;
  await page.goto('/guarantee');await expect(page).toHaveURL(/\/account\?tab=guarantee$/);await expect(page.getByText(p.ready,{exact:true})).toBeVisible();
  await expect(page.getByText(p.comingBack,{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:p.collect,exact:true})).toHaveCount(0);
  await page.locator('[data-guarantee-actions]').getByRole('link',{name:p.withdraw,exact:true}).click();await expect(page).toHaveURL(/step=take_out/);
  await expect(page.getByRole('heading',{name:p.withdrawTitle})).toBeVisible();await page.locator('[data-money-page]').getByLabel(m.money.sheet.amountLabel,{exact:true}).fill('100');
  await expect(page.locator('[data-restart]')).toHaveText(g.sheets.takeOut.restart.replace('{days}','7').replace('{total}',new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(115)));
  await sound(page);await page.screenshot({path:info.outputPath('withdrawal-wait-'+locale+'.png'),fullPage:true});
  ready=true;await page.goto('/account?tab=guarantee');
  await page.locator('[data-guarantee-actions]').getByRole('link',{name:p.collect,exact:true}).click();await expect(page.locator('[data-money-page]').getByText(g.sheets.collect.body.replace('{days}','7'),{exact:false})).toBeVisible();
  await sound(page);await page.screenshot({path:info.outputPath('collect-'+locale+'.png'),fullPage:true});expect(mutations).toEqual([]);
 });
 test('language audit missing offer total blocks payment until refreshed '+locale,async({page},info)=>{
  const t=messages[locale].offers;await world(page,locale);let total:string|undefined;let reads=0;let accepted=0;
  const offer={id:'b6-offer',jobId:JOB,sellerUser:SELLER,priceUsdc:'100',deliverByUnix:Math.floor(Date.now()/1000)+86400,note:'Logo design',state:'pending',createdAt:1,lapsesAt:Date.now()+86400000,sellerBlock:{name:'Ada Builds',tag:'ada',verified:false,tier:'COLD',rating:{kind:'new',count:0},reasons:['HAS_COMPLETED_DEALS'],recommended:true}};
  await page.route(API+'/api/jobs/'+JOB+'/offers',r=>{reads++;return r.fulfill({json:{role:'buyer',count:1,offers:[{...offer,fundedUsdc:total}],request:{briefText:'Logo design',budgetUsdc:'120',deadlineUnix:offer.deliverByUnix}}});});
  await page.route(API+'/api/jobs/'+JOB+'/offers/*/accept',r=>{accepted++;return r.fulfill({json:{accepted:true}});});
  await page.goto('/jobs/'+JOB);await page.getByRole('button',{name:t.review.replace('{price}',formatUsdc('100',{withSuffix:false})),exact:true}).click();
  const d=page.getByRole('dialog');await expect(d.getByText(t.totalUnavailable,{exact:true})).toBeVisible();await expect(d.getByRole('button')).toHaveCount(2);expect(accepted).toBe(0);
  await sound(page);await page.screenshot({path:info.outputPath('missing-total-'+locale+'.png'),fullPage:true});
  total='100.5';const before=reads;await d.getByRole('button',{name:t.refreshTotal,exact:true}).click();await expect.poll(()=>reads).toBeGreaterThan(before);
  const pay=d.getByRole('button',{name:t.accept.replace('{price}',formatUsdc('100.5',{withSuffix:false})),exact:true});await expect(pay).toBeEnabled();expect(accepted).toBe(0);
  await sound(page);await page.screenshot({path:info.outputPath('verified-total-'+locale+'.png'),fullPage:true});await pay.click();await expect(page.getByText(t.accepted,{exact:true})).toBeVisible();expect(accepted).toBe(1);
 });
 test('language audit payment-request timing '+locale,async({page},info)=>{
  const t=messages[locale].payLink;await world(page,locale);await serveTopUpTokenBalances(page,funded);
  await page.route(API+'/api/deposit/requests/batch6',r=>r.fulfill({json:{request:{requestId:'batch6',recipientAddress:SELLER,amountUsdc:'10',purpose:'Logo design',expiresAt:Date.now()+7*86400000,status:'open',createdAt:Date.now(),acceptedChains:['Ethereum','Base']}}}));
  await page.goto('/deposit/request/batch6');await expect(page.getByText(t.pay.arrivesArc,{exact:false})).toBeVisible();
  await sound(page);await page.screenshot({path:info.outputPath('payment-'+locale+'.png'),fullPage:true});
 });
}
test('language audit guarantee load error has read-only refresh',async({page})=>{
 await world(page,'en');let down=true;let calls=0;
 await page.route(API+'/api/guarantee',r=>{calls++;return down?r.fulfill({status:503,json:{error:'unavailable'}}):r.fulfill({json:{available:true,hasRecord:true,inPlaceUsdc:'0',heldUsdc:'0',freeUsdc:'0',comingBackUsdc:'0',ready:false,previousUsdc:'0',waitDays:7}});});
 await page.goto('/guarantee');const refresh=page.getByRole('button',{name:en.dealGuarantee.refresh,exact:true});await expect(refresh).toBeVisible({timeout:20000});const before=calls;down=false;await refresh.click();await expect(page.locator('[data-guaranteed]')).toBeVisible();expect(calls).toBeGreaterThan(before);
});
