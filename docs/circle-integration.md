# Circle integration

How each Circle product is used in Karwan. This reflects what is built and
running, not what is planned.

## Products in use

### USDC

The settlement currency for everything. Escrow funding, milestone releases, the
platform fee, and agent top-ups are all in USDC. On Arc, USDC is also the native
gas asset, so the agent wallets spend USDC to send transactions.

One thing to know about Arc's USDC: it has two interfaces over a single balance,
not two tokens. The ERC-20 view uses 6 decimals, the native gas view uses 18, and
a native send and an ERC-20 transfer move the same underlying money. Escrow
accounting runs on the 6-decimal ERC-20 interface.

Following Arc's own guidance, application code reads and sends exclusively through
the ERC-20 interface. Mixing the two views is where the sharp edge is: a value that
is correct at 6 decimals is wrong by a factor of a trillion at 18, and the ERC-20
view also truncates, so a `balanceOf` of zero does not mean the native balance is
zero.

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
- Gateway verifies burn intents statically, so it needs an ECDSA signature and
  cannot accept an EIP-1271 signature from a smart contract account. Circle
  documents two ways through this: the `addDelegate` method on the Gateway Wallet
  contract, which authorizes an EOA to sign on an SCA's behalf, and EIP-7702
  upgraded EOAs, which still sign natively. Karwan takes a third path that suits
  its topology. The pooled balance lives on the user's own EOA, and the agent
  wallets, which are Circle SCAs, are the recipients. Gateway accepts SCAs as
  recipients, so a one-click agent top-up out of the pooled balance falls out of
  the design for free.

Fees are documented and we reserve for them. A crosschain transfer costs 0.005
percent plus gas, deducted from the unified balance at burn, and the forwarding
fee is taken from each burn intent's `maxFee`. The Max button calls
`estimateSpend` and holds back the fee, so a transfer never fails at the last
step.

### App Kit and Bridge Kit

`@circle-fin/app-kit` is the unified SDK behind bridge and unified-balance.
Karwan uses it on both sides: server-side in `backend/src/circle/bridge-kit.ts`
through `@circle-fin/adapter-circle-wallets`, where keys never leave the backend,
and client-side through `@circle-fin/adapter-viem-v2` for web3 users who sign with
their own wallet.

The Circle Wallets adapter matters more than it sounds. Karwan's agent and
identity wallets are Circle SCAs, and before the adapter existed the burn had to
be hand-rolled as a user-signed transaction. Adopting it deleted that path.

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

Karwan is a buyer and a seller of nanopayments, on and off its own platform. There
are **two distinct rails**, and they answer different questions.

**Rail 1, on Arc: who is this counterparty?** Before scoring a bid or pricing a
quote, an agent pays 0.01 USDC to pull the counterparty's full settled-deal record
(deals completed clean, deals on time, disputes, lifetime volume). These settle
through Circle Gateway Nanopayments. The agent funds a Gateway Wallet deposit, then
signs an offchain EIP-3009 authorization with zero gas, which Gateway verifies and
batches onchain. Sub-cent reads are only economic because they are netted; paying
gas on each one would kill the idea.

Gateway verifies EOA-signed authorizations and Circle wallets are smart accounts,
so each user gets a lightweight x402 EOA that signs while the agent's Circle wallet
funds the deposit. Gateway's `addDelegate` is the first-class alternative to this.

**Rail 2, on Base mainnet: what is this actually worth?** A settled-deal record says
nothing about whether a price is fair. So a neutral platform agent pays a genuinely
independent provider, in real USDC on Base mainnet, over the standard x402
**exact-EVM** scheme (EIP-3009 against Base USDC's own domain, not Gateway
batching), for a live web search. It grounds a market read on the results: current
demand, a price note, and a fair-price estimate the agents negotiate against.

The payer is a plain EOA that only ever signs; the seller's facilitator submits on
chain and pays the gas. Because it is an ordinary payment on a real network, the
receipt resolves on the Base explorer like any other transaction.

The second rail is not Karwan paying Karwan on a chain Karwan controls. It is an
autonomous agent discovering a priced endpoint it did not know about, paying a third
party in real money on a public network, and getting usable data back. That is the
whole promise of machine-to-machine payments, exercised rather than described.

**Karwan as seller.** The platform also exposes five paid endpoints of its own over
x402 (credit passport, repayment behaviour, counterparty concentration, document
anchors, skill demand), so an outside underwriter can price Karwan credit without
asking Karwan for permission. Every payment emits an `agent.paid` event, and
`GET /api/x402` lists the paid endpoints and their prices.

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
