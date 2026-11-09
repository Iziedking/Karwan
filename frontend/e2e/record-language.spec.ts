import {expect,test,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {recordCopy} from '../shared/i18n/messages/record';
import {sealedRecordCopy} from '../shared/i18n/messages/sealedRecord';
import {reputationSourcesCopy} from '../shared/i18n/messages/reputationSources';
import {TIER_NAMES} from '../features/reputation/useTierLabels';
import {API,ME,funded} from './moneyFixtures';
import {PROFILE,serveSearch} from './searchFixtures';
const A='0x2222222222222222222222222222222222222222';
async function world(page:Page,locale:string){
 await page.context().addCookies([{name:'karwan-locale',value:locale,domain:'127.0.0.1',path:'/'}]);
 await page.addInitScript(()=>{localStorage.setItem('karwan:guide:disabled','1');localStorage.setItem('karwan-theme','light');});
 await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.fallback():r.abort());
 await serveSearch(page,{balances:funded});
 const mutations:string[]=[];
 const sourceState={outsideReadable:false,sourceLookup:false,interest:''};
 await page.route(API+'/**',async r=>{
  const p=new URL(r.request().url()).pathname;
  if(!['GET','OPTIONS'].includes(r.request().method()))mutations.push(p);
  if(p==='/api/auth/bootstrap')return r.fulfill({json:{user:{address:ME,method:'circle',hasPasskey:true},profile:PROFILE}});
  if(p==='/api/r/ada')return r.fulfill({json:{displayName:'Ada Builds',tag:'ada',level:'registered',tier:'COLD',rating:{kind:'rated',value:4.8,count:23},reasons:['HAS_COMPLETED_DEALS'],facts:[],score:512,counts:{completed:23,onTimeRate:95,disputesLost:0}}});
  if(p==='/api/tags/ada')return r.fulfill({json:{found:true,self:false,address:A,tag:'ada'}});
  if(p==='/api/reputation')return r.fulfill({json:{sealed:true,address:A,displayName:'Ada Builds',tag:'ada',tier:'COLD',reasons:['HAS_COMPLETED_DEALS'],memberSince:null}});
  if(p==='/api/me/reputation-sources'){if(r.request().method()==='PUT'){Object.assign(sourceState,r.request().postDataJSON());return r.fulfill({json:{sources:sourceState}});}return r.fulfill({json:{sources:sourceState,connected:['karwan'],readers:[],readsBalanceUsdc:null}});}
  return r.fallback();
 });
 return mutations;
}
async function sound(page:Page){
 await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
 await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 const violations=(await new AxeBuilder({page}).include('main').analyze()).violations;
 expect(violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
}
async function openNote(page:Page,heading:string,lines:string[]){
 const note=page.getByRole('tooltip');
 // The record's deal list can arrive after the first tap and re-render the page; tap again until the note shows.
 await expect(async()=>{
  if(!await note.isVisible())await page.locator(heading).getByRole('button').click();
  for(const line of lines)await expect(note.getByText(line,{exact:true})).toBeVisible({timeout:2000});
 }).toPass({timeout:15000});
 await note.locator('[data-hint-got-it]').click();
 await expect(note).toHaveCount(0);
}
for(const locale of ['en','fr','ar','hi','sw'] as const){
 test('trade signals and privacy '+locale,async({page},info)=>{
  const mutations=await world(page,locale);const c=recordCopy[locale];
  await page.goto('/r/ada');await expect(page.getByRole('heading',{level:1,name:'Ada Builds'})).toBeVisible();
  await expect(page.getByText(c.levels.registered,{exact:true})).toBeVisible();
  await expect(page.getByText(TIER_NAMES[locale].COLD,{exact:true})).toBeVisible();
  // What the record means and what stays private sit behind the (i) by Sources, closed with Got it (owner, 9 Nov 2026).
  await expect(page.getByText(c.meaning,{exact:true})).toHaveCount(0);
  await openNote(page,'#record-sources',[c.meaning,c.privacy]);
  await expect(page.getByText('512',{exact:true})).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
  await sound(page);await page.screenshot({path:info.outputPath('public-'+locale+'.png'),fullPage:true});
  const link=page.getByRole('link',{name:c.download,exact:true});await link.focus();await expect(link).toBeFocused();
  await page.goto('/credit-passport/'+A);await expect(page.getByRole('heading',{level:1,name:'Ada Builds'})).toBeVisible();
  await openNote(page,'#passport-record',[sealedRecordCopy[locale].noNumbers]);
  await sound(page);await page.screenshot({path:info.outputPath('sealed-'+locale+'.png'),fullPage:true});
  await page.goto('/docs/reputation');await expect(page.getByText(c.meaning,{exact:true})).toBeVisible();
  await expect(page.getByText(TIER_NAMES[locale].COLD+' (200–399).',{exact:true})).toBeVisible();
  await sound(page);await page.screenshot({path:info.outputPath('help-'+locale+'.png'),fullPage:true});
  expect(mutations).toEqual([]);
 });
 test('owner record and level notice keep translated labels '+locale,async({page},info)=>{
  const mutations=await world(page,locale);
  await page.route(API+'/api/reputation**',async r=>r.fulfill({json:{address:ME,score:250,tier:'COLD',scoreTier:'COLD',successCount:1,disputedCount:0,failedCount:0,totalDeals:1,terms:{},inputs:{stakeUsdc:25,lifetimeVolumeUsdc:120,distinctCounterparties:1},tierCelebration:{tier:'COLD',until:Date.now()+86400000}}}));
  await page.goto('/credit-passport/'+ME);await expect(page.getByText(TIER_NAMES[locale].COLD,{exact:true}).first()).toBeVisible();
  await sound(page);await page.screenshot({path:info.outputPath('owner-'+locale+'.png'),fullPage:true});
  await page.goto('/profile/sources');await expect(page.getByText(TIER_NAMES[locale].COLD,{exact:true}).first()).toBeVisible();
  await sound(page);await page.screenshot({path:info.outputPath('level-notice-'+locale+'.png'),fullPage:true});
  expect(mutations).toEqual([]);
 });
 test('external-source preference describes availability '+locale,async({page},info)=>{
  const mutations=await world(page,locale);const c=reputationSourcesCopy[locale];
  await page.goto('/profile/sources');await expect(page.getByText(c.lookupNote,{exact:true})).toBeVisible();
  await expect(page.getByText(c.readableNote,{exact:true})).toBeVisible();
  await expect(page.getByText(c.noPartners,{exact:true})).toBeVisible();
  await sound(page);await page.screenshot({path:info.outputPath('sources-'+locale+'.png'),fullPage:true});
  const permission=page.getByRole('switch').filter({hasText:c.lookup});
  await permission.focus();await expect(permission).toBeFocused();
  await permission.click();await expect(permission).toHaveAttribute('aria-checked','true');
  expect(mutations).toEqual(['/api/me/reputation-sources']);
 });
}
