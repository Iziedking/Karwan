/// Two i18n gates in one pass.
///
/// 1. PARITY. Every locale must carry every key `en` carries, and no extras.
///    The `Messages` type already enforces this for required keys, so the real
///    catch here is a key that was made optional: one of those went missing in
///    all four translations for months while the widget quietly rendered the
///    English inlined at the call site. Parity is also reported as
///    "identical to en", which is a translator's to-do list rather than an
///    error, since plenty of values (USDC, Arc, ISO 9001) are the same in
///    every language on purpose.
///
/// 2. HARDCODED COPY. User-facing English that never entered the messages
///    files at all: JSX text nodes and the string props that render as copy.
///    Heuristic, so it prints candidates rather than asserting each is a bug.
///
/// Admin is excluded. `app/admin/*` is an internal operator surface and only
/// one of its pages has ever been translated; sweeping it in would bury the
/// customer-facing gaps under a hundred rows nobody intends to translate.
///
///   npm run check:i18n           parity + a per-file count
///   npm run check:i18n -- --detail <substring>   every candidate in a file
///
/// Exits non-zero on a parity break only. Hardcoded copy is advisory: the
/// count moves as the product grows and a build should not fail on a heuristic.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { en } from '../shared/i18n/messages/en.js';
import { ar } from '../shared/i18n/messages/ar.js';
import { fr } from '../shared/i18n/messages/fr.js';
import { hi } from '../shared/i18n/messages/hi.js';
import { sw } from '../shared/i18n/messages/sw.js';

type Node = Record<string, unknown>;

function flatten(obj: Node, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v as Node, key, out);
    else out.set(key, String(v));
  }
  return out;
}

const flatEn = flatten(en as unknown as Node);
const locales: Array<[string, Node]> = [
  ['ar', ar as unknown as Node],
  ['fr', fr as unknown as Node],
  ['hi', hi as unknown as Node],
  ['sw', sw as unknown as Node],
];

let parityBroken = false;
console.log(`[:PARITY:] en carries ${flatEn.size} keys`);
for (const [name, obj] of locales) {
  const flat = flatten(obj);
  const missing = [...flatEn.keys()].filter((k) => !flat.has(k));
  const extra = [...flat.keys()].filter((k) => !flatEn.has(k));
  /// A value byte-identical to English is either untranslated or a term that
  /// does not translate. Short and symbol-only values are dropped so the
  /// number stays readable.
  const untranslated = [...flat.entries()].filter(([k, v]) => {
    const enV = flatEn.get(k);
    return enV !== undefined && v === enV && v.trim().length >= 4 && /[a-z]/i.test(v);
  });
  if (missing.length || extra.length) parityBroken = true;
  console.log(
    `  ${name}  missing=${missing.length}  extra=${extra.length}  identical-to-en=${untranslated.length}`,
  );
  for (const k of missing) console.log(`      MISSING ${k}`);
  for (const k of extra) console.log(`      EXTRA   ${k}`);
}

const ROOTS = ['app', 'features', 'shared'];
const SKIP_DIR = new Set(['node_modules', '.next', 'i18n', 'admin']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/// Prose, not identifiers: two or more words, or one long word, with a letter
/// in it. Rules out class names, bracket tags, paths, units and camelCase.
function isProse(s: string): boolean {
  const t = s.trim();
  if (t.length < 4) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  if (/^[A-Z0-9_.:\-\/\[\]]+$/.test(t)) return false;
  if (/^(https?:|\/|#|\{|var\(|--)/.test(t)) return false;
  if (/^[a-z]+(-[a-z0-9]+)+$/.test(t)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(t) && t.length < 12) return false;
  return /\s/.test(t) || t.length >= 12;
}

const PROP_RE =
  /\b(placeholder|aria-label|title|alt|label|ariaLabel)=(?:"([^"]{4,})"|'([^']{4,})'|\{'([^']{4,})'\}|\{"([^"]{4,})"\})/g;
const TEXT_RE = />([^<>{}\n]{4,})</g;

type Hit = { file: string; line: number; kind: string; text: string };
const hits: Hit[] = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
        for (const m of line.matchAll(PROP_RE)) {
          const text = m[2] ?? m[3] ?? m[4] ?? m[5] ?? '';
          if (isProse(text)) hits.push({ file: relative('.', file), line: i + 1, kind: m[1]!, text });
        }
        for (const m of line.matchAll(TEXT_RE)) {
          if (isProse(m[1]!)) hits.push({ file: relative('.', file), line: i + 1, kind: 'text', text: m[1]! });
        }
      });
  }
}

const byFile = new Map<string, Hit[]>();
for (const h of hits) byFile.set(h.file, [...(byFile.get(h.file) ?? []), h]);
const ranked = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);

console.log(`\n[:HARDCODED:] ${hits.length} candidates across ${byFile.size} files (advisory)`);
const detailIdx = process.argv.indexOf('--detail');
const only = detailIdx >= 0 ? process.argv[detailIdx + 1] : undefined;
for (const [file, list] of ranked) {
  console.log(`  ${String(list.length).padStart(3)}  ${file}`);
  if (detailIdx >= 0 && (!only || file.includes(only))) {
    for (const h of list) console.log(`         ${h.line}  [${h.kind}] ${h.text.trim()}`);
  }
}

/// 3. LEDGER TEMPLATES. Every row the backend writes to the activity log names
///    a client template in `params.t`, and the transaction-history panel renders
///    it from `activity.myMoney.text`. A backend row whose template has no entry
///    there silently falls back to the English `summary` written at record time,
///    which is exactly the "why is this row in English" bug nobody reports.
///    This walks the backend for the names it emits and checks each one exists.
/// `t` is often a ternary (`t: settled ? 'dealPayoutFinal' : 'dealPayout'`), so
/// match the whole expression after `t:` and pull every literal out of it. A
/// regex that only accepted a bare literal silently skipped those rows, which
/// made the gate report a clean run while missing half the templates.
const TEMPLATE_RE = /params:\s*\{\s*t:\s*([\s\S]{0,240}?)(?:,\s*\n|\}\s*,)/g;
const LITERAL_RE = /'([A-Za-z][A-Za-z0-9_]*)'/g;
const emitted = new Set<string>();
function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkTs(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const backendSrc = join('..', 'backend', 'src');
let templatesBroken = false;
try {
  for (const file of walkTs(backendSrc)) {
    for (const m of readFileSync(file, 'utf8').matchAll(TEMPLATE_RE)) {
      // Drop comparison operands: `fn === 'claim' ? 'unstakeClaim' : ...` names
      // a template in each BRANCH, never in the test, and counting the operand
      // reported a missing template that was never referenced.
      const expr = m[1]!.replace(/[=!]==?\s*'[^']*'/g, '');
      for (const lit of expr.matchAll(LITERAL_RE)) emitted.add(lit[1]!);
    }
  }
  const known = new Set(Object.keys((en as unknown as Node).activity as Node ? ((en.activity as unknown as { myMoney: { text: Record<string, string> } }).myMoney.text) : {}));
  const orphans = [...emitted].filter((t) => !known.has(t));
  console.log(`
[:LEDGER TEMPLATES:] backend emits ${emitted.size}, messages define ${known.size}`);
  for (const o of orphans) console.log(`      NO TEMPLATE  ${o}`);
  if (orphans.length) templatesBroken = true;
} catch (err) {
  console.log(`
[:LEDGER TEMPLATES:] skipped (${(err as Error).message})`);
}

// --- GATE: RTL-safe layout ---
//
// Arabic flips the whole page via `document.documentElement.dir`, and almost all
// of this app flips with it for free because the layout is flex, grid and gap.
// The exceptions are physical directional utilities: `ml-2` is "left" in every
// language, so it stays pinned to the wrong side in Arabic while everything
// around it moves. Logical utilities (`ms-`, `pe-`, `border-s-`, `text-end`)
// mean "start" and "end" and follow the direction.
//
// Cheap to enforce, and it is the only RTL defect that is detectable without
// rendering the page. `admin` is out of scope for i18n and so out of scope here.
const PHYSICAL_RE =
  /(?:^|["'\s])(?:ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r)-[0-9a-z[]|(?:^|["'\s])text-(?:left|right)\b/;
const LOGICAL_HINT: Record<string, string> = {
  ml: 'ms', mr: 'me', pl: 'ps', pr: 'pe',
  'border-l': 'border-s', 'border-r': 'border-e',
  'rounded-l': 'rounded-s', 'rounded-r': 'rounded-e',
  'text-left': 'text-start', 'text-right': 'text-end',
};
const rtlHits: Array<{ file: string; line: number; cls: string }> = [];
for (const file of walk('app').concat(walk('features'), walk('shared'))) {
  if (!file.endsWith('.tsx')) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (!PHYSICAL_RE.test(line)) return;
    const cls = Object.keys(LOGICAL_HINT).find((k) =>
      new RegExp(`(?:^|["'\\s])${k}-[0-9a-z[]|(?:^|["'\\s])${k}\\b`).test(line),
    );
    rtlHits.push({ file, line: i + 1, cls: cls ?? '?' });
  });
}
console.log(`\n[:RTL LAYOUT:] ${rtlHits.length} physical directional class${rtlHits.length === 1 ? '' : 'es'} outside admin`);
for (const h of rtlHits) {
  console.log(`      ${h.file}:${h.line}  ${h.cls} -> ${LOGICAL_HINT[h.cls] ?? 'logical equivalent'}`);
}

// --- GATE: French text that lost its diacritics ---
//
// Not a translation-quality check. A shell heredoc once mangled escapes while
// these strings were being written, and the fix at the time was to strip the
// characters that broke it: accents and elided apostrophes both went. The
// result reads as broken French to anyone who speaks it, and it is invisible to
// the type system because the string is still a string.
//
// Only forms that are ALWAYS accented in French are listed, so `Annuler`,
// `Remboursement` and masculine `premier` do not trip it.
const FR_STRIPPED =
  /\b(premiere|premieres|regle|reglee|libere|liberation|recuperes?|recus|resolu|annulee|livree|deposes|rembourses|payes|eclaireur|reclames|deployes|retires|deplaces|dote|approvisionne|debut|bientot|reessay|activite|securite|priorite|numero|echeance|deja|apres)\b/i;
const frLines = readFileSync(join('shared', 'i18n', 'messages', 'fr.ts'), 'utf8').split('\n');
const frHits: Array<{ line: number; text: string }> = [];
frLines.forEach((line, i) => {
  const m = line.match(/: *(['"])((?:(?!\1).){4,})\1/);
  if (!m) return;
  const s = m[2]!;
  // An elided apostrophe rendered as a space: `l agent`, `n a pas`, `d un`.
  //
  // Anchored on whitespace rather than \b on purpose. JavaScript's \w is ASCII
  // only, so every accented letter creates a word boundary beside it and `\bs `
  // matches the tail of `réglés ou` — which flagged two dozen perfectly good
  // strings the first time this ran.
  const bareElision = /(?:^|[\s(“"])(?:d|l|n|s|j|c|qu) [aeiouyàâéèêëîïôûùh]/.test(s);
  if (/[éèêëàâîïôûùçÉÈÊÀÂÎÔÛÙÇ]/.test(s) && !bareElision) return;
  if (!FR_STRIPPED.test(s) && !bareElision) return;
  frHits.push({ line: i + 1, text: s.slice(0, 78) });
});
console.log(`\n[:FRENCH TEXT:] ${frHits.length} string${frHits.length === 1 ? '' : 's'} missing accents or apostrophes`);
for (const h of frHits) console.log(`      fr.ts:${h.line}  ${h.text}`);

if (parityBroken || templatesBroken || rtlHits.length || frHits.length) {
  console.log(
    parityBroken ? '\nPARITY BROKEN'
    : templatesBroken ? '\nLEDGER TEMPLATE MISSING'
    : rtlHits.length ? '\nRTL LAYOUT BROKEN'
    : '\nFRENCH TEXT BROKEN',
  );
  process.exit(1);
}
console.log('\nparity ok, ledger templates ok, rtl ok, french ok');
