import { safeNext } from './safeNext';

/// Keep intent in the link itself, so tabs and accounts do not share a stale destination.
export function signInHref(current: string): string {
  if (!current.startsWith('/') || current.startsWith('//')) return '/start';
  const url = new URL(current, 'https://karwan.invalid');
  const target = /^\/start(?:\/|$)/i.test(url.pathname)
    ? safeNext(url.searchParams.get('next'))
    : safeNext(current);
  return target ? '/start?next=' + encodeURIComponent(target) : '/start';
}

/// Browsing a trade item or filtered market should survive account entry.
export function publicTaskEntry(fallback: string, current: string): string {
  const task = safeNext(current);
  return task && /^\/(market|listings|jobs|order|contests|work\/requests)(?:\/|\?|#|$)/.test(task) ? signInHref(task) : fallback;
}
