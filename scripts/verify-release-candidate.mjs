import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const runTimestamp = new Date().toISOString();
const artifactDirectory = path.join(
  root,
  '.scratch',
  'release-candidate',
  runTimestamp.replaceAll(':', '-'),
);

const checks = [
  { id: 'typecheck', args: ['run', 'typecheck'] },
  { id: 'backend-tests', args: ['run', 'test:ci', '--workspace=backend'] },
  { id: 'frontend-tests', args: ['run', 'test:ci', '--workspace=frontend'] },
  { id: 'contracts', args: ['run', 'contracts:test'] },
  { id: 'cre-typecheck', args: ['run', 'cre:github:typecheck'] },
  { id: 'cre-tests', args: ['run', 'cre:github:test'] },
  { id: 'localization', args: ['run', 'check:i18n', '--workspace=frontend'] },
  { id: 'shell-model', args: ['run', 'check:shell', '--workspace=frontend'] },
  { id: 'production-build', args: ['run', 'build'] },
];

const MAX_SUMMARY_BUFFER_BYTES = 512 * 1024;

function appendBounded(current, chunk) {
  const combined = current + chunk;
  return combined.length <= MAX_SUMMARY_BUFFER_BYTES
    ? combined
    : combined.slice(-MAX_SUMMARY_BUFFER_BYTES);
}

function extractMatch(output, pattern, labels) {
  const match = output.match(pattern);
  if (!match) return undefined;
  return Object.fromEntries(labels.map((label, index) => [label, Number(match[index + 1])]));
}

function summarizeCheck(id, output) {
  if (id === 'backend-tests' || id === 'frontend-tests') {
    const values = {};
    for (const label of ['tests', 'pass', 'fail', 'skipped']) {
      const matches = [...output.matchAll(new RegExp(`# ${label} (\\d+)`, 'g'))];
      if (matches.length > 0) values[label] = Number(matches.at(-1)[1]);
    }
    return Object.keys(values).length > 0 ? values : undefined;
  }
  if (id === 'contracts') {
    return extractMatch(
      output,
      /Ran (\d+) test suites[^:]*: (\d+) tests passed, (\d+) failed, (\d+) skipped \((\d+) total tests\)/,
      ['suites', 'pass', 'fail', 'skipped', 'tests'],
    );
  }
  if (id === 'cre-tests') {
    return extractMatch(output, /\n\s*(\d+) pass\n\s*(\d+) fail/, ['pass', 'fail']);
  }
  if (id === 'localization') {
    const parity = output.match(/\[:PARITY:\] en carries (\d+) keys/);
    return parity ? { englishKeys: Number(parity[1]), localeParity: 'pass' } : undefined;
  }
  if (id === 'shell-model') {
    return output.includes('Shell route model passed.') ? { routeModel: 'pass' } : undefined;
  }
  if (id === 'production-build') {
    const pages = [...output.matchAll(/Generating static pages \((\d+)\/(\d+)\)/g)].at(-1);
    return pages ? { generatedPages: Number(pages[1]), totalPages: Number(pages[2]) } : undefined;
  }
  return undefined;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = new Date();
    let output = '';
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: { ...process.env, CI: '1' },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    for (const [stream, destination] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        destination.write(chunk);
        output = appendBounded(output, chunk);
      });
    }

    child.once('error', (error) => {
      resolve({
        exitCode: -1,
        errorCode: error.code ?? 'SPAWN_ERROR',
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        output,
      });
    });
    child.once('exit', (exitCode) => {
      resolve({
        exitCode: exitCode ?? -1,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        output,
      });
    });
  });
}

async function readGitValue(args) {
  let output = '';
  const child = spawn('git', args, {
    cwd: root,
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  const result = await new Promise((resolve) => {
    child.once('error', () => resolve(false));
    child.once('exit', (exitCode) => resolve(exitCode === 0));
  });
  return result ? output.trim() : 'unavailable';
}

await mkdir(artifactDirectory, { recursive: true });

const results = [];
for (const check of checks) {
  const printableCommand = `npm ${check.args.join(' ')}`;
  process.stdout.write(`\n[candidate] ${check.id}: ${printableCommand}\n`);
  const execution = await runProcess(npmCommand, check.args);
  const { output, ...recordedExecution } = execution;
  results.push({
    id: check.id,
    command: printableCommand,
    ...recordedExecution,
    details: summarizeCheck(check.id, output),
    result: execution.exitCode === 0 ? 'pass' : 'fail',
  });
}

const [revision, branch, workspaceStatus] = await Promise.all([
  readGitValue(['rev-parse', 'HEAD']),
  readGitValue(['branch', '--show-current']),
  readGitValue(['status', '--porcelain']),
]);
const failedChecks = results.filter((result) => result.result === 'fail');
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  executionMode: 'local-verification',
  source: {
    revision,
    branch,
    workspaceClean: workspaceStatus === '',
    changedPaths: workspaceStatus === '' ? [] : workspaceStatus.split(/\r?\n/),
  },
  capabilityTruth: {
    localChecks: 'executed',
    browserRehearsal: 'not-executed',
    worldAgentBookProvider: 'not-executed',
    creAuthenticatedSimulation: 'not-executed',
    arcTestnetTransactions: 'not-executed',
    liveOrMainnetActions: 'not-executed',
  },
  summary: {
    total: results.length,
    passed: results.length - failedChecks.length,
    failed: failedChecks.length,
  },
  checks: results,
};
const manifestPath = path.join(artifactDirectory, 'verification.json');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

process.stdout.write(`\n[candidate] manifest: ${manifestPath}\n`);
process.stdout.write(
  `[candidate] result: ${manifest.summary.passed}/${manifest.summary.total} checks passed\n`,
);
if (failedChecks.length > 0) {
  process.exitCode = 1;
}
