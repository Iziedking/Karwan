import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const source = (file: string) => readFileSync(join(root, file), 'utf8');

function componentFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) componentFiles(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

// Dialogs mount on demand, after hydration, so reading the preference while
// they render cannot disagree with server HTML.
const RAW_HOOK_ALLOWED = new Set([
  'shared/hooks/useHydratedReducedMotion.ts',
  'shared/components/Dialog.tsx',
  'shared/components/ActivationModal.tsx',
]);

test('components read reduced motion through the hydration-safe hook', () => {
  const offenders = ['app', 'features', 'shared']
    .flatMap((dir) => componentFiles(dir))
    .map((file) => relative(root, join(root, file)).replace(/\\/g, '/'))
    .filter((file) => !RAW_HOOK_ALLOWED.has(file))
    .filter((file) => /import \{[^}]*\buseReducedMotion\b[^}]*\} from '(motion\/react|framer-motion)'/.test(source(file)));
  assert.deepEqual(offenders, []);
});

test('animations are reduced from the first frame and render-time reads are gone', () => {
  assert.match(source('shared/components/AppProviders.tsx'), /<MotionConfig reducedMotion="user">/);
  assert.doesNotMatch(source('shared/components/ProfileDeck.tsx'), /matchMedia\('\(prefers-reduced-motion/);
  assert.match(source('app/stake/page.tsx'), /const \[n, setN\] = useState\(0\);/);
  assert.match(source('shared/components/RouteStage.tsx'), /motion-reduce:hidden/);
});
