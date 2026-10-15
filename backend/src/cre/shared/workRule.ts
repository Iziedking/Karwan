// Copied from cre/shared by scripts/cre-shared-sync.mjs. Edit cre/shared, then run the script.
/// github-work-v1: a published, fixed rule. Public work in the last 12 months,
/// merged into repositories the account does not own. No model decides it.
export const GITHUB_WORK_RULE = 'github-work-v1';

const DAY = 86_400;
const WINDOW = 365 * DAY;
const WELL_STARRED = 50;

export interface WorkStats {
  accountAgeDays: number;
  externalMergedPrs: number;
  distinctExternalRepos: number;
  starredExternalRepos: number;
}

export function workLevel(s: WorkStats): 0 | 1 | 2 {
  const level1 = s.accountAgeDays >= 365 && s.externalMergedPrs >= 10 && s.distinctExternalRepos >= 3;
  if (!level1) return 0;
  return s.starredExternalRepos >= 3 || s.externalMergedPrs >= 40 ? 2 : 1;
}

export function workStats(input: {
  login: string;
  createdAt: number;
  now: number;
  merged: { repo: string; mergedAt: number }[];
  stars: Record<string, number>;
}): WorkStats {
  const own = `${input.login.toLowerCase()}/`;
  const external = input.merged.filter(
    (m) => !m.repo.toLowerCase().startsWith(own) && m.mergedAt >= input.now - WINDOW && m.mergedAt <= input.now,
  );
  const repos = [...new Set(external.map((m) => m.repo.toLowerCase()))];
  const stars = Object.fromEntries(Object.entries(input.stars).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    accountAgeDays: Math.floor((input.now - input.createdAt) / DAY),
    externalMergedPrs: external.length,
    distinctExternalRepos: repos.length,
    starredExternalRepos: repos.filter((r) => (stars[r] ?? 0) >= WELL_STARRED).length,
  };
}
