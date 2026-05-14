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

Buyers bring USDC to Arc from Base Sepolia or Ethereum Sepolia. The user signs
the burn on the source chain from their own wallet. The backend polls Circle's
IRIS attestation API, then relays `receiveMessage` on Arc using the buyer agent
wallet, so the user does not need Arc gas to receive the mint.

CCTP V2 deploys the same canonical `TokenMessengerV2` and `MessageTransmitterV2`
addresses across testnets, so only the source domain and USDC address vary per
chain.

## Wallet topology

- **Buyer agent wallet** — funds escrows, releases milestones, records
  reputation, relays CCTP mints, files disputes on a buyer cancel.
- **Seller agent wallet** — submits bids and counter-responses in managed deals.
- **User's connected wallet** — identifies the user, and signs the CCTP burn.
  It does not sign Karwan's business transactions.

## Anti-self-dealing (ERC-8004)

Per ERC-8004, an agent's owner cannot record reputation for that agent. In
Karwan the buyer and seller are different principals, and `recordCompletion`
rates the counterparty of the caller, so the constraint holds without an extra
validator wallet. The platform never writes its own reputation.

## Not used in v0

The original plan listed Nanopayments and Gateway. Neither is wired. Agent
micro-payments are deferred to a future x402 rail, and treasury aggregation
across chains is post-v0. The docs here only describe what runs.
