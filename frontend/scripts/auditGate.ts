/// The dependency gate (view 69). `npm audit --json` lists vulnerable packages;
/// the advisories behind them are the objects in each `via`. A critical or high
/// advisory passes only when docs/security/audit-accepted.json lists it with an
/// expiry on or after today.

export interface AuditVia {
  source: number;
  name: string;
  title: string;
  url: string;
  severity: string;
  range: string;
}

export interface AuditReport {
  vulnerabilities: Record<string, { name: string; severity: string; via: (string | AuditVia)[] }>;
}

export interface Accepted {
  id: string;
  package: string;
  expires: string;
}

export interface Advisory {
  id: string;
  package: string;
  severity: 'critical' | 'high';
  title: string;
}

const BLOCKING = new Set(['critical', 'high']);

function advisoryId(via: AuditVia): string {
  return via.url.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i)?.[0] ?? `npm-${via.source}`;
}

export function blockingAdvisories(report: AuditReport): Advisory[] {
  const seen = new Map<string, Advisory>();
  for (const entry of Object.values(report.vulnerabilities)) {
    for (const via of entry.via) {
      if (typeof via === 'string' || !BLOCKING.has(via.severity)) continue;
      const id = advisoryId(via);
      if (!seen.has(id)) {
        seen.set(id, { id, package: via.name, severity: via.severity as Advisory['severity'], title: via.title });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.package.localeCompare(b.package) || a.id.localeCompare(b.id));
}

/// `today` and `expires` are YYYY-MM-DD, so they compare as strings.
export function gateProblems(lockfile: string, report: AuditReport, accepted: Accepted[], today: string): string[] {
  const byId = new Map(accepted.map((a) => [a.id, a]));
  const problems: string[] = [];
  for (const adv of blockingAdvisories(report)) {
    const entry = byId.get(adv.id);
    if (!entry) {
      problems.push(`${lockfile}: ${adv.severity} ${adv.id} in ${adv.package} is not accepted (${adv.title})`);
    } else if (entry.expires < today) {
      problems.push(`${lockfile}: ${adv.severity} ${adv.id} in ${adv.package} was accepted until ${entry.expires}, review it again`);
    }
  }
  return problems;
}

export function staleEntries(reports: AuditReport[], accepted: Accepted[]): Accepted[] {
  const live = new Set(reports.flatMap((r) => blockingAdvisories(r).map((a) => a.id)));
  return accepted.filter((a) => !live.has(a.id));
}
