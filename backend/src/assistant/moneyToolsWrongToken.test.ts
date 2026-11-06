import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

/// "Where is the USDT I sent?" gets a straight answer: the assistant lists a
/// wrong token with the stuck money moves and says a person sends it back.
///
///   npx tsx --test src/assistant/moneyToolsWrongToken.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-wrongtoken-tool-')));
delete process.env.DATABASE_URL;

const { appendActivity } = await import('../db/activityLog.js');
const { wrongTokenEntry } = await import('../circle/wrongToken.js');
const { moneyTools } = await import('./moneyTools.js');

const ADA = '0x00000000000000000000000000000000000000ad';
const call = { toolCallId: 't1', messages: [] };

test('a wrong token is listed with the stuck moves, and the way back is a person', async () => {
  await appendActivity(wrongTokenEntry({ address: ADA, txId: 'tx-usdt', amount: '5', symbol: 'USDT', chain: 'Base' }));
  const tools = moneyTools(ADA, [], {
    call: async () => ({ status: 200, json: { bridges: [], intents: [] } }),
    signer: 'karwan',
    testnet: true,
    walletUsdc: async () => null,
    nameOf: async () => '@ada',
  });
  const out = (await tools.list_stuck_money_moves.execute!({}, call)) as { moves: Array<{ kind: string; what: string; problem: string }> };
  const wrong = out.moves.find((m) => m.kind === 'wrong_token');
  assert.equal(wrong?.what, '5 USDT on Base');
  assert.match(wrong?.problem ?? '', /person from the team sends it back/);
});
