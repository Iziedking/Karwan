# Circle product feedback

Developer notes from building Karwan on Circle's stack. Karwan runs an agentic
settlement layer on Arc: buyer and seller agents negotiate a deal, pay each other
and the platform for market intelligence per call, and settle in USDC through
milestone escrow. The integration touches Developer-Controlled Wallets, USDC on
Arc, CCTP V2 through App Kit, Gateway Nanopayments for x402, Gas Station, USYC,
and the ERC-8004 identity registry.

Each section lists what worked, where we hit friction, and what would help. All
observations are from Arc Testnet and the Circle sandbox.

## Developer-Controlled Wallets

What worked:

- `createWalletSet` then `createWallets` with `accountType: 'SCA'` was a clean
  two-call setup. Wallets were live on Arc Testnet immediately.
- `createContractExecutionTransaction` takes an ABI signature string plus a params
  array, so we never hand-encode calldata. Nonce management and gas estimation are
  handled for us. This is most of what our agents do: sign contract calls
  server-side when the user is not on the page.
- The entity-secret model kept signing authority on the backend without us
  managing raw private keys.

Friction:

- The transaction API is async. We poll `getTransaction` for up to 90 seconds per
  call. Circle offers webhook notifications for transaction state changes, so this
  is on us, not a gap in the product. The poll loop was faster to ship without
  standing up a public endpoint.
- `createContractExecutionTransaction` returns only `{ id, state: 'INITIATED' }`.
  The `txHash` appears later through `getTransaction`. The docs do not say which
  state first populates it. Given the lifecycle
  INITIATED to CLEARED to QUEUED to SENT to CONFIRMED to COMPLETE, and that `SENT`
  means broadcast to the chain, the hash should be readable at `SENT`. Our loop
  only reads it at `COMPLETE`, so we never confirmed the earliest state.

Asks:

- Document the transaction state at which `txHash` is first populated, so a UI can
  link to the explorer as soon as the tx is broadcast.
- An SSE or long-poll option as a lighter alternative to a webhook endpoint for
  local development.

## USDC on Arc

What worked:

- USDC as the native gas asset removes the usual hold-a-separate-gas-token problem.
  Funding an agent is one transfer.

Friction:

- The dual-decimal interface, 6 for ERC-20 and 18 for native, is a real footgun. We
  sent a `parseUnits(amount, 6)` value through what we treated as an ERC-20 transfer
  and it registered as effectively zero, because the amount was interpreted at
  native 18-decimal precision. The fix was a native value transfer at 18 decimals.
  Correct once you know it, but it cost a debugging session.

Asks:

- A short, prominent note in the Arc USDC docs on which decimal precision each
  interface expects, with a worked example of a direct transfer. The docs do warn
  against mixing the two views; a copy-paste example of each would have saved the
  session.

## CCTP V2 and App Kit

What worked:

- We use `@circle-fin/app-kit` with the Circle Wallets adapter for the bridge. One
  SDK instance covers the cross-chain features. The SDK runs server-side, so user
  keys never enter the browser.
- The canonical `TokenMessengerV2` and `MessageTransmitterV2` addresses being
  identical across testnets meant our config only varied the source domain and USDC
  address.
- `destinationCaller = bytes32(0)` lets any relayer call `receiveMessage`, which is
  exactly our model: the user burns on the source chain, the backend relays the
  mint on Arc.

Friction:

- The Bridge Kit does not yet support Circle wallets (Developer-Controlled,
  User-Controlled, or Modular). Our agents and identity wallets are Circle SCAs, so
  the managed bridge path did not fit them directly. We build the burn as a
  user-signed transaction and relay the destination mint through our backend agent
  instead. This works, but the whole point of adopting Circle Wallets is to avoid
  wiring raw signing paths, and here we had to.
- We ran CCTP V2 Standard (slow) transfers, which wait for source-chain hard
  finality. Sandbox attestation latency was variable, roughly 10 to 19 minutes in
  our runs, in line with the documented finality windows. Our relay polls Iris for
  up to 25 minutes before giving up.

Asks:

- Circle wallet support in the Bridge Kit, so a project already on
  Developer-Controlled Wallets can bridge without dropping to a hand-rolled signing
  path.
- A per-source-chain sandbox attestation latency range near the Iris polling docs,
  so timeouts can be set without trial and error. A webhook for attestation-ready
  would remove the polling entirely.

## Gateway Nanopayments and x402

What worked:

- Karwan is both a buyer and a seller of nanopayments. Agents pay per call for
  market intelligence, and the platform exposes its own paid endpoints (credit
  passport, repayment behaviour, counterparty concentration) over x402. Gateway
  Nanopayments is the settlement method for the internal rail on Arc: a buyer signs
  an offchain EIP-3009 authorization with zero gas, and Gateway batches and settles
  net positions onchain.
- Batched settlement is the right primitive for agent commerce. Sub-cent calls
  during a negotiation would be uneconomical if each paid gas on its own.

Friction:

- Circle wallets are smart-contract accounts, and Gateway verifies EOA-signed
  EIP-3009 authorizations. To bridge the two, we provision a lightweight x402 EOA
  per user that signs the authorization, while the agent's Circle wallet funds the
  Gateway deposit. It works, but it means a user effectively has an extra signing
  key alongside their Circle wallet, purely to satisfy the signature type.

Asks:

- A path for a Circle smart-contract wallet to authorize a Nanopayment directly,
  without provisioning a separate EOA. A first-class SCA authorization type on
  Gateway would let an agent pay from the same wallet it already uses to settle
  deals.
- A short reference that maps x402 roles (buyer, seller, facilitator) onto the
  Gateway pieces (Gateway Wallet balance, EIP-3009 authorization, batched
  settlement), so a team new to both can wire the flow in one read.

## Gas Station

What worked:

- The testnet default policy meant no setup. Once wallets were SCAs, USDC-only CCTP
  burns from our Circle wallet users worked without users holding native gas on the
  source chain. Non-crypto users never see a "you also need ETH" step.

Asks:

- A clearer split in the dashboard between testnet and mainnet sponsorship metrics,
  so a project running both does not read the totals together when scoping spend
  caps.

## USYC

What worked:

- The ERC-4626 subscribe and redeem interface matched what our vault and treasury
  contracts needed. We wrote the integration once and pointed it at the Teller.
- Entitlement on Arc Testnet came through a Circle Support ticket within the
  documented window. The treasury now holds real, allowlisted USYC, and
  `totalReserves()` reconciles liquid USDC plus USYC marked to the onchain oracle.
  Holding the permissioned token at all is the proof the integration is real.

Friction:

- The Arc Testnet USYC price oracle has been frozen at one round since February, so
  a marked-to-oracle balance does not move day over day on testnet, even though the
  live instrument keeps accruing. Our reserves widget reads the live Hashnote feed
  for display and falls back to the onchain oracle, flagging when the onchain value
  is stale. Without that fallback, a yield readout on testnet sits flat and reads as
  broken.
- The first vault subscribe reverted `NotPermissioned` even after allowlisting,
  because the vault contract itself was not the entitled address; the entitled
  operator has to mediate the deposit. Clear once traced, but the revert gave no
  hint that the caller, not the wallet, was the gated party.

Asks:

- Keep the Arc Testnet USYC oracle advancing, or document that it is intentionally
  static on testnet, so builders do not treat a flat yield readout as a bug.
- A note in the USYC docs that the Teller entitlement is checked against the direct
  caller, so a contract subscribing on a user's behalf needs its own entitlement or
  an operator-mediated path.

## Arc Testnet

What worked:

- Fast finality. Most transactions confirmed in well under a minute when the public
  RPC was healthy.
- The ERC-8004 IdentityRegistry already being deployed meant we did not stand up
  identity infrastructure ourselves. Karwan writes settled-deal reputation against
  it.

Friction:

- The public RPC was intermittently slow and dropped WebSocket connections during
  our build sessions. Transactions still landed, but `waitForTransactionReceipt`
  would time out and some txs needed a manual retry. We moved event reads to HTTP
  polling and added retry, RPC rotation, and resume handling around it.

Asks:

- A status page for the public testnet RPC, or a recommended private provider for
  heavier development.

## Multi-chain coverage

An observation from building the cross-chain money path, offered as a direction
rather than a complaint.

CCTP V2, the Bridge Kit, and Gateway are strongest on EVM chains and Solana. Our
Solana cash-out works over CCTP, but the managed adapter's Solana signing flow did
not compose with our server-relay model the way the EVM adapters did, so we fell
back to a manual burn for that leg. Non-EVM ecosystems beyond Solana, such as Sui
and Aptos, are not on CCTP V2 today.

As stablecoin settlement spreads past the EVM world, the ecosystems that would
benefit most from USDC rails are often the non-EVM ones. Broader CCTP V2 coverage,
Bridge Kit adapter parity, and Gateway support for chains like Sui would let a
product like ours reach those users without a bespoke integration per chain. This
is where we would point Circle's roadmap if asked: same rails, more of the map.
