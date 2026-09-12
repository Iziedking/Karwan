import { z } from 'zod';

const segment = '[A-Za-z0-9_.-]+';
const pullUrl = new RegExp(`^https://github\\.com/([A-Za-z0-9-]+)/(${segment})/pull/([1-9][0-9]*)(?:/)?(?:[?#][^\\s]*)?$`, 'i');
export interface GitHubSubmission { repositoryOwner: string; repositoryName: string; pullNumber: number }
export function parseGitHubSubmission(proof: string | undefined): GitHubSubmission | null {
  const match = proof?.trim().match(pullUrl);
  if (!match || match[1]!.length > 39 || match[2]!.length > 100 || match[2] === '.' || match[2] === '..') return null;
  const pullNumber = Number(match[3]);
  if (!Number.isSafeInteger(pullNumber)) return null;
  return { repositoryOwner: match[1]!, repositoryName: match[2]!, pullNumber };
}

const sha = z.string().regex(/^[0-9a-fA-F]{40}$/);
const pullSchema = z.object({
  number: z.number().int().positive(),
  base: z.object({ repo: z.object({ full_name: z.string(), id: z.number().int().positive().safe() }) }),
  head: z.object({ sha }),
  merged: z.boolean(),
  merge_commit_sha: sha.nullable(),
});

/** GitHub REST 2022-11-28, GET /repos/{owner}/{repo}/pulls/{number}.
 * https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request (read 2026-09-12).
 * Node fetch only reaches this fixed API host; credentials never follow redirects.
 */
export async function resolveGitHubSubmissionSha(
  submission: GitHubSubmission,
  mode: 'head' | 'merge',
  token?: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const repo = `${submission.repositoryOwner}/${submission.repositoryName}`;
  const response = await fetcher(`https://api.github.com/repos/${encodeURIComponent(submission.repositoryOwner)}/${encodeURIComponent(submission.repositoryName)}/pulls/${submission.pullNumber}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'karwan-cre-submission',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok || !response.body) throw new Error('GITHUB_SUBMISSION_UNAVAILABLE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 512_000) throw new Error('GITHUB_SUBMISSION_UNAVAILABLE');
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const data = pullSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  if (data.number !== submission.pullNumber || data.base.repo.full_name.toLowerCase() !== repo.toLowerCase()) throw new Error('GITHUB_SUBMISSION_UNAVAILABLE');
  // GitHub exposes a synthetic test merge SHA on open PRs. Never pin it as a delivery.
  const selected = mode === 'head' ? data.head.sha : data.merged ? data.merge_commit_sha : null;
  if (!selected) throw new Error('GITHUB_SUBMISSION_NOT_MERGED');
  return selected.toLowerCase();
}
