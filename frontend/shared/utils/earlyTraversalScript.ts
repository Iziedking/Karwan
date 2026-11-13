/// Runs in <head> before the app starts, so it cannot import anything.
///
/// After a reload, the history entries left from before it belong to the old
/// page. Next.js cannot follow Back or Forward to one of them: before it starts,
/// the address changes but the old page stays and its start-up writes the old
/// address over that entry; after, it can stall or crash (React error 482).
/// So this page stamps every entry it writes with its own load id. Back or
/// Forward to an entry without it, at another address, reloads the page there,
/// which is what the browser does for an older page anyway (a replace would only
/// scroll when the address has a #). Before the app starts, a move with no
/// popstate is caught at its first history write, and a Back that landed before
/// this script ran is caught when it runs.
export const ROUTER_READY_KEY = '__karwanRouterReady';
export const LOAD_KEY = '__karwanLoad';

export const EARLY_TRAVERSAL_SCRIPT =
  "(function(){var w=window,k='" + ROUTER_READY_KEY + "',K='" + LOAD_KEY + "',l=w.location,h=w.history,s=l.pathname+l.search,done=0," +
  "d=Date.now().toString(36)+Math.random().toString(36).slice(2);" +
  "try{var e=w.performance.getEntriesByType('navigation')[0];if(e&&e.name){var u=new URL(e.name);s=u.pathname+u.search;}}catch(x){}" +
  "var P=h.pushState,R=h.replaceState;" +
  "function at(){return l.pathname+l.search;}" +
  "function go(){done=1;w.removeEventListener('popstate',pop);l.reload();}" +
  "function mark(x){var o={};if(x&&typeof x==='object'){for(var i in x)o[i]=x[i];}o[K]=d;return o;}" +
  "function guard(f){return function(st,t,url){if(done)return;if(!w[k]&&at()!==s)return go();var r=f.call(h,mark(st),t,url);s=at();return r;};}" +
  "function pop(ev){if(done)return;var st=ev&&ev.state;if(st&&st[K]===d){s=at();return;}if(at()!==s)go();}" +
  "w.addEventListener('popstate',pop);if(at()!==s)return go();" +
  "try{R.call(h,mark(h.state),'',l.href);}catch(x){}" +
  "h.pushState=guard(P);h.replaceState=guard(R);w[k+'Check']=function(){if(!done&&at()!==s)go();};})();";

/// A Back to an entry this page wrote is the app's, but it can still stall or
/// crash: the address moves and the page never does. If the page the app last
/// showed has not reached the address Back chose within `waitMs`, reload there;
/// if the app throws while Back is still landing, reload at once. A Back that
/// finishes, or an address that moves on again (a redirect), is left alone.
export function watchTraversals(win: Window, shownPath: () => string, waitMs = 2500): () => void {
  let timer: number | undefined;
  let target = '';
  const decoded = (path: string) => { try { return decodeURI(path); } catch { return path; } };
  const settle = (reload: boolean) => {
    if (timer !== undefined) win.clearTimeout(timer);
    timer = undefined;
    if (reload && win.location.pathname === target) win.location.reload();
  };
  const onPop = () => {
    if (timer !== undefined) win.clearTimeout(timer);
    target = win.location.pathname;
    timer = win.setTimeout(() => settle(decoded(shownPath()) !== decoded(target)), waitMs);
  };
  const onError = () => { if (timer !== undefined) settle(true); };
  win.addEventListener('popstate', onPop);
  win.addEventListener('error', onError);
  return () => {
    settle(false);
    win.removeEventListener('popstate', onPop);
    win.removeEventListener('error', onError);
  };
}

/// The app has started: catch a move nothing else saw, then let the app's own
/// history writes through without the start-up check.
export function markRouterReady(win: Window) {
  const w = win as unknown as Record<string, unknown>;
  const check = w[ROUTER_READY_KEY + 'Check'];
  if (typeof check === 'function') check();
  w[ROUTER_READY_KEY] = true;
}
