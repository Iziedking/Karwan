/// Three gates on the coachmark tours, so a page and its tour cannot drift.
///
/// A tour step points at an element by `data-guide`, and the guide resolves it
/// with `document.querySelector`. Nothing tells you when that element stops
/// existing: the step just spotlights nothing and the tour reads as broken.
///
///   1. DANGLING TARGET. Every `target:` in tours.ts must have a `data-guide`
///      anchor somewhere. Anchors are written three ways, and all three count:
///      a literal attribute, a `dataGuide="..."` prop passed to a component
///      that forwards it, and a template literal like `market-${key}`, which
///      matches by prefix.
///
///   2. DOUBLE MOUNT. `registerTour` writes one slot and last writer wins, so
///      two `<PageTour>` with the same id on one screen means whichever mounts
///      last owns the pill. Each tour id may be mounted from one file.
///
///   3. UNMOUNTED TOUR. A tour with steps that no file mounts is dead copy.
///
/// The failure that prompted this: the /bridge tour was mounted INSIDE the
/// Transfer card. /bridge became a chooser of four rails, so the tour appeared
/// and vanished as the user switched rails, and never registered at all for an
/// email account, which lands on Direct. Nothing caught it, because every one of
/// its targets still existed in the file it had always been in.
///
///   npm run check:tours
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/// Relative to the package dir, matching check-i18n.ts, since the npm script
/// always runs from there.
const ROOTS = ['app', 'features', 'shared'];
const SKIP = new Set(['node_modules', '.next', 'out', 'dist', '.git']);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

const files = ROOTS.flatMap((root) => walk(root));
const read = (f: string) => readFileSync(f, 'utf8');

// ------------------------------------------------------------------- anchors
const exact = new Set<string>();
/// Prefixes from template literals: `market-${section.key}` anchors anything
/// starting `market-`. A prefix is a weaker promise than an exact anchor, so it
/// is reported separately when it is the only thing satisfying a target.
const prefixes = new Set<string>();

for (const file of files) {
  const src = read(file);
  for (const m of src.matchAll(/data-guide="([^"]+)"/g)) exact.add(m[1]!);
  for (const m of src.matchAll(/dataGuide="([^"]+)"/g)) exact.add(m[1]!);
  for (const m of src.matchAll(/data-guide=\{`([^`$]*)\$\{/g)) prefixes.add(m[1]!);
}

const resolves = (target: string) =>
  exact.has(target) || [...prefixes].some((p) => p.length > 0 && target.startsWith(p));
const onlyByPrefix = (target: string) => !exact.has(target) && resolves(target);

// ------------------------------------------------------- targets and mounts
const toursSrc = read(join('shared', 'guide', 'tours.ts'));
const targets = [...toursSrc.matchAll(/target: '([^']+)'/g)].map((m) => m[1]!);
const uniqueTargets = [...new Set(targets)];

/// Which file mounts which tour id. The id is an imported const, so match the
/// identifier rather than a string.
const mounts = new Map<string, string[]>();
for (const file of files) {
  const src = read(file);
  for (const m of src.matchAll(/<PageTour[\s\S]*?id=\{([^}]*)\}/g)) {
    // The id can be a ternary, as the market page picks between the person and
    // the business tour. Take every constant named inside the braces.
    for (const id of m[1]!.match(/[A-Z][A-Z0-9_]*/g) ?? []) {
      mounts.set(id, [...(mounts.get(id) ?? []), relative('.', file)]);
    }
  }
}
const declaredIds = [...toursSrc.matchAll(/export const ([A-Z0-9_]*TOUR_ID|WELCOME_ID) =/g)].map(
  (m) => m[1]!,
);

// ---------------------------------------------------------------- reporting
const dangling = uniqueTargets.filter((t) => !resolves(t));
const soft = uniqueTargets.filter(onlyByPrefix);
const doubled = [...mounts].filter(([, where]) => new Set(where).size > 1);
// WELCOME_ID is opened by the guide itself, not by a PageTour, so it is exempt.
const unmounted = declaredIds.filter((id) => id !== 'WELCOME_ID' && !mounts.has(id));

console.log(
  `[:TOUR TARGETS:] ${uniqueTargets.length} target(s), ${exact.size} exact anchor(s), ${prefixes.size} prefix anchor(s)`,
);
if (dangling.length) {
  console.log(`\n[:DANGLING:] ${dangling.length} target(s) point at nothing`);
  for (const t of dangling) console.log(`  ${t}`);
}
if (soft.length) {
  console.log(`\n[:PREFIX ONLY:] ${soft.length} target(s) rely on a built anchor`);
  for (const t of soft) console.log(`  ${t}`);
}
if (doubled.length) {
  console.log(`\n[:DOUBLE MOUNT:] one tour id, more than one file`);
  for (const [id, where] of doubled) console.log(`  ${id}: ${[...new Set(where)].join(', ')}`);
}
if (unmounted.length) {
  console.log(`\n[:UNMOUNTED:] declared and never mounted`);
  for (const id of unmounted) console.log(`  ${id}`);
}

if (dangling.length || doubled.length || unmounted.length) {
  console.log('\nTOURS OUT OF SYNC');
  process.exit(1);
}
console.log('\ntargets ok, mounts ok');
