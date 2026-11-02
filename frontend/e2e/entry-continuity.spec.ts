import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { en } from '../shared/i18n/messages/en';
import { ar } from '../shared/i18n/messages/ar';
import { API, ME, funded } from './moneyFixtures';
import { PROFILE, serveSearch } from './searchFixtures';

const target = '/buyer?mode=direct&seller=%40ada&amount=120&terms=Logo#new-deal';
async function world(page:Page, {signedIn=false,newAccount=false,locale='en',theme='light'}:{signedIn?:boolean;newAccount?:boolean;locale?:string;theme?:string}={}) {
 await page.context().addCookies([{name:'karwan-locale',value:locale,domain:'127.0.0.1',path:'/'}]);
 await page.addInitScript(theme=>{localStorage.setItem('karwan-theme',theme);localStorage.setItem('karwan:guide:disabled','1');sessionStorage.setItem('karwan:search','v2');},theme);
 await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.fallback():route.abort());
 await serveSearch(page,{balances:funded});
 let authed=signedIn,created=!newAccount;
 const posts:string[]=[];
 await page.route(API+'/**',async route=>{
  const req=route.request(),u=new URL(req.url()),p=u.pathname;
  if(req.method()==='POST') posts.push(p);
  if(p==='/api/auth/bootstrap') return route.fulfill({json:{user:authed?{address:ME,method:'circle',hasPasskey:true}:null,profile:authed&&created?PROFILE:null}});
  if(p==='/api/auth/me') return route.fulfill({json:{user:authed?{address:ME,method:'circle',hasPasskey:true}:null}});
  if(p==='/api/auth/lookup') return route.fulfill({json:{exists:!newAccount,hasPasskey:false}});
  if(p==='/api/auth/otp/request') return route.fulfill({json:{sent:true}});
  if(p==='/api/auth/otp/verify') {if(req.postDataJSON().code==='000000')return route.fulfill({status:400,json:{error:'wrong code'}});authed=true;return route.fulfill({json:{user:{address:ME,method:'circle',hasPasskey:true}}});}
  if(p==='/api/signup/tag') return route.fulfill({json:{tag:u.searchParams.get('tag'),available:true}});
  if(p==='/api/signup'&&req.method()==='POST'){created=true;return route.fulfill({json:{profile:PROFILE}});}
  if(p==='/api/terms/status')return route.fulfill({json:{currentVersion:'1',acceptedVersion:created?'1':null}});
  if(p==='/api/terms/accept')return route.fulfill({json:{accepted:true}});
  if(p.startsWith('/api/profile'))return route.fulfill({json:{profile:PROFILE}});
  if(p==='/api/setup/preview')return route.fulfill({json:{lines:['Website design'],needs:[]}});
  if(p==='/api/setup/save')return route.fulfill({json:{profile:PROFILE,firstPost:{kind:'offer',handOff:'Post a different offer'}}});
  return route.fallback();
 });
 return {posts};
}
async function sound(page:Page){
 await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
 await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 const axe=await new AxeBuilder({page}).include('main').analyze();
 expect(axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
}
for(const [locale,m] of [['en',en],['ar',ar]] as const)for(const theme of ['light','dark']){
 test('returning customer keeps selected deal through code retry '+locale+' '+theme,async({page},info)=>{
  const w=await world(page,{locale,theme});await page.goto(target);
  await expect.poll(()=>new URL(page.url()).searchParams.get('next')).toBe(target);
  await expect(page.getByText(m.signup.welcome.testnetTagline)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');
  await page.getByLabel(m.signup.signIn.emailLabel,{exact:true}).fill('entry@example.com');
  await page.getByRole('button',{name:m.signup.signIn.continue,exact:true}).click();
  await page.getByLabel(m.signup.signIn.codeLabel,{exact:true}).fill('000000');
  await page.getByRole('button',{name:m.signup.signIn.verify,exact:true}).click();
  await expect(page.getByText(m.signup.errors.codeRejected)).toBeVisible();
  expect(new URL(page.url()).searchParams.get('next')).toBe(target);
  await sound(page);await page.screenshot({path:info.outputPath('retry-'+locale+'-'+theme+'.png'),fullPage:true});
  await page.getByLabel(m.signup.signIn.codeLabel,{exact:true}).fill('123456');
  await page.getByRole('button',{name:m.signup.signIn.verify,exact:true}).click();
  await expect.poll(()=>new URL(page.url()).pathname+new URL(page.url()).search+new URL(page.url()).hash).toBe(target);
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
  expect(w.posts.filter(p=>/^\/api\/(setup|assistant|deals|jobs|send|activation)\b/.test(p))).toEqual([]);
 });
 test('new account returns to its selected task after tag and terms '+locale+' '+theme,async({page},info)=>{
  const w=await world(page,{newAccount:true,locale,theme});await page.goto('/start?mode=signup&next='+encodeURIComponent(target));
  await page.getByLabel(m.signup.signUp.emailLabel,{exact:true}).fill('new-entry@example.com');
  await page.getByRole('button',{name:m.signup.signUp.sendCode,exact:true}).click();
  await page.getByLabel(m.signup.signUp.codeLabel,{exact:true}).fill('123456');
  await page.getByRole('button',{name:m.signup.signUp.verify,exact:true}).click();
  await page.getByLabel(m.signup.signUp.tagLabel,{exact:true}).fill('entry_person');
  const finish=page.getByRole('button',{name:m.startFlow.tag.continueAs.replace('{tag}','entry_person'),exact:true});
  await expect(finish).toBeDisabled();await page.getByRole('checkbox').check();await expect(finish).toBeEnabled();
  await sound(page);await page.screenshot({path:info.outputPath('tag-'+locale+'-'+theme+'.png'),fullPage:true});
  await finish.click();await expect.poll(()=>new URL(page.url()).pathname+new URL(page.url()).search+new URL(page.url()).hash).toBe(target);
  expect(w.posts).toContain('/api/signup');expect(w.posts).toContain('/api/terms/accept');expect(w.posts.some(p=>/setup|assistant|fund/.test(p)||p.startsWith('/api/deals/direct'))).toBe(false);
 });
}
for(const path of ['/seller#post-listing','/market?view=yours&list=offers','/start?step=about&next=%2Fbuyer%3Fmode%3Ddirect'])test('gate retains '+path,async({page})=>{
 await world(page);await page.goto(path);const expected=path.startsWith('/start')?'/buyer?mode=direct':path;
 await expect.poll(()=>new URL(page.url()).searchParams.get('next')).toBe(expected);
});
for(const search of ['/market?side=sell&category=design&q=logo','/market?scope=services&category=design&q=logo'])test('market header sign-in retains '+search,async({page},info)=>{
 await world(page);await page.goto(search);
 if(search.includes('scope=services')){await page.getByRole('searchbox').fill('logo kit');await expect.poll(()=>new URL(page.url()).searchParams.get('q')).toBe('logo kit');}
 const expected=new URL(page.url()).pathname+new URL(page.url()).search;
 const header=page.locator('header');
 if(!await header.getByRole('link',{name:en.common.signIn,exact:true}).isVisible())await header.getByRole('button',{name:en.nav.menuOpenAria,exact:true}).click();
 const entry=header.getByRole('link',{name:en.common.signIn,exact:true});
 await expect(entry).toHaveAttribute('href','/start?next='+encodeURIComponent(expected));
 await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);await page.screenshot({path:info.outputPath('market-entry.png'),fullPage:true});await entry.click();
 await expect.poll(()=>new URL(page.url()).searchParams.get('next')).toBe(expected);
});
for(const [locale,m] of [['en',en],['ar',ar]] as const)test('optional setup skip returns to the selected item '+locale,async({page},info)=>{
 const w=await world(page,{signedIn:true,locale});await page.goto('/start?step=about&next='+encodeURIComponent('/market?side=sell&q=logo'));
 await sound(page);await page.screenshot({path:info.outputPath('setup-'+locale+'.png'),fullPage:true});
 await page.getByRole('link',{name:m.setup.later,exact:true}).click();await expect(page).toHaveURL(/\/market\?side=sell&q=logo$/);expect(w.posts.some(p=>p.includes('setup')||p.includes('assistant'))).toBe(false);
});
test('optional setup saves preferences without opening another task',async({page})=>{
 const w=await world(page,{signedIn:true});await page.goto('/start?step=about&next='+encodeURIComponent('/market?side=sell&q=logo'));
 await page.getByRole('checkbox',{name:new RegExp(en.setup.goals.options.work.label)}).click();
 for(let i=0;i<3;i++)await page.getByRole('button',{name:en.setup.buttons.next,exact:true}).click();
 await expect(page.getByRole('heading',{name:en.startFlow.about.summary.title})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:en.startFlow.about.summary.postNow})).toHaveCount(0);
 await page.getByRole('button',{name:en.startFlow.about.summary.done,exact:true}).click();
 await expect(page).toHaveURL(/\/market\?side=sell&q=logo$/);expect(w.posts).toContain('/api/setup/save');expect(w.posts.some(p=>p.includes('assistant'))).toBe(false);
});

import {fr} from '../shared/i18n/messages/fr';
import {hi} from '../shared/i18n/messages/hi';
import {sw} from '../shared/i18n/messages/sw';
for(const [locale,m] of [['en',en],['fr',fr],['ar',ar],['hi',hi],['sw',sw]] as const)test('sign-in keeps the search context and current network '+locale,async({page},info)=>{
 await world(page,{locale});const next='/market?scope=services&q=logo';await page.goto('/start?next='+encodeURIComponent(next));
 await expect(page.getByText(m.signup.welcome.testnetTagline)).toBeVisible();
 await expect(page.getByText(m.signup.signIn.mainnetWaitlist)).toHaveCount(0);
 await expect(page.getByRole('link',{name:m.signup.signIn.browse,exact:true})).toHaveAttribute('href',next);
 const field=page.getByLabel(m.signup.signIn.emailLabel,{exact:true});await field.fill('focus@example.com');await field.focus();await page.keyboard.press('Tab');
 await expect(page.getByRole('button',{name:m.signup.signIn.continue,exact:true})).toBeFocused();
 await sound(page);await page.screenshot({path:info.outputPath('entry-'+locale+'.png'),fullPage:true});
});
