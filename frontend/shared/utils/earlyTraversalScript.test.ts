import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { EARLY_TRAVERSAL_SCRIPT, LOAD_KEY, markRouterReady, watchTraversals } from './earlyTraversalScript';

const ORIGIN = 'https://karwan.test';
type State = Record<string, unknown> | null;

/// A document loaded at `loadedAt` whose entry holds `state`; `now` is the
/// address when the script runs (Back can land before it).
function page(loadedAt: string, { now = loadedAt, state = { old: 1 } as State } = {}) {
  const listeners: Array<(ev: { state: State }) => void> = [];
  const reloads: string[] = [];
  const writes: string[] = [];
  const location = { pathname: '', search: '', href: '', reload() { reloads.push(location.href); } };
  const go = (href: string) => {
    const url = new URL(href, ORIGIN);
    Object.assign(location, { pathname: url.pathname, search: url.search, href: url.href });
  };
  go(now);
  const history = {
    state,
    // A browser moves the address inside pushState and replaceState.
    pushState(st: State, _u: string, url: string) { writes.push('push ' + url); history.state = st; go(url); },
    replaceState(st: State, _u: string, url: string) { writes.push('replace ' + url); history.state = st; go(url); },
  };
  const win: Record<string, unknown> = {
    location, history, URL, Date, Math,
    performance: { getEntriesByType: () => [{ name: ORIGIN + loadedAt }] },
    addEventListener(_t: string, f: (ev: { state: State }) => void) { listeners.push(f); },
    removeEventListener(_t: string, f: (ev: { state: State }) => void) { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); },
  };
  win.window = win;
  runInNewContext(EARLY_TRAVERSAL_SCRIPT, win);
  writes.length = 0;
  const h = win.history as unknown as { state: State; pushState: History['pushState']; replaceState: History['replaceState'] };
  const own = h.state;
  return {
    h, reloads, writes, own,
    /// Back or Forward to an entry holding `st`.
    popTo(href: string, st: State) { go(href); history.state = st; [...listeners].forEach((f) => f({ state: st })); },
    moveSilently(href: string) { go(href); },
    ready() { markRouterReady(win as unknown as Window); },
  };
}

test('this page stamps its own entry with its load', () => {
  const p = page('/profile');
  assert.equal(typeof p.own?.[LOAD_KEY], 'string');
  assert.equal(p.own?.old, 1);
});

test('Back to an entry from before the reload loads that page, before the app starts', () => {
  const p = page('/profile');
  p.popTo('/market?category=design&q=Logo#results', { old: 1 });
  assert.deepEqual(p.reloads, [ORIGIN + '/market?category=design&q=Logo#results']);
});

test('Back to an entry from before the reload loads that page after the app started too', () => {
  const p = page('/profile');
  p.ready();
  p.popTo('/market', { __NA: true });
  assert.deepEqual(p.reloads, [ORIGIN + '/market']);
});

test('after such a Back, nothing can write the old address over the entry', () => {
  const p = page('/profile');
  p.popTo('/market', null);
  p.h.replaceState({}, '', '/profile');
  p.h.pushState({}, '', '/profile');
  assert.deepEqual(p.writes, []);
  assert.equal(p.reloads.length, 1);
});

test('Back that lands before this script runs is caught when it starts, and that entry is not stamped', () => {
  const p = page('/profile', { now: '/market?q=Logo' });
  assert.deepEqual(p.reloads, [ORIGIN + '/market?q=Logo']);
  assert.deepEqual(p.own, { old: 1 });
});

test('a move with no popstate before the app starts is caught at the start-up write', () => {
  const p = page('/profile');
  p.moveSilently('/market');
  p.h.replaceState({}, '', '/profile');
  assert.deepEqual(p.writes, []);
  assert.deepEqual(p.reloads, [ORIGIN + '/market']);
});

test("the app's own navigation is stamped, and Back to it is left to the app", () => {
  const p = page('/profile');
  p.ready();
  p.h.pushState({ __NA: true }, '', '/market?q=Logo');
  const pushed = p.h.state;
  assert.equal(pushed?.[LOAD_KEY], p.own?.[LOAD_KEY]);
  p.popTo('/profile', p.own);
  p.popTo('/market?q=Logo', pushed);
  assert.deepEqual(p.reloads, []);
  p.h.replaceState({ __NA: true }, '', '/market?q=Logo&side=sell');
  assert.deepEqual(p.writes, ['push /market?q=Logo', 'replace /market?q=Logo&side=sell']);
});

test("before the app starts, its own writes on an unmoved page go through", () => {
  const p = page('/profile');
  p.h.replaceState({ __NA: true }, '', '/profile');
  p.h.pushState({}, '', '/market');
  assert.deepEqual(p.writes, ['replace /profile', 'push /market']);
  assert.deepEqual(p.reloads, []);
});

test('a hash-only move to an older entry stays on the page', () => {
  const p = page('/profile');
  p.ready();
  p.popTo('/profile#help', null);
  assert.deepEqual(p.reloads, []);
});

test('the start check catches a move nothing else saw', () => {
  const p = page('/profile');
  p.moveSilently('/market');
  p.ready();
  assert.deepEqual(p.reloads, [ORIGIN + '/market']);
});

function readyPage(start: string) {
  const listeners: Array<() => void> = [];
  const errorListeners: Array<() => void> = [];
  const timers = new Map<number, () => void>();
  let next = 1;
  const reloads: string[] = [];
  const location = { pathname: start, reload() { reloads.push(location.pathname); } };
  const win = {
    location,
    addEventListener(t: string, f: () => void) { (t === 'error' ? errorListeners : listeners).push(f); },
    removeEventListener(t: string, f: () => void) { const list = t === 'error' ? errorListeners : listeners; const i = list.indexOf(f); if (i >= 0) list.splice(i, 1); },
    setTimeout(f: () => void) { const id = next++; timers.set(id, f); return id; },
    clearTimeout(id: number) { timers.delete(id); },
  } as unknown as Window;
  let shown = start;
  const stop = watchTraversals(win, () => shown, 2500);
  return {
    reloads, timers, listeners, errorListeners, stop,
    crash() { [...errorListeners].forEach((f) => f()); },
    popTo(path: string) { location.pathname = path; [...listeners].forEach((f) => f()); },
    moveTo(path: string) { location.pathname = path; },
    show(path: string) { shown = path; },
    elapse() { const due = [...timers.values()]; timers.clear(); due.forEach((f) => f()); },
  };
}

test('a Back the app never finishes reloads at the address Back chose', () => {
  const p = readyPage('/profile');
  p.popTo('/market');
  p.elapse();
  assert.deepEqual(p.reloads, ['/market']);
});

test('a Back the app finishes is left alone', () => {
  const p = readyPage('/profile');
  p.popTo('/market');
  p.show('/market');
  p.elapse();
  assert.deepEqual(p.reloads, []);
});

test('an address that moves on again (a redirect) is left alone', () => {
  const p = readyPage('/profile');
  p.popTo('/guarantee');
  p.moveTo('/account');
  p.elapse();
  assert.deepEqual(p.reloads, []);
});

test('only the latest Back is watched, and stopping clears it', () => {
  const p = readyPage('/profile');
  p.popTo('/market');
  p.popTo('/deals');
  assert.equal(p.timers.size, 1);
  p.stop();
  assert.equal(p.timers.size, 0);
  assert.equal(p.listeners.length, 0);
  assert.equal(p.errorListeners.length, 0);
});

test('a crash while Back is landing reloads at once, even if the app moved its page', () => {
  const p = readyPage('/profile');
  p.popTo('/market');
  p.show('/market');
  p.crash();
  assert.deepEqual(p.reloads, ['/market']);
  assert.equal(p.timers.size, 0);
});

test('an error with no Back in flight does not reload', () => {
  const p = readyPage('/profile');
  p.crash();
  p.popTo('/market');
  p.show('/market');
  p.elapse();
  p.crash();
  assert.deepEqual(p.reloads, []);
});

test('an encoded address matches the page the app shows', () => {
  const p = readyPage('/profile');
  p.popTo('/r/%C3%A9t%C3%A9');
  p.show('/r/été');
  p.elapse();
  assert.deepEqual(p.reloads, []);
});
