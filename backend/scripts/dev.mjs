/// Local dev that boots.
///
/// `tsx watch src/index.ts` cannot start this app. It dies linking
/// `@circle-fin/adapter-circle-wallets`, which imports `Blockchain` from
/// `@circle-fin/developer-controlled-wallets`:
///
///   SyntaxError: The requested module '@circle-fin/developer-controlled-wallets'
///   does not provide an export named 'Blockchain'
///
/// The packages are fine and production is fine. npm installed TWO copies of the
/// wallets SDK: 9.6.0 at the top level, which our own code uses, and 10.8.0
/// nested under the adapter, which is the copy the adapter needs. Node resolves
/// the nested one, and 10.8.0 ships an `exports` map pointing at an ES build that
/// does export `Blockchain`. tsx resolves the top-level 9.6.0 instead, which has
/// no `exports` map at all, so it loads as CommonJS and the named export is never
/// detected.
///
/// The fix is not to bump a major SDK version to satisfy a dev tool. It is to run
/// dev the way production runs: compile, then let node resolve.
///
/// Verified by reduction: a one-line file importing the adapter fails under tsx
/// and succeeds under node, from the same directory and the same node_modules.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const backend = resolve(here, '..');
const entry = join(backend, 'dist', 'index.js');
const envFile = resolve(backend, '..', '.env');

const children = [];

/// `shell` is opt-in per call, not global. `npx` and `tsc` are npm shims on
/// Windows and need one; the node binary must NOT have one, because its path
/// contains a space and cmd splits on it ("'C:\\Program' is not recognized").
function run(label, command, args, { shell = false } = {}) {
  const child = spawn(command, args, { cwd: backend, stdio: 'inherit', shell });
  child.on('exit', (code, signal) => {
    if (signal) return; // our own shutdown
    console.error(`[dev] ${label} exited with ${code}`);
    stop(code ?? 1);
  });
  children.push(child);
  return child;
}

function stop(code) {
  for (const c of children) {
    if (!c.killed) c.kill('SIGTERM');
  }
  process.exit(code);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => stop(0));
}

/// One full build, awaited. Polling for dist/index.js instead would race the
/// compiler: tsc writes files as it goes, so the entry point exists well before
/// its imports do, and the server would boot against a half-written tree.
console.log('[dev] building');
const build = spawn('npx', ['tsc', '-p', 'tsconfig.json'], {
  cwd: backend,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
const buildCode = await new Promise((r) => build.on('exit', r));
if (buildCode !== 0) {
  console.error('[dev] build failed; not starting');
  process.exit(buildCode ?? 1);
}

// --preserveWatchOutput so rebuilds do not clear the screen and wipe the server
// logs you are reading.
run('tsc', 'npx', ['tsc', '-w', '-p', 'tsconfig.json', '--preserveWatchOutput'], {
  shell: process.platform === 'win32',
});

console.log('[dev] starting server, watching dist');
run('server', process.execPath, [
  '--watch',
  '--watch-preserve-output',
  '--enable-source-maps',
  `--env-file=${envFile}`,
  entry,
]);
