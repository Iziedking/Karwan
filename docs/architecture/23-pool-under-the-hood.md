# 23 · The pool works under the hood

Track T5, money like a bank account. **Dropped 23 Oct 2026, before any code.**

Why: Circle's docs (logged in `docs/arc-circle-checks.md`, 23 Oct) show that a pool fed by arrivals makes them slower. A standard deposit is spendable only after source-chain finality, up to about 15 minutes, against seconds for CCTP Fast today. A fast deposit is as quick but excludes Base and Solana and adds a fee. Every later Arc spend from the pool then pays the forwarder fee again. The owner's decision, 23 Oct: arrivals keep using CCTP to the Arc wallet, email and passkey accounts get no pool, and a web3 wallet's own pool is spent with that wallet's signature in the browser.

The draft is kept below as the record of what was considered.

## What is wrong today

Karwan has two pools, and neither one works the way the owner wants.

- **The pool the balance page counts.** It belongs to the sign-in wallet. Only a web3 account fills it, by depositing on `/bridge` and confirming in its own wallet. Only that wallet can spend from it, so every spend asks for a wallet confirmation. Email and passkey accounts can't have one: Circle accepts spend signatures from a plain wallet (an EOA), not from a smart account.
- **The pool the server can spend.** It was built in July. Each account gets its own Karwan-held Gateway key, so the server signs every spend with no confirmation. It was never switched on, because of the July rule "money is never moved into the pool". On testnet, 0 of 117 accounts have one. Every server spend fails, including agent top-up from the pool, cash-out from the pool, and the Send top-up the owner tried on 22 Oct.

The owner's ask, 23 Oct: filling and spending the pool should be one click, done under the hood, never an extra step.

## The idea in one line

Every account gets its own Karwan-held Gateway key. Money that arrives from other chains goes into that pool automatically, and every spend from it is signed by the server: one click, for email, passkey and web3 accounts alike.

## How it works

```
Money arrives on Base, Ethereum, Solana ...           (today: CCTP to the Arc wallet, minutes)
  │
  └─ deposit watcher sees it (circle/depositWatcher.ts)
       → depositFor(the account's Gateway key) on that chain    (gateway/balance.ts depositToGateway)
       → spendable once that chain confirms it (Arc ~0.5 s; slower chains take longer)
       → the balance shows one number, as now

Send / top up an agent / cash out, and the pool is needed
  └─ server signs the spend with the account's Gateway key      (gateway/spend.ts, built in July)
       same chain (Arc to Arc): no Gateway fee, forwarder fee only
       other chain: Gateway's transfer fee, settles in seconds instead of CCTP's minutes
```

- **The key:** created once, when the account activates (`ensureGatewayWallet`, built). It is a Circle developer-controlled wallet of type EOA, held under Karwan's Circle account like the agent wallets. It owns the pool and signs its own spends, so no delegate and no `addDelegate` are needed.
- **On screen:** nothing new. One balance, one Send button, one Add button. No "pool", no "Gateway", no extra step.
- **Money already on Arc stays in the wallet.** Moving Arc money into the pool and back would add a hop and a fee to every local move for nothing. The pool is only for money that arrives from elsewhere and for fast cash-out to other chains.
- **Existing self-held pools** (a web3 wallet that deposited on `/bridge`, like the financier test wallet 0xa045…03c5 with about 110 USDC): left as they are, and spent with one wallet confirmation (the 22 Oct fix). Nothing is moved without the owner of that wallet signing.

## What changes for trust

This is the real decision, so it is stated plainly.

- Pooled money sits under a key Karwan holds through Circle. That's already true for email and passkey accounts (their wallets are Karwan-held) and for every agent wallet. **For web3 accounts it is new:** money that arrives from another chain would no longer sit in a wallet only they control.
- Gateway's 7-day "withdraw without permission" escape hatch belongs to the key's owner, which is Karwan, not the person. Their way out is an ordinary cash-out, which the server signs on request.
- **Option for web3 accounts:** keep arrivals going to their own wallet as today (CCTP, a few minutes, nothing Karwan-held). Their pool spends keep asking for one wallet confirmation. **Recommended:** offer the pool only to email and passkey accounts, and let web3 accounts keep self-custody. Their wallet confirmation is the point of having a web3 wallet.

## Checks before code (rule 14)

These are written into `docs/arc-circle-checks.md` before the first line of code:

- App Kit `unifiedBalance.depositFor` from a Circle Wallets source wallet, crediting another depositor, at the installed @circle-fin/app-kit version.
- `unifiedBalance.spend` from a Circle Wallets EOA that is both depositor and signer (no delegate), on Arc Testnet.
- Deposit finality per chain we accept, from Circle's published table, so the screen never calls money spendable early.
- A live testnet run: provision the key for one test account, deposit 1 USDC from Base Sepolia, then spend 0.10 USDC to the account's Arc wallet.

## What it does not do

- No `addDelegate`. No change to a web3 wallet's own pool.
- No money moved into the pool from Arc, and none moved on request: deposits happen only on arrival from another chain.
- No mainnet change until testnet runs clean.
- No change to contracts under `contracts/src/`.

## Questions for the owner

1. Reverse the July rule "money is never moved into the pool" for money that arrives from other chains? (Recommended: yes.)
2. Who gets the pool: email and passkey accounts only (recommended), or web3 accounts too, accepting Karwan-held custody of their arrivals?
3. Keep CCTP to the Arc wallet as the fallback for a chain Gateway doesn't support, and for amounts under the auto-route minimum? (Recommended: yes.)

## Tests

- **Provisioning:** an account gets its key once; a retry never creates a second.
- **Arrival:** a deposit on another chain goes into the pool once per Circle transaction id, never twice. Below the minimum, it stays put as today.
- **Spend:** Send top-up, agent top-up and cash-out each sign with the account's key. A retry with the same `requestId` moves once.
- **Web3:** an arrival still goes to the wallet, and a pool spend still asks for a wallet confirmation.
- **Live testnet check:** above.
