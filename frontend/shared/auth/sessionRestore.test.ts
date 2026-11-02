import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshOnRestore } from './sessionRestore';

test('restored account, payment, record-owner and auth pages recheck their session',()=>{
  for(const path of ['/account','/settings','/messages/ada','/deals/abc','/r/ada','/credit-passport/0xabc','/market','/start','/waitlist','/recover/cancel'])assert.equal(refreshOnRestore(path),true,path);
  for(const path of ['/','/docs','/docs/escrow','/privacy','/terms/chat','/developers/record-reads'])assert.equal(refreshOnRestore(path),false,path);
});
