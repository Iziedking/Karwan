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

Source-chain gas is the friction we never want a user to feel. Karwan's
Gas Station policy sponsors the burn and approve transactions on Base
Sepolia and Ethereum Sepolia for Circle wallet users, so a user funding
their first escrow only ever holds USDC. No "buy ETH first" detour.

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

`KarwanTreasury` holds platform fee USDC and subscribes idle balance into real Hashnote USYC via the standard ERC-4626 Teller interface. Subscribe and redeem run against Hashnote's RolesAuthority entitlements contract (`0xcc205224862c7641930c87679e98999d23c26113`) under role 0 (the subscriber capability). On-chain accounting reads through to real Hashnote yield, not a mock.

`KarwanVault` is wired through the same Teller interface for idle user stake principal. The adapter is mutable behind an operator-only setter, so the same vault contract serves both the testnet adapter and the production Hashnote path without a redeploy.

Contract addresses on Arc Testnet, verified against Circle's published list:

| Contract | Address |
|---|---|
| Hashnote USYC Token | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |
| Hashnote USYC Teller (USDC) | `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` |
| Hashnote USYC/USD Oracle | `0x52b56c7642E71dc54714d879127d97cd0B3D4581` |
| Hashnote Entitlements (RolesAuthority) | `0xcc205224862c7641930c87679e98999d23c26113` |

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

## On the roadmap

- **x402 nanopayment rails for agents.** Plug Circle's x402 micropayment
  surface into the agent loop. The buyer and seller agents pay sub-cent
  fees for live data during a negotiation: market medians from paid APIs,
  skill demand snapshots, deeper credit checks against a credit passport,
  news during a delivery review window. Each round can pull a fresh
  outside signal for a few thousandths of a cent. Logged to the deal
  timeline as `agent.signal.purchased` so the human sees what the agent
  paid for and why.
- **Gateway.** Treasury aggregation across chains. Tracks behind x402;
  worth picking up once the cross-corridor financier flow lands.
