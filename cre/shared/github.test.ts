import { describe, expect, test } from 'bun:test';
import { GATEWAY_BLOCKED_HEADERS, githubHeaders } from './github.js';

describe('githubHeaders', () => {
  test('sends nothing the CRE gateway refuses', () => {
    const names = Object.keys(githubHeaders('t')).map((n) => n.toLowerCase());
    expect(names.filter((n) => GATEWAY_BLOCKED_HEADERS.includes(n))).toEqual([]);
  });

  test('carries the token and the pinned API version', () => {
    expect(githubHeaders('abc')).toEqual({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: 'Bearer abc',
    });
  });
});
