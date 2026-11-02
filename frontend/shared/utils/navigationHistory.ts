import { dealRouteBlocked } from './routes';

/// Back uses only history entries recorded in this tab. Browser history length
/// alone cannot establish whether the previous page belongs to Karwan.
const STATE_KEY = '__karwanNavigationV2';
const STORE_KEY = 'karwan.navigation.v2';
interface Entry { id: string; href: string; previous: string | null }
const journals = new WeakMap<Window, Entry[]>();
const traversals = new WeakMap<Window, string>();

function localHref(raw: unknown, origin: string): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || /[\s\u0000-\u001f\\]/.test(raw)) return null;
  try {
    const url = new URL(raw, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : null;
  } catch { return null; }
}
function currentHref(win: Window): string { return win.location.pathname + win.location.search + win.location.hash; }
function marker(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[STATE_KEY];
  return typeof value === 'string' && /^[a-z0-9-]{1,80}$/i.test(value) ? value : null;
}
function load(win: Window): Entry[] {
  if (journals.has(win)) return journals.get(win)!;
  let entries: Entry[] = [];
  try {
    const parsed: unknown = JSON.parse(win.sessionStorage.getItem(STORE_KEY) ?? '[]');
    if (Array.isArray(parsed)) entries = parsed.slice(-80).filter((e): e is Entry =>
      !!e && typeof e === 'object' && marker({[STATE_KEY]:e.id}) !== null &&
      localHref(e.href,win.location.origin) === e.href &&
      (e.previous === null || marker({[STATE_KEY]:e.previous}) !== null));
  } catch { /* A blocked or corrupt store falls back to this page's parent. */ }
  journals.set(win,entries);
  return entries;
}
function save(win: Window, entry: Entry) {
  const entries = [...load(win).filter(e=>e.id!==entry.id),entry].slice(-80);
  journals.set(win,entries);
  try { win.sessionStorage.setItem(STORE_KEY,JSON.stringify(entries)); } catch { /* In-memory navigation still works. */ }
}
function stateWithId(state: unknown, id: string) {
  return {...(state && typeof state === 'object' ? state : {}),[STATE_KEY]:id};
}

export function installNavigationTracker(win: Window): () => void {
  const nativePush = win.history.pushState.bind(win.history);
  const nativeReplace = win.history.replaceState.bind(win.history);
  let last: Entry | null = null;
  const known = () => {
    const id=marker(win.history.state);
    return load(win).find(e=>e.id===id && e.href===currentHref(win)) ?? null;
  };
  const sync = () => {
    const existing=known();
    if (existing) { last=existing; return; }
    const href=currentHref(win);
    const onlyHashChanged=last && last.href.split('#')[0]===href.split('#')[0] && last.href!==href;
    const entry={id:win.crypto.randomUUID(),href,previous:onlyHashChanged?last!.id:null};
    nativeReplace(stateWithId(win.history.state,entry.id),'',win.location.href);
    save(win,entry); last=entry;
  };
  sync();
  const push: History['pushState'] = (data,unused,url) => {
    traversals.delete(win);
    const previous=known();
    const id=win.crypto.randomUUID();
    nativePush(stateWithId(data,id),unused,url);
    const entry={id,href:currentHref(win),previous:previous?.id ?? null};
    save(win,entry); last=entry;
  };
  const replace: History['replaceState'] = (data,unused,url) => {
    const current=known();
    const id=current?.id ?? win.crypto.randomUUID();
    nativeReplace(stateWithId(data,id),unused,url);
    const entry={id,href:currentHref(win),previous:current?.previous ?? null};
    save(win,entry); last=entry;
  };
  win.history.pushState=push;
  win.history.replaceState=replace;
  const onPop = () => { traversals.set(win,currentHref(win)); sync(); };
  win.addEventListener('popstate',onPop);
  win.addEventListener('hashchange',sync);
  return () => {
    if (win.history.pushState===push) win.history.pushState=nativePush;
    if (win.history.replaceState===replace) win.history.replaceState=nativeReplace;
    win.removeEventListener('popstate',onPop);
    win.removeEventListener('hashchange',sync);
  };
}

export function navigationBackDelta(win: Window, dealsAvailable = true): number | null {
  const entries=load(win);
  const id=marker(win.history.state);
  let entry=entries.find(e=>e.id===id && e.href===currentHref(win));
  const seen=new Set<string>();
  for(let distance=1;entry?.previous && distance<=80;distance++) {
    if(seen.has(entry.id)) return null;
    seen.add(entry.id);
    entry=entries.find(e=>e.id===entry!.previous);
    if(!entry) return null;
    const path=entry.href.split(/[?#]/)[0];
    if(entry.href!==currentHref(win) && !/^\/(?:start|waitlist)(?:\/|$)/.test(path) && !dealRouteBlocked(path,dealsAvailable)) return distance;
  }
  return null;
}

export function backWithinKarwan(dealsAvailable = true): boolean {
  if(typeof window==='undefined') return false;
  const delta=navigationBackDelta(window,dealsAvailable);
  if(delta===null) return false;
  window.history.go(-delta);
  return true;
}

/// ScrollReset must not overwrite the browser's position on Back or Forward.
export function consumeHistoryTraversal(win: Window): boolean {
  const matches=traversals.get(win)===currentHref(win);
  if(matches)traversals.delete(win);
  return matches;
}
