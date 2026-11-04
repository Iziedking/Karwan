import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { docsAiCopy, askUrl } from '@/shared/i18n/messages/docsAi';

/// The docs in the new look (view 48, batch 9j, Figma page "Batch 9 · Docs,
/// landing, footer"), with Copy for AI, Ask Claude and Ask ChatGPT under the title.
///
///   npx tsx --test features/docs/docsLook.test.ts

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const PAGES = ['agents', 'bridge', 'deals', 'disputes', 'escrow', 'faq', 'reputation', 'roadmap'] as const;

const FILES: Record<string, string> = {
  layout: source('../../app/docs/layout.tsx'),
  numbers: source('../../app/docs/numbers/page.tsx'),
  pager: source('./components/DocsPager.tsx'),
  sidebar: source('./components/DocsSidebar.tsx'),
  toc: source('./components/DocsToc.tsx'),
  overview: source('./components/ProductOverview.tsx'),
  overviewCss: source('./components/ProductOverview.module.css'),
  prose: source('./components/Prose.tsx'),
  progress: source('./components/ReadingProgress.tsx'),
  roadmapTimeline: source('./components/RoadmapTimeline.tsx'),
  askAi: source('./components/DocsAskAi.tsx'),
  ...Object.fromEntries(PAGES.map((p) => [p, source(`../../app/docs/${p}/page.tsx`)])),
};

test('no old landing colours, nothing bold, no mono capitals', () => {
  for (const [name, s] of Object.entries(FILES)) {
    const colours = s.replace(/--lp-nav-h/g, '');
    assert.doesNotMatch(colours, /--lp-|var\(--accent\)|--accent-ink|--tint\b|#10171D|#F4F6F8/, name);
    assert.doesNotMatch(s, /font-(extra)?bold|uppercase|borderRadius/, name);
    assert.doesNotMatch(s, /text-\[(9|1[0-3])(\.\d+)?px\]/, name);
  }
  for (const [name, s] of Object.entries(FILES)) {
    if (name === 'numbers') continue; // contract addresses keep their fixed-width figures
    assert.doesNotMatch(s, /\bmono\b/, name);
  }
});

test('every page title is the same size and shows the AI buttons under it', () => {
  for (const p of PAGES) {
    const s = FILES[p];
    assert.match(s, /<h1 className="mt-3 text-\[clamp\(1\.75rem,3\.4vw,2\.5rem\)\] font-semibold leading-\[1\.12\] tracking-\[-0\.02em\] text-\[var\(--ink\)\]">/, p);
    assert.match(s, /<\/h1>\s*<DocsAskAi \/>/, p);
  }
  assert.match(FILES.overview, /<\/h1>\s*<DocsAskAi \/>/);
});

test('lists are one card of rows, and nothing but the overview action is green', () => {
  assert.match(FILES.prose, /CARD_CLASS/);
  assert.match(FILES.prose, /divide-y divide-\[var\(--line\)\]/);
  for (const [name, s] of Object.entries(FILES)) {
    if (name === 'overview') continue;
    assert.doesNotMatch(s, /--action\b|buttonClasses\(\)|buttonClasses\(\{ size/, name);
  }
  assert.equal(FILES.overview.match(/buttonClasses\(\{ size: 'lg'/g)?.length, 2);
});

test('the AI buttons copy the page and open Claude or ChatGPT with the page link', () => {
  const { askAi } = FILES;
  assert.match(askAi, /navigator\.clipboard/);
  assert.match(askAi, /askUrl\('claude'/);
  assert.match(askAi, /askUrl\('chatgpt'/);
  assert.match(askAi, /target="_blank"/);
  assert.match(askAi, /rel="noopener noreferrer"/);
  const claude = new URL(askUrl('claude', 'Read https://karwan.app/docs/escrow'));
  assert.equal(claude.origin + claude.pathname, 'https://claude.ai/new');
  assert.equal(claude.searchParams.get('q'), 'Read https://karwan.app/docs/escrow');
  const gpt = new URL(askUrl('chatgpt', 'Read it'));
  assert.equal(gpt.origin, 'https://chatgpt.com');
  assert.equal(gpt.searchParams.get('q'), 'Read it');
});

test('every language has every AI button word, the prompt carries the link, no em dashes', () => {
  const en = Object.keys(docsAiCopy.en).sort();
  for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
    assert.deepEqual(Object.keys(docsAiCopy[locale]).sort(), en, locale);
    assert.match(docsAiCopy[locale].prompt, /\{url\}/, locale);
    assert.doesNotMatch(JSON.stringify(docsAiCopy[locale]), /—/, locale);
  }
});
