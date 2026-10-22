# 22 · Send uses your whole balance

Track T5, money like a bank account. Approved and built 22 Oct 2026; corrected the same day after the first live send failed on who signs the top-up.

## What is wrong today

The wallet figure people see adds two parts:

- the USDC in their Arc wallet;
- the USDC pooled in Circle Gateway, from deposits made on other chains.

Send can only spend the first part. On @lawful the wallet reads 159.51 USDC, but Send offers 109.50. Someone told they have 159.51 who can only send 109.50 has been misled.

The owner rejected explaining the gap on screen (22 Oct): crypto works under the hood, and screens stay plain. So the system closes the gap itself.

## The idea in one line

When the wallet alone is short, Karwan first moves just the missing amount from the pool into the person's own wallet, then sends as usual. Send's "Available" is the whole balance.

## How it works

```
Send 140 USDC to @ada                      wallet 109.51, pool 50.00
  │
  ├─ wallet covers it?  yes → send as today (nothing changes)
  │
  └─ no, short by 30.49
       1. top up own wallet from the pool    POST /api/gateway/to-wallet {amount: 30.49, requestId}
          same chain (Arc to Arc): no Gateway fee
          signed by whoever deposited: the pool belongs to the sign-in wallet,
          so a wallet account signs in the browser (App Kit unifiedBalance.spend,
          as the agent top-up from the pool already does); POST /api/gateway/to-wallet
          serves only an account with a server-held Gateway wallet (none today)
       2. wait until the wallet's USDC on Arc shows the top-up
       3. send 140 to @ada exactly as today
          (a web3 account signs in its own wallet; an email or passkey account is signed by the backend)
```

- **On screen:** one Send button, the usual "Sending" state, one receipt for 140 to @ada. The top-up is recorded as its own money movement, but no step is added to the screen.
- **If step 1 fails:** nothing moved, and the send is not tried. The person sees the usual "That didn't go through. Try again."
- **If step 3 fails after step 1 succeeded:** the money is in the person's own wallet, which is still their balance. The screen says the send did not go through, and the balance is unchanged.
- **Idempotency:** one `requestId` covers both steps. A retry never tops up twice.
- **The assistant:** `propose_send_to_tag` reads the same spendable figure (`gateway/router.ts readSpendable`), so chat and the page agree. Telegram money steps open the same `/send` page.

## Checks before code (rule 14)

These are written into `docs/arc-circle-checks.md` before the first line of code:

- App Kit `unifiedBalance.spend` for a same-chain Arc spend to the account's own wallet. The installed version is @circle-fin/app-kit 1.15.2.
- The Gateway fee for same-chain spends.
- How long until the mint shows on Arc.
- A read-only plus small live test on testnet: move 0.10 USDC from @lawful's pool to their own wallet, and read both balances before and after.

## What it does not do

- No split payment from two sources in one transaction. The pool tops up the wallet first, so every send still has one sender address.
- No mainnet change until testnet runs clean.
- No change to top-ups and cash-outs, which already use the pool.

## Tests

- **Route choice:** the wallet covers it; the pool covers the shortfall; even both together fall short.
- **Failures:** step 1 fails; step 3 fails after step 1.
- **Retries:** a retry with the same `requestId` tops up once.
- **Browser:** a send larger than the wallet alone, through `/send`, with both API steps mocked.
- **Live testnet check:** above.
