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

if (parityBroken) {
  console.log('\nPARITY BROKEN');
  process.exit(1);
}
console.log('\nparity ok');
