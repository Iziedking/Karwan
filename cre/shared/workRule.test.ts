import { describe, expect, test } from 'bun:test';
import { GITHUB_WORK_RULE, workLevel, workStats } from './workRule.js';

const NOW = Date.parse('2026-10-15T00:00:00Z') / 1000;
const DAY = 86_400;

describe('github-work-v1', () => {
  const base = { accountAgeDays: 365, externalMergedPrs: 10, distinctExternalRepos: 3, starredExternalRepos: 0 };

  test('level 1 at exactly a year, 10 merged pull requests and 3 repositories', () => {
    expect(workLevel(base)).toBe(1);
  });

  test('no fact one short on any count', () => {
    expect(workLevel({ ...base, accountAgeDays: 364 })).toBe(0);
    expect(workLevel({ ...base, externalMergedPrs: 9 })).toBe(0);
    expect(workLevel({ ...base, distinctExternalRepos: 2 })).toBe(0);
  });

  test('level 2 adds 3 well-starred repositories or 40 merged pull requests', () => {
    expect(workLevel({ ...base, starredExternalRepos: 3 })).toBe(2);
    expect(workLevel({ ...base, externalMergedPrs: 40 })).toBe(2);
    expect(workLevel({ ...base, starredExternalRepos: 2, externalMergedPrs: 39 })).toBe(1);
  });

  test('stats count only repositories the account does not own, and only the last 12 months', () => {
    const stats = workStats({
      login: 'ada',
      createdAt: NOW - 400 * DAY,
      now: NOW,
      merged: [
        { repo: 'acme/api', mergedAt: NOW - 10 * DAY },
        { repo: 'acme/api', mergedAt: NOW - 20 * DAY },
        { repo: 'ada/own', mergedAt: NOW - 5 * DAY },
        { repo: 'ADA/own-two', mergedAt: NOW - 5 * DAY },
        { repo: 'other/web', mergedAt: NOW - 400 * DAY },
        { repo: 'third/lib', mergedAt: NOW - 30 * DAY },
      ],
      stars: { 'acme/api': 80, 'third/lib': 10 },
    });
    expect(stats).toEqual({ accountAgeDays: 400, externalMergedPrs: 3, distinctExternalRepos: 2, starredExternalRepos: 1 });
    expect(GITHUB_WORK_RULE).toBe('github-work-v1');
  });
});
