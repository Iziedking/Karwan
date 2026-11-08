import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './backendRoutes';
import { gateProblems, staleEntries, type Accepted, type AuditReport } from './auditGate';

/// Runs `npm audit --omit=dev` on the root lockfile, which both workspaces and
/// the backend image install from. Fails on a critical or high advisory that docs/security/
/// audit-accepted.json does not list or lists with a past expiry, on an entry
/// no lockfile reports any more, and on an entry the written disposition in
/// docs/security/dependencies.md does not name.

const acceptedPath = path.join(repoRoot, 'docs', 'security', 'audit-accepted.json');
const dispositionPath = path.join(repoRoot, 'docs', 'security', 'dependencies.md');
const LOCKFILES: [string, string][] = [['root', repoRoot]];

function audit(cwd: string): AuditReport {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const run = spawnSync(npm, ['audit', '--omit=dev', '--json'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  try {
    return JSON.parse(run.stdout) as AuditReport;
  } catch {
    console.error(`npm audit in ${cwd} did not return JSON:\n${run.stderr || run.stdout}`);
    process.exit(2);
  }
}

const accepted = (JSON.parse(fs.readFileSync(acceptedPath, 'utf8')) as { accepted: Accepted[] }).accepted;
const disposition = fs.readFileSync(dispositionPath, 'utf8');
const today = new Date().toISOString().slice(0, 10);

const reports = LOCKFILES.map(([name, cwd]) => [name, audit(cwd)] as const);
const problems = reports.flatMap(([name, report]) => gateProblems(name, report, accepted, today));
for (const entry of staleEntries(reports.map(([, r]) => r), accepted)) {
  problems.push(`${entry.id} in ${entry.package} is accepted but no lockfile reports it now, remove it`);
}
for (const entry of accepted) {
  if (!disposition.includes(entry.id)) problems.push(`${entry.id} in ${entry.package} is not in docs/security/dependencies.md`);
}

if (problems.length > 0) {
  console.error(`Dependency gate failed:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`Dependency gate passed: ${accepted.length} accepted advisories, none expired, nothing new.`);
