import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { installNavigationTracker, navigationBackDelta } from './navigationHistory';

function browser(initial='/market', rawStorage: string | null=null, blocked=false) {
  const entries=[{url:new URL('https://outside.example/'),state:null as unknown},{url:new URL(initial,'https://karwan.site'),state:{__NA:true,tree:{route:initial}} as unknown}];
  let index=1;
  const store=new Map<string,string>();
  if(rawStorage!==null)store.set('karwan.navigation.v2',rawStorage);
  const listeners=new Map<string,Set<()=>void>>();
  const history={
    get state(){return entries[index].state;},get length(){return entries.length;},
    pushState(state:unknown,_unused:string,url?:string|URL|null){ entries.splice(index+1);entries.push({url:new URL(url?.toString()??entries[index].url.href,entries[index].url),state});index++; },
    replaceState(state:unknown,_unused:string,url?:string|URL|null){entries[index]={url:new URL(url?.toString()??entries[index].url.href,entries[index].url),state};},
    go(delta:number){index+=delta;for(const fn of listeners.get('popstate')??[])fn();},
  };
  const win={history,crypto:{randomUUID},get location(){return entries[index].url;},sessionStorage:{getItem(key:string){if(blocked)throw Error('blocked');return store.get(key)??null;},setItem(key:string,v:string){if(blocked)throw Error('blocked');store.set(key,v);}},addEventListener(name:string,fn:()=>void){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(fn);},removeEventListener(name:string,fn:()=>void){listeners.get(name)?.delete(fn);}} as unknown as Window;
  return {win,entries,push:(url:string)=>win.history.pushState({__NA:true,tree:{url}},'',url),replace:(url:string)=>win.history.replaceState({...win.history.state},'',url)};
}

test('external browser history never qualifies as an in-app back target',()=>{
  const b=browser('/deals/abc');installNavigationTracker(b.win);
  assert.equal(b.win.history.length,2);
  assert.equal(navigationBackDelta(b.win),null);
});

test('back and forward keep exact filters and anchors while preserving framework state',()=>{
  const b=browser('/market?category=Design#results');installNavigationTracker(b.win);
  assert.equal(b.win.history.state.__NA,true);
  b.push('/listings/abc');assert.equal(navigationBackDelta(b.win),1);
  b.win.history.go(-1);assert.equal(b.win.location.pathname+b.win.location.search+b.win.location.hash,'/market?category=Design#results');
  assert.equal(b.win.history.state.__NA,true);
  b.win.history.go(1);assert.equal(b.win.location.pathname,'/listings/abc');assert.equal(navigationBackDelta(b.win),1);
});

test('replacing a filter does not insert a duplicate history step',()=>{
  const b=browser('/app');installNavigationTracker(b.win);
  b.push('/market?q=Logo');b.replace('/market?q=Logo&category=Design');b.push('/listings/abc');
  b.win.history.go(-navigationBackDelta(b.win)!);
  assert.equal(b.win.location.search,'?q=Logo&category=Design');
  b.win.history.go(-navigationBackDelta(b.win)!);assert.equal(b.win.location.pathname,'/app');
});

test('auth screens are skipped when a task has a recorded earlier context',()=>{
  const b=browser('/market?q=Logo');installNavigationTracker(b.win);
  b.push('/start?next=%2Fsettings');b.push('/settings');
  assert.equal(navigationBackDelta(b.win),2);
  b.win.history.go(-2);assert.equal(b.win.location.pathname,'/market');
});

test('blocked storage still allows navigation in memory; corrupt stores are ignored',()=>{
  for(const raw of ['null','{}','[null,3,"bad"]','[{"id":"x","href":"//evil.example/","previous":null}]']) {
    const b=browser('/profile',raw);installNavigationTracker(b.win);assert.equal(navigationBackDelta(b.win),null);
    b.push('/settings');assert.equal(navigationBackDelta(b.win),1);
  }
  const b=browser('/market',null,true);installNavigationTracker(b.win);b.push('/listings/abc');assert.equal(navigationBackDelta(b.win),1);
});

test('reinstalling the tracker keeps the current history entry and its parent',()=>{
  const b=browser('/market?view=yours');const stop=installNavigationTracker(b.win);b.push('/profile');stop();
  const id=b.win.history.state.__karwanNavigationV2;installNavigationTracker(b.win);
  assert.equal(b.win.history.state.__karwanNavigationV2,id);assert.equal(navigationBackDelta(b.win),1);
});


test('history from an older deployment skips deal routes that are now closed',()=>{
 const b=browser('/');installNavigationTracker(b.win);b.push('/app');b.push('/account');
 assert.equal(navigationBackDelta(b.win,false),2);
});
