import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInviteUrl } from './inviteLink';

test('invite links keep only the origin and encoded token', () => {
  assert.equal(
    buildInviteUrl('https://karwan.site///', 'token/with spaces'),
    'https://karwan.site/invite/token%2Fwith%20spaces',
  );
});

test('invite links work with a local origin', () => {
  assert.equal(
    buildInviteUrl('http://localhost:3000', 'abc123'),
    'http://localhost:3000/invite/abc123',
  );
});
