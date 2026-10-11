import assert from 'node:assert/strict';
import test from 'node:test';

process.env.SESSION_SECRET ??= 'profile-delete-test-secret-at-least-32-characters';
const { profileRoutes } = await import('./profile.js');
const { signSession } = await import('../auth/session.js');
const { saveTelegramAccount, findTelegramAccountByAddress } = await import('../db/telegramAccounts.js');
const { createUser, getUserByAddress } = await import('../db/users.js');

const CHAT = `0x${'c4'.repeat(20)}`;

test('a chat account cannot be deleted from the web page: it is pointed to /delete and nothing is removed', async () => {
  await saveTelegramAccount({ numberHash: `h-${CHAT}`, to: 'tg:1', address: CHAT, termsVersion: 'chat', termsAt: 1, lastInboundAt: 1, activated: true });
  if (!getUserByAddress(CHAT)) createUser({ email: `${CHAT}@telegram.invalid`, address: CHAT, circleIdentityWalletId: 'w' });
  const cookie = `karwan_session=${signSession({ address: CHAT, method: 'circle' })}`;
  const res = await profileRoutes.request(`/?address=${CHAT}&force=true`, { method: 'DELETE', headers: { cookie } });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string; error: string };
  assert.equal(body.code, 'chat-account');
  assert.match(body.error, /\/delete/);
  assert.ok(await findTelegramAccountByAddress(CHAT));
  assert.ok(getUserByAddress(CHAT));
});
