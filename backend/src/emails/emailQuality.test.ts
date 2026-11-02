import assert from 'node:assert/strict';
import test from 'node:test';
import { brandedEmailHtml, emailButton, emailLink, emailUrlFallback, safeEmailUrl } from './brand.js';
import { contentFor } from './dealNotifier.js';
import { recoveryEmail } from './recovery.js';
import { dealEventHtml } from './dealEventEmail.js';
import type { KarwanEvent } from '../events.js';

const event = (type:string,payload:Record<string,unknown>={}) => ({type,jobId:'0xabc',ts:0,actor:'platform',payload}) as unknown as KarwanEvent;

test('email actions accept web destinations and reject executable or ambiguous links',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,test','//evil.example/path','https://user:secret@example.com','https://example.com/ space']) {
    assert.equal(safeEmailUrl(url),false);
    assert.doesNotMatch(emailButton('Review',url)+emailLink('Review',url)+emailUrlFallback(url),/href=/);
  }
  assert.equal(safeEmailUrl('https://karwan.site/deals/abc?next=review'),true);
  const link=emailUrlFallback('https://karwan.site/invite/secret-token');
  assert.ok(link.includes('href="https://karwan.site/invite/secret-token"'));
  assert.doesNotMatch(link,/>https:|>secret-token</);
});

test('the shell avoids generic account-state claims and marketing slogans',()=>{
  const html=brandedEmailHtml({title:'Account update',inner:''});
  assert.doesNotMatch(html,/Nothing changes on your account|One reputation for the internet/);
  assert.match(html,/support@karwan.site/);
});

test('funded deal emails disclose the agreed timed release model',()=>{
  const copy=contentFor(event('deal.accepted'),'buyer','service')!;
  assert.match(copy.body,/agreed review and release rules/);
  assert.doesNotMatch(copy.body,/only when.*accepted/);
  assert.equal(contentFor(event('deal.delivered'),'buyer','goods')!.ctaLabel,'Review the delivery');
});

test('ratings retain their material publication rule and use a clear action',()=>{
  const copy=contentFor(event('rating.reminder',{withTag:'ada',dealId:'0xabc'}),'self','service')!;
  assert.match(copy.body,/both parties.*14 days after settlement/);
  assert.equal(copy.ctaLabel,'Leave a rating');
  assert.ok(copy.ctaUrl!.endsWith('/deals/0xabc#rate'));
});

test('recovery messages never invent a release timestamp',()=>{
  for(const kind of ['started','reminder'] as const) {
    const missing=recoveryEmail(kind);
    assert.match(missing.text,/Check Karwan/);
    assert.doesNotMatch(missing.text,/Invalid Date|GMT|finishes in 1 hour/);
    assert.match(recoveryEmail(kind,{releasableAt:0}).text,/01 Jan 1970/);
  }
});

test('internal tier enums and private delivery analysis stay out of email prose',()=>{
  const tier=contentFor(event('reputation.tier-up',{toTier:'STRONG'}),'self','service')!;
  assert.match(tier.heading,/Strong/);
  assert.doesNotMatch(tier.heading,/STRONG/);
  const paused=contentFor(event('deal.release.blocked',{detail:'off-request'}),'buyer','service','INTERNAL_ANALYSIS')!;
  assert.doesNotMatch(paused.body,/INTERNAL_ANALYSIS/);
});


test('deal notification preferences point to the actual settings page',()=>{
 const html=dealEventHtml({subject:'Update',heading:'Deal update',kicker:'Deal',body:'Review this update.'});
 assert.match(html,/Notification settings/);
 assert.match(html,/href="https:[^"]*\/settings"/);
 assert.doesNotMatch(html,/verified this address|profile settings/);
});
