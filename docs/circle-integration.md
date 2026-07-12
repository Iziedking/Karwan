# Circle integration

How each Circle product is used in Karwan. This reflects what is built and
running, not what is planned.

## Products in use

### USDC

The settlement currency for everything. Escrow funding, milestone releases, the
platform fee, and agent top-ups are all in USDC. On Arc, USDC is also the native
gas asset, so the agent wallets spend USDC to send transactions.

One thing to know about Arc's USDC: it has a dual interface. The ERC-20 view
uses 6 decimals; the native gas view uses 18. Escrow accounting runs on the
6-decimal ERC-20 interface. Funding an agent wallet directly is a native value
transfer at 18 decimals.

### Developer-Controlled Wallets

Every agent transaction is signed by a Circle Developer-Controlled Wallet. Two
wallets are provisioned at setup, a buyer agent and a seller agent, both Smart
Contract Accounts on Arc Testnet.

Setup, in `backend/src/scripts/create-wallets.ts`:

```
initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
  -> createWalletSet({ name })
  -> createWallets({ blockchains: ['ARC-TESTNET'], count: 2, walletSetId, accountType: 'SCA' })
```

Every chain write goes through `executeContractCall` in
`backend/src/chain/txs.ts`. It calls `createContractExecutionTransaction` with
an ABI signature string and a params array, then polls `getTransaction` until
the state is `COMPLETE` or a failure state.

### CCTP V2

USDC moves into and out of Arc through CCTP V2, in both directions, across
twelve chains: Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche,
Unichain, Sei, Sonic, World Chain, and HyperEVM testnets, plus Solana Devnet.
Adding another is a config entry, not new integration code.

The ingress path: the user signs the burn on the source chain from their own
wallet, or from their Circle DCW if they signed in with a passkey or an email.
The backend polls Circle's IRIS attestation API, then relays `receiveMessage`
on Arc. The user never needs Arc gas to receive the mint.

The withdrawal path runs the same pipe in reverse, and uses Circle's Forwarding
Service to submit the destination mint. That is what makes every CCTP chain a
valid destination: because the forwarder submits the mint, Karwan does not need
a funded wallet on the destination chain, and the user never holds that chain's
gas token. An inline progress card shows burning, burned, attested, and minted
as it happens.

CCTP V2 deploys the same canonical `TokenMessengerV2` and `MessageTransmitterV2`
addresses across testnets, so only the source domain and USDC address vary per
chain.

One capability boundary is worth naming, because it shapes the code. A CCTP burn
is a contract execution, and Circle wallets can only execute contracts on chains
Circle has named. So a chain outside that list can be a withdrawal destination
but never a source for a Circle-wallet user. Those chains are marked web3-only in
`frontend/features/bridge/config.ts` and the UI reflects it rather than failing
at signing time.

### Circle Gateway

Gateway gives a business one pooled USDC balance across the twelve chains above.
Deposit once, then spend to any chain from a single signature, with no chain
switching and no source-chain gas.

The read is `kit.unifiedBalance.getBalances` in `backend/src/routes/gateway.ts`,
session-scoped and cached. Deposit and spend run client-side in
`frontend/features/gateway/lib.ts` through `@circle-fin/adapter-viem-v2`.

Two design facts drove the architecture:

- Gateway's EIP-712 signing domain carries no chain id and no verifying contract,
  and the payload is a set of burn intents. One signature therefore covers burns
  across several source chains at once.
- Gateway accepts smart contract accounts as recipients but rejects them as
  signers. The pooled balance has to sit on an account that can produce a raw
  signature, so it lives on the user's own EOA. The agent wallets, which are
  Circle SCAs, can still receive from it, which is what makes a one-click agent
  top-up out of the pooled balance possible.

### App Kit

`@circle-fin/app-kit` is the unified SDK behind bridge and unified-balance.
Karwan uses it on both sides: server-side in `backend/src/circle/bridge-kit.ts`
for Circle-wallet users, where keys never leave the backend, and client-side for
web3 users who sign with their own wallet. One SDK, fewer ways for the
integration to drift as the next feature ships.

### USYC (Hashnote, via ERC-4626 Teller)

`KarwanTreasury` holds platform fee USDC and subscribes idle balance into Hashnote USYC via the standard ERC-4626 Teller interface. Subscribe and redeem run against Hashnote's RolesAuthority entitlements contract (`0xcc205224862c7641930c87679e98999d23c26113`) under role 0 (the subscriber capability). On-chain accounting reads through to Hashnote yield.

`KarwanVault` is wired through the same Teller interface for idle user stake principal. The adapter is mutable behind an operator-only setter, so the same vault contract serves both the testnet adapter and the production Hashnote path without a redeploy.

Contract addresses on Arc Testnet, verified against Circle's published list:

| Contract | Address |
|---|---|
| Hashnote USYC Token | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |
| Hashnote USYC Teller (USDC) | `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` |
| Hashnote USYC/USD Oracle | `0x52b56c7642E71dc54714d879127d97cd0B3D4581` |
| Hashnote Entitlements (RolesAuthority) | `0xcc205224862c7641930c87679e98999d23c26113` |

USYC routing runs from three balances. The treasury subscribes platform-fee
reserves, the vault subscribes idle staking principal through the same
operator-mediated Teller path, and, with the next contract release, escrow funds
that sit idle during long-dated trades subscribe too. The treasury holds real
allowlisted USYC today.

### x402 and Gateway Nanopayments

Agents pay for market intelligence per call over x402. The platform runs both
sides of the rail: it sells its own underwriting signals (credit passport,
repayment behaviour, counterparty concentration) over x402, and its agents pay
external providers for research.

Internal payments settle through Circle Gateway Nanopayments on Arc. A buyer agent
funds a Gateway Wallet deposit, then signs an offchain EIP-3009 authorization with
zero gas, which Gateway verifies and batches onchain. Circle wallets are smart
accounts and the EIP-3009 signature needs a private key, so each user gets a
lightweight x402 EOA that signs while the agent wallet funds the deposit. External
research runs on the standard x402 exact-EVM scheme on Base. Every payment emits an
`agent.paid` event, and `GET /api/x402` lists the internal paid endpoints and their
prices.

## Wallet topology

- **Buyer agent wallet.** Funds escrows, releases milestones, records
  reputation, relays CCTP mints, files disputes on a buyer cancel.
- **Seller agent wallet.** Submits bids and counter-responses in managed deals,
  receives the milestone payouts on settlement.
- **User's identity wallet.** Signs in via passkey, email OTP, or SIWE on a
  web3 wallet. Identifies the user, signs the CCTP burn on bridge ingress,
  and holds any USDC the seller sweeps out of the deal wallet after settlement.

## Anti-self-dealing (ERC-8004)

Per ERC-8004, an agent's owner cannot record reputation for that agent. In
Karwan the buyer and seller are different principals, and `recordCompletion`
rates the counterparty of the caller, so the constraint holds without an extra
validator wallet. The platform never writes its own reputation.

## Roadmap

Forward-looking items live in the repository [README](../README.md#roadmap).
This document stays scoped to what is built and running.
