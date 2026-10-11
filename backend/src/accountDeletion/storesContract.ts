import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Fresh each run: the file stores outlive a test run.
const A = `0x${randomBytes(20).toString('hex')}`;
const B = `0x${randomBytes(20).toString('hex')}`;

/// Writes the same data for two accounts, deletes one through the new delete
/// functions, and reads every store back: the first is gone, the second is
/// whole. Imported after the database mode is chosen, so it runs in memory
/// and on Postgres.
export async function checkAccountStores(): Promise<void> {
  const activity = await import('../db/activityLog.js');
  const usage = await import('../db/assistantUsage.js');
  const wallets = await import('../db/agentWallets.js');
  const telegram = await import('../db/telegramAccounts.js');
  const whatsapp = await import('../db/whatsapp.js');
  const evidence = await import('../db/evidence.js');
  const users = await import('../db/users.js');
  const links = await import('../db/telegramLinks.js');
  const client = await import('../db/client.js');

  for (const who of [A, B]) {
    await activity.appendActivity({ address: who, kind: 'deposit', summary: 'test' });
    await usage.consumeAssistantQuota(who, 10, 50);
    await wallets.saveAgentWallets({
      userAddress: who,
      buyerWalletId: `buyer-${who}`,
      buyerAddress: `0x${who.slice(2, 40)}01`,
      sellerWalletId: `seller-${who}`,
      sellerAddress: `0x${who.slice(2, 40)}02`,
    });
    const blank = { to: `tg:${who.slice(-4)}`, address: who, termsVersion: 'chat', termsAt: 1, lastInboundAt: 1 };
    await telegram.saveTelegramAccount({ ...blank, numberHash: `tg-hash-${who}` });
    await whatsapp.saveWhatsappAccount({ ...blank, numberHash: `wa-hash-${who}`, queue: [] });
    await whatsapp.claimDailySlot(`wa-hash-${who}`, '2026-10-11');
    await evidence.putRecord('cac', `cac-${who}`, { address: who });
    await evidence.claimUnique('fp', `fp-${who}`, who);
    users.createUser({ email: `${who}@telegram.invalid`, address: who, circleIdentityWalletId: `identity-${who}` });
    await links.saveTelegramLink({ address: who, chatId: Number.parseInt(who.slice(-6), 16), linkedAt: 1 });
  }
  // The user rows are written to Postgres in the background; let them land.
  await new Promise((r) => setTimeout(r, 200));

  await activity.deleteActivityFor(A.toUpperCase().replace('0X', '0x'));
  await usage.deleteAssistantUsage(A);
  await wallets.deleteAgentWallets(A);
  await telegram.deleteTelegramAccountByAddress(A);
  await whatsapp.deleteWhatsappAccountByAddress(A);
  await evidence.deleteRecord('cac', `cac-${A}`);
  for (const key of await evidence.keysHeldBy('fp', A)) await evidence.releaseUnique('fp', key, A);
  await users.deleteUserDurably(A);
  await links.removeTelegramLink(A);

  assert.deepEqual(await activity.listActivityForAddress(A, 0), []);
  assert.equal((await activity.listActivityForAddress(B, 0)).length, 1);

  assert.equal((await usage.consumeAssistantQuota(A, 10, 50)).dayRemaining, 9, 'the counter starts again');
  assert.equal((await usage.consumeAssistantQuota(B, 10, 50)).dayRemaining, 8);

  assert.equal(await wallets.getAgentWallets(A), null);
  assert.equal((await wallets.getAgentWallets(B))?.buyerWalletId, `buyer-${B}`);
  assert.equal(await wallets.findAgentWalletByAgentAddress(`0x${A.slice(2, 40)}01`), null);

  assert.equal(await telegram.findTelegramAccountByAddress(A), null);
  assert.equal(await telegram.getTelegramAccount(`tg-hash-${A}`), null);
  assert.equal((await telegram.findTelegramAccountByAddress(B))?.numberHash, `tg-hash-${B}`);

  assert.equal(await whatsapp.findWhatsappAccountByAddress(A), null);
  assert.equal((await whatsapp.findWhatsappAccountByAddress(B))?.numberHash, `wa-hash-${B}`);

  assert.equal(await evidence.getRecord('cac', `cac-${A}`), null);
  assert.deepEqual(await evidence.getRecord('cac', `cac-${B}`), { address: B });
  assert.equal(await evidence.holderOf('fp', `fp-${A}`), null);
  assert.equal(await evidence.holderOf('fp', `fp-${B}`), B);

  assert.equal(users.getUserByAddress(A), null);
  assert.equal(users.getUserByAddress(B)?.circleIdentityWalletId, `identity-${B}`);
  if (client.pgEnabled) {
    const rows = await client.postgresExecutor().query<{ address: string }>('SELECT address FROM users WHERE address = ANY($1)', [[A, B]]);
    assert.deepEqual(rows.rows.map((r) => r.address), [B], 'the Postgres row is gone too');
  }
  assert.equal(await links.getTelegramLink(A), null);
  assert.equal(await links.findAddressByChatId(Number.parseInt(A.slice(-6), 16)), null);
  assert.equal((await links.getTelegramLink(B))?.address, B);
}
