import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGitHubSubmission, resolveGitHubSubmissionSha } from './githubSubmission.js';

const submission = { repositoryOwner: 'Iziedking', repositoryName: 'Karwan', pullNumber: 1 };
const head = 'a'.repeat(40);
const merge = 'b'.repeat(40);
const pull = { number: 1, base: { repo: { id: 1236781628, full_name: 'Iziedking/Karwan' } }, head: { sha: head }, merged: true, merge_commit_sha: merge };
const response = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

test('only one canonical GitHub PR link can become an automatic submission', () => {
  assert.deepEqual(parseGitHubSubmission(' https://github.com/Iziedking/Karwan/pull/1#discussion '), submission);
  for (const proof of ['http://github.com/a/b/pull/1', 'https://github.com.evil.test/a/b/pull/1', 'https://github.com@evil.test/a/b/pull/1', 'https://127.0.0.1/a/b/pull/1', 'https://github.com/a/../pull/1', 'https://github.com/a/b/pull/0', 'https://github.com/a/b/pull/9007199254740992', 'https://github.com/a/b/pull/1 https://github.com/a/b/pull/2', 'https://github.com/a/b/pull/1/files']) assert.equal(parseGitHubSubmission(proof), null, proof);
});

test('pins head or actual merged SHA without using the synthetic open-PR merge SHA', async () => {
  assert.equal(await resolveGitHubSubmissionSha(submission, 'merge', undefined, response(pull)), merge);
  assert.equal(await resolveGitHubSubmissionSha(submission, 'head', undefined, response(pull)), head);
  await assert.rejects(resolveGitHubSubmissionSha(submission, 'merge', undefined, response({ ...pull, merged: false })), /NOT_MERGED/);
});

test('GitHub credentials only reach the fixed API host and redirects are refused', async () => {
  const fetcher = (async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.github.com/repos/Iziedking/Karwan/pulls/1');
    assert.equal(init.redirect, 'error');
    assert.equal((init.headers as Record<string,string>).Authorization, 'Bearer fixture-only');
    return new Response(JSON.stringify(pull));
  }) as typeof fetch;
  await resolveGitHubSubmissionSha(submission, 'merge', 'fixture-only', fetcher);
});

test('denied, mismatched, oversized and malformed GitHub responses cannot pin a SHA', async () => {
  for (const status of [301,403,404,429,500]) await assert.rejects(resolveGitHubSubmissionSha(submission, 'merge', undefined, response({},status)));
  for (const body of [{...pull,number:2}, {...pull,base:{repo:{id:1,full_name:'wrong/repo'}}}, {...pull,head:{sha:'bad'}}, 'x'.repeat(512001)]) await assert.rejects(resolveGitHubSubmissionSha(submission,'merge',undefined,response(body)));
});
