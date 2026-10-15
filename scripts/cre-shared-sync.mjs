// Copies cre/shared into backend/src/cre/shared. The workflows and the backend
// must fingerprint and decode identically, and the backend builds from its own
// folder, so it carries a copy; backend/src/cre/sharedSync.test.ts fails on drift.
//   node scripts/cre-shared-sync.mjs
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'cre', 'shared');
const target = path.join(root, 'backend', 'src', 'cre', 'shared');
const HEADER = '// Copied from cre/shared by scripts/cre-shared-sync.mjs. Edit cre/shared, then run the script.\n';

mkdirSync(target, { recursive: true });
const files = readdirSync(source).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
for (const stale of readdirSync(target).filter((f) => f.endsWith('.ts') && !files.includes(f))) {
  rmSync(path.join(target, stale));
}
for (const f of files) {
  writeFileSync(path.join(target, f), HEADER + readFileSync(path.join(source, f), 'utf8'));
}
console.log(`copied ${files.length} files to backend/src/cre/shared`);
