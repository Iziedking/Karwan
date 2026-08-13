import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readSolanaHolding,
  readSolanaUsdcBalance,
  MIN_SOLANA_GAS_LAMPORTS,
  SOL_DEVNET_USDC_MINT,
} from './solanaBalances.js';

/// Stub the wire, not the logic. Every decision this module makes — which token
/// counts, what an unreadable balance means, whether a wallet can pay to move —
/// runs for real.

type Reply = Record<string, unknown> | { __status: number };
const realFetch = globalThis.fetch;

function stubRpc(byMethod: Record<string, Reply>) {
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    const { method } = JSON.parse(init?.body ?? '{}') as { method: string };
    const reply = byMethod[method];
    if (!reply) return { ok: false, status: 500 } as Response;
    if ('__status' in reply) return { ok: false, status: reply.__status } as Response;
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: reply }) } as Response;
  }) as typeof globalThis.fetch;
}

function tokenAccount(mint: string, amount: string) {
  return { account: { data: { parsed: { info: { mint, tokenAmount: { uiAmountString: amount } } } } } };
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test('counts USDC and ignores every other token at the same address', async () => {
  // A deposit address is public, so anyone can send anything to it. Counting by
  // program alone would let a worthless token be reported to the user as
  // dollars.
  stubRpc({
    getTokenAccountsByOwner: {
      value: [
        tokenAccount('SomeOtherMint1111111111111111111111111111111', '9999'),
        tokenAccount(SOL_DEVNET_USDC_MINT, '20'),
      ],
    },
  });
  assert.equal(await readSolanaUsdcBalance('owner'), '20');
});

test('an unreadable balance is null, never zero', async () => {
  // The difference matters more here than anywhere else in the file. Telling a
  // user they have nothing is a far worse answer than telling them we could not
  // check, and it is the answer that made the assistant deny a real deposit.
  stubRpc({ getTokenAccountsByOwner: { __status: 503 } });
  assert.equal(await readSolanaUsdcBalance('owner'), null);
});

test('a wallet with dollars but no gas is reported as unable to move', async () => {
  // Circle sponsors gas on its EVM wallets and does not on Solana. This is the
  // exact shape of the 2026-08-12 failure: 20 USDC, zero lamports, a burn that
  // could never be paid for.
  stubRpc({
    getTokenAccountsByOwner: { value: [tokenAccount(SOL_DEVNET_USDC_MINT, '20')] },
    getBalance: { value: 0 },
  });
  const holding = await readSolanaHolding('owner');
  assert.equal(holding.usdc, '20');
  assert.equal(holding.canMove, false);
});

test('a funded wallet can move', async () => {
  stubRpc({
    getTokenAccountsByOwner: { value: [tokenAccount(SOL_DEVNET_USDC_MINT, '20')] },
    getBalance: { value: MIN_SOLANA_GAS_LAMPORTS },
  });
  assert.equal((await readSolanaHolding('owner')).canMove, true);
});

test('an unreadable gas balance does not block a move', async () => {
  // A flaky RPC must not invent a reason to refuse a move the user could make.
  // Refusing on unknown would strand money on a bad minute.
  stubRpc({
    getTokenAccountsByOwner: { value: [tokenAccount(SOL_DEVNET_USDC_MINT, '20')] },
    getBalance: { __status: 500 },
  });
  const holding = await readSolanaHolding('owner');
  assert.equal(holding.lamports, null);
  assert.equal(holding.canMove, true);
});
