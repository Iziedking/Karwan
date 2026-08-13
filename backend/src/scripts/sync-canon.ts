import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/// `npm run sync:canon`  ·  `npm run sync:canon -- --check`
///
/// Refresh the vendored public canon from karwan-content-os, which is a
/// separate repo and deliberately not an npm dependency of this one.
///
/// The copy is what the assistant answers product questions from, so a stale
/// copy means the assistant describes a slightly older product. `--check` fails
/// instead of copying, which is the form to run in CI: it turns silent drift
/// into a red build.
///
/// If the sibling repo is not checked out this exits 0 and says so. A backend
/// developer without the content repo should not be blocked; they simply keep
/// the canon they have.

const SOURCE = resolve(
  process.cwd(),
  '..',
  '..',
  'karwan-content-os',
  'packages',
  'public-kit',
  'canon.public.json',
);
const DEST = resolve(process.cwd(), 'src', 'assistant', 'canon', 'canon.public.json');

function version(path: string): string {
  try {
    return (JSON.parse(readFileSync(path, 'utf8')) as { canonVersion?: string }).canonVersion ?? '?';
  } catch {
    return '?';
  }
}

const check = process.argv.includes('--check');

if (!existsSync(SOURCE)) {
  console.log(`karwan-content-os is not checked out beside this repo; keeping the vendored canon (${version(DEST)}).`);
  process.exit(0);
}

const same = existsSync(DEST) && readFileSync(SOURCE, 'utf8') === readFileSync(DEST, 'utf8');

if (same) {
  console.log(`canon is current (${version(DEST)}, updated ${JSON.parse(readFileSync(DEST, 'utf8')).canonUpdated}).`);
  process.exit(0);
}

if (check) {
  console.error(
    `canon has drifted: vendored ${version(DEST)} does not match ${version(SOURCE)} in karwan-content-os.\n` +
      'Run `npm run sync:canon` and commit the result.',
  );
  process.exit(1);
}

copyFileSync(SOURCE, DEST);
console.log(`canon updated to ${version(DEST)}. Commit the change.`);
