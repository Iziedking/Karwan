#!/usr/bin/env node
/**
 * One-shot RTL audit migration. Walks every .tsx/.ts/.css under app/, features/,
 * shared/, and rewrites the SAFE subset of directional Tailwind utilities to
 * their logical-property equivalents:
 *
 *   ml-*      -> ms-*
 *   mr-*      -> me-*
 *   pl-*      -> ps-*
 *   pr-*      -> pe-*
 *   text-left -> text-start
 *   text-right-> text-end
 *
 * NOT auto-migrated (manual review needed):
 *   border-l, border-r — sometimes decorative (active accent on a card edge)
 *   rounded-l-*, rounded-r-*, rounded-tl-*, etc — Karwan's design grammar uses
 *     intentional asymmetric corners on logos, CTAs, dropdowns. A blind flip
 *     would mirror them in RTL and break the brand.
 *   left-*, right-* (positioning) — centering hacks (left-1/2 -translate-x-1/2)
 *     resolve differently under logical properties. Each needs review.
 *   space-x-*, divide-x-* — no logical equivalents in Tailwind v4.
 *
 * Run from frontend/: `node scripts/rtl-migrate.mjs`
 * Idempotent. Logs each touched file with the count of substitutions.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOTS = ['app', 'features', 'shared'];
const EXTS = new Set(['.tsx', '.ts', '.css']);

const RULES = [
  // text-left / text-right come BEFORE the bare left-/right- rules so the
  // longer match wins.
  { from: /\btext-left\b/g, to: 'text-start' },
  { from: /\btext-right\b/g, to: 'text-end' },
  // Margin/padding logical equivalents. Negative variants too (-ml-, -mr-).
  { from: /(^|[\s"'`{(])(-?)ml-/g, to: '$1$2ms-' },
  { from: /(^|[\s"'`{(])(-?)mr-/g, to: '$1$2me-' },
  { from: /(^|[\s"'`{(])(-?)pl-/g, to: '$1$2ps-' },
  { from: /(^|[\s"'`{(])(-?)pr-/g, to: '$1$2pe-' },
  // border-l / border-r as standalone Tailwind classes. The trailing space or
  // quote distinguishes them from --lp-border-light vars and from variants
  // like border-l-2 (handled by a separate rule below if needed).
  { from: /\bborder-l(?=\s|"|'|`|}|\))/g, to: 'border-s' },
  { from: /\bborder-r(?=\s|"|'|`|}|\))/g, to: 'border-e' },
  // Positioning. Migrate left-N and right-N to start-N and end-N, but skip
  // the left-1/2 / right-1/2 centering pattern (combined with -translate-x-1/2
  // it centers physically; the logical version would shift off-axis in RTL).
  // The lookbehind/ahead patterns: number, decimal, fractional like 1/4 (but
  // not 1/2), arbitrary value like [Npx]. Also preserve sm: / md: / lg: /
  // hover: variants by anchoring on the prefix.
  { from: /(^|[\s"'`{(])(-?)left-(0|auto|\d+(?:\.\d+)?|\[[^\]]+\])(?=\s|"|'|`|}|\))/g, to: '$1$2start-$3' },
  { from: /(^|[\s"'`{(])(-?)right-(0|auto|\d+(?:\.\d+)?|\[[^\]]+\])(?=\s|"|'|`|}|\))/g, to: '$1$2end-$3' },
  // Variant-prefixed positioning (sm:left-3, md:right-0, etc).
  { from: /([:](-?))left-(0|auto|\d+(?:\.\d+)?|\[[^\]]+\])(?=\s|"|'|`|}|\))/g, to: '$1start-$3' },
  { from: /([:](-?))right-(0|auto|\d+(?:\.\d+)?|\[[^\]]+\])(?=\s|"|'|`|}|\))/g, to: '$1end-$3' },
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walk(full, out);
    } else {
      const dot = name.lastIndexOf('.');
      if (dot < 0) continue;
      if (!EXTS.has(name.slice(dot))) continue;
      out.push(full);
    }
  }
  return out;
}

const here = resolve(process.cwd());
const files = ROOTS.flatMap((r) => walk(resolve(here, r)));

let touched = 0;
let totalSubs = 0;
for (const file of files) {
  const src = await readFile(file, 'utf8');
  let next = src;
  let subs = 0;
  for (const { from, to } of RULES) {
    next = next.replace(from, (...args) => {
      subs += 1;
      // The lookbehind rules carry capture groups; the bare text-* ones don't.
      // Either way, the second arg pattern works: if from has $1 reference,
      // .replace handed us the captured prefix at args[1].
      const fn = typeof to === 'function' ? to : null;
      if (fn) return fn(...args);
      return to.replace(/\$(\d+)/g, (_, i) => args[Number(i)] ?? '');
    });
  }
  if (next !== src) {
    await writeFile(file, next, 'utf8');
    console.log(`${file.slice(here.length + 1)}: ${subs}`);
    touched += 1;
    totalSubs += subs;
  }
}
console.log(`\nrewrote ${touched} files, ${totalSubs} substitutions.`);
