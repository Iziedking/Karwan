/** Local, static visual QA of the real component. No auth, API or account writes.
 * Run from frontend: npx tsx --tsconfig scripts/tsconfig.preview.json scripts/preview-capability-story.tsx
 * Open http://localhost:3102/?theme=light&locale=ar after building frontend.
 * Interaction is verified on /app; this preview covers theme and locale geometry.
 */
import React from 'react';
import { createServer } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { CapabilityIntro } from '../features/home/components/CapabilityIntro';
import { LocaleProvider } from '../shared/i18n/LocaleProvider';
import { isLocale } from '../shared/i18n/locales';

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost:3102');
  if (/^\/_next\/static\/(css|media)\/[a-zA-Z0-9._-]+\.(css|woff2)$/.test(url.pathname)) {
    const asset = new URL(`../.next/${url.pathname.slice('/_next/'.length)}`, import.meta.url);
    response.writeHead(200, { 'Content-Type': url.pathname.endsWith('.css') ? 'text/css' : 'font/woff2' });
    response.end(readFileSync(asset));
    return;
  }
  const requestedLocale = url.searchParams.get('locale');
  const locale = isLocale(requestedLocale) ? requestedLocale : 'en';
  const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const css = readdirSync(new URL('../.next/static/css/', import.meta.url)).filter((file) => file.endsWith('.css'));
  const component = renderToStaticMarkup(<LocaleProvider initialLocale={locale}><CapabilityIntro /></LocaleProvider>);
  const appHtml = readFileSync(new URL('../.next/server/app/app.html', import.meta.url), 'utf8');
  const bodyClass = appHtml.match(/<html[^>]*class="([^"]*)"/)?.[1] ?? '';
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(`<!doctype html><html class="${bodyClass}" lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css.map((file) => `<link rel="stylesheet" href="/_next/static/css/${file}">`).join('')}<title>Karwan capability visual check</title></head><body class="${bodyClass}" style="background:var(--lp-light)"><main class="product-surface" style="max-width:640px;margin:24px auto;padding:16px"><p style="font:12px sans-serif;color:var(--lp-text-sub)">Static component preview · ${theme} · ${locale}</p>${component}</main></body></html>`);
});
server.listen(3102, '127.0.0.1');
