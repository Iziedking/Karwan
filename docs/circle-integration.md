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

USDC moves into and out of Arc through CCTP V2. The bridge is bidirectional
and runs across six chains today: Base, Ethereum, Arbitrum, Optimism, and
Polygon Sepolia, plus Solana Devnet. Adding more is a config entry, not
new integration code.

The ingress path: the user signs the burn on the source chain from their
own wallet (or from their Circle DCW if they signed in via passkey or
email). The backend polls Circle's IRIS attestation API, then relays
`receiveMessage` on Arc with a relay wallet. The user never needs Arc gas
to receive the mint.

The cashout path runs the same pipe in reverse. After a deal settles, the
seller picks the destination chain on the cashout page. The backend burns
on Arc, polls the attestation, relays the mint on the destination. An
inline progress card on `/cashout/[jobId]` shows burning, burned, attested,
minted as it happens.

CCTP V2 deploys the same canonical `TokenMessengerV2` and
`MessageTransmitterV2` addresses across testnets, so only the source
domain and USDC address vary per chain.

### Gas Station

Karwan has a Gas Station policy that sponsors the approve and burn on Base
Sepolia and Ethereum Sepolia, but only on one of the two add-money paths. On the
Circle-wallet deposit path (`startCircle`), the backend signs both transactions
from a provisioned source-chain Circle DCW, and the Gas Station policy covers the
gas, so that user holds only USDC. This path is gated behind
`CIRCLE_GAS_STATION_ENABLED` and a per-chain whitelist.

The default add-money path is different: the user signs the burn in their own
connected wallet through App Kit and Circle's Forwarding Service. Gas Station does
not sponsor an external wallet, so on that path the user pays the source-chain gas
themselves, and the Arc mint is handled by the forwarder.

### App Kit

`@circle-fin/app-kit` is the unified SDK that covers bridge, swap, send,
and unified-balance reads behind one entry point. Karwan uses App Kit for
the cashout bridge-out flow and reaches the same surface for the unified
balance reads on the profile holdings panel. The mainnet path for vault
yield routes through the same SDK. Less code, fewer ways for the
integration to drift as we ship the next feature.

We use App Kit server-side, not in the browser, so user keys never leave
the backend.

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
