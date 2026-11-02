import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { en } from '../shared/i18n/messages/en';
import { fr } from '../shared/i18n/messages/fr';
import { ar } from '../shared/i18n/messages/ar';
import { hi } from '../shared/i18n/messages/hi';
import { sw } from '../shared/i18n/messages/sw';
import { chatTermsCopy } from '../shared/i18n/messages/chatTerms';
import { signupCopy } from '../shared/i18n/messages/signup';
import { API, funded } from './moneyFixtures';
import { serveSearch } from './searchFixtures';

for (const locale of ['en','fr','ar','hi','sw'] as const) for (const theme of ['light','dark']) {
  test('help and sign-in context '+locale+' '+theme, async ({page}, info) => {
    await page.context().addCookies([{name:'karwan-locale',value:locale,domain:'127.0.0.1',path:'/'}]);
    await page.addInitScript(theme => { localStorage.setItem('karwan-theme',theme); localStorage.setItem('karwan:guide:disabled','1'); },theme);
    await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.fallback():r.abort());
    await serveSearch(page,{balances:funded});
    await page.route(API+'/api/auth/**',r=>r.fulfill({json:{user:null,profile:null}}));
    await page.goto('/terms/chat');
    await expect(page.getByRole('heading',{level:1,name:chatTermsCopy[locale].title})).toBeVisible();
    await expect(page.getByText(chatTermsCopy[locale].sections[7].body,{exact:true})).toBeVisible();
    await expect(page.getByText(chatTermsCopy[locale].sections[4].body,{exact:true})).toBeVisible();
    await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
    await page.evaluate(()=>document.fonts.ready);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
    await page.screenshot({path:info.outputPath('terms-'+locale+'-'+theme+'.png'),fullPage:true});
    for (const [destination,kind] of [['/deposit/request/example','direct'],['/deals/example','deal'],['/app','general']] as const) {
      await page.goto('/start?next='+encodeURIComponent(destination));
      const t=signupCopy[locale].signIn;
      await expect(page.getByText(t.trustNoMoney,{exact:true})).toBeVisible();
      await expect(page.getByText(t.trustDirectPayment,{exact:true})).toHaveCount(kind==='direct'?1:0);
      await expect(page.getByText(t.trustEscrow,{exact:true})).toHaveCount(kind==='deal'?1:0);
      await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
      if(kind==='direct') {
        const results=await new AxeBuilder({page}).include('main').analyze();
        expect(results.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
        await page.screenshot({path:info.outputPath('signin-'+locale+'-'+theme+'.png'),fullPage:true});
      }
    }
  });
}


const homeCopies={en,fr,ar,hi,sw};
for(const locale of ['en','fr','ar','hi','sw'] as const)for(const theme of ['light','dark'])test('account status recovery '+locale+' '+theme,async({page},info)=>{
 const copy=homeCopies[locale];let unavailable=true;const writes:string[]=[];
 await page.context().addCookies([{name:'karwan-locale',value:locale,domain:'127.0.0.1',path:'/'}]);
 await page.addInitScript(theme=>{localStorage.setItem('karwan-theme',theme);localStorage.setItem('karwan:guide:disabled','1');},theme);
 await serveSearch(page,{balances:funded});
 await page.route('**/*',r=>['127.0.0.1','localhost'].includes(new URL(r.request().url()).hostname)?r.fallback():r.abort());
 await page.route(API+'/**',r=>{const p=new URL(r.request().url()).pathname;if(r.request().method()==='POST')writes.push(p);if(p==='/api/agents/status'&&unavailable)return r.fulfill({status:503,json:{error:'internal service unavailable'}});return r.fallback();});
 await page.goto('/app');await expect(page.getByRole('heading',{name:copy.appHome.backendOffline.title,exact:true})).toBeVisible({timeout:20000});
 expect(await page.locator('main').innerText()).not.toMatch(/127\.0\.0\.1|localhost|\/api\/|internal service unavailable/);
 await expect(page.locator('.karwan-splash-mark')).toHaveCount(0);
 const result=await new AxeBuilder({page}).include('main').analyze();expect(result.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await page.screenshot({path:info.outputPath('account-recovery-'+locale+'-'+theme+'.png'),fullPage:true});
 unavailable=false;await page.getByRole('button',{name:copy.accountHome.balanceRetry,exact:true}).click();
 await expect(page.getByRole('heading',{name:copy.appHome.backendOffline.title,exact:true})).toHaveCount(0);
 expect(writes.filter(p=>!p.startsWith('/api/client-errors'))).toEqual([]);
});
