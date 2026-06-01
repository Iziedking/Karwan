# Circle product feedback

DevX notes from building Karwan on Circle's stack. One bullet per observation.

## Developer-Controlled Wallets

What worked:

- `createWalletSet` then `createWallets` with `accountType: 'SCA'` was a clean
  two-call setup. Wallets were live on Arc Testnet immediately.
- `createContractExecutionTransaction` taking an ABI signature string plus a
  params array meant we never had to hand-encode calldata. Nonce management and
  gas estimation are handled for you.
- The entity-secret model kept signing authority on the backend without us
  managing raw private keys.

Friction:

- The transaction API is async. We poll `getTransaction` up to 90 seconds per
  call. Circle does offer webhook notifications for transaction state changes,
  so this is on us for the hackathon timeline, not a gap in the product. The
  poll loop was the faster thing to ship without a public endpoint.
- `createContractExecutionTransaction` returns only `{ id, state: 'INITIATED' }`.
  The `txHash` shows up later through `getTransaction`. The docs do not say which
  state first populates it. Since the lifecycle is
  INITIATED -> CLEARED -> QUEUED -> SENT -> CONFIRMED -> COMPLETE and `SENT`
  means submitted to the chain, the hash should be readable at `SENT`. Our poll
  loop only reads it on `COMPLETE`, so we never confirmed the earliest state.

Asks:

- State in the API reference at which transaction state `txHash` is first
  populated, so a UI can link to the explorer as soon as the tx is broadcast.
- An SSE stream or long-poll option, as a lighter alternative to standing up a
  webhook endpoint for local development.

## USDC on Arc

What worked:

- USDC as the native gas asset removes the usual "hold a separate gas token"
  problem. Funding an agent is one transfer.

Friction:

- The dual-decimal interface (6 for ERC-20, 18 for native) is a real footgun.
  We sent a `parseUnits(amount, 6)` value through what we treated as an ERC-20
  transfer and it registered as effectively zero, because the system contract
  interprets amounts at native precision. The fix was to send a native value
  transfer at 18 decimals. This is correct once you know it, but it cost us a
  debugging session.

Asks:

- A short, prominent note in the Arc USDC docs on which decimal precision each
  interface expects, with a worked example of a direct transfer.

## CCTP V2

What worked:

- The canonical `TokenMessengerV2` and `MessageTransmitterV2` addresses being
  identical across testnets meant our config only varied the source domain and
  USDC address. Easy to reason about.
- The `destinationCaller = bytes32(0)` option let any relayer call
  `receiveMessage`, which is exactly what we needed: the user burns, the backend
  agent relays the mint.

Friction:

- We used CCTP V2 Standard Transfer, which waits for source-chain hard
  finality. Sandbox attestation latency was variable, roughly 10 to 19 minutes
  in our runs, which lines up with the documented finality windows. Our relay
  polls IRIS for up to 25 minutes before giving up. Fast Transfer would cut this
  to seconds; we stayed on Standard Transfer to keep the burn-and-relay path
  simple for the hackathon.
- A rough expected-latency figure per source chain, surfaced near the IRIS
  polling docs, would help set timeouts without trial and error.

Asks:

- A per-source-chain sandbox attestation latency range in the docs.
- A webhook for attestation-ready, as an alternative to polling IRIS.

## App Kit

What worked:

- `@circle-fin/app-kit` paired with the Circle Wallets adapter let us
  reuse the same Developer-Controlled Wallets we already provisioned as
  the source for bridge and unified-balance calls. One SDK instance covers
  the cross-chain features we add next.
- The SDK runs server-side, so user keys never need to be in the browser
  for the flows we use it on.

Asks:

- A single index page in the docs that maps each method to the package
  it ships in. App Kit, Bridge Kit, Swap Kit, and Unified Balance Kit each
  cover overlapping surfaces, and the package boundary is not always
  obvious from the method name.

## Gas Station

What worked:

- Setting up a sponsorship policy from the Circle console was quick. Once
  the policy was live for Base Sepolia and Ethereum Sepolia, USDC-only
  CCTP burns from our Circle wallet users worked without users holding
  any native gas on the source chain.
- The result is that our non-crypto users never see a "you also need ETH"
  step. They hold USDC end to end.

Asks:

- A clearer split in the dashboard between sponsorship metrics for
  testnet versus mainnet usage, so a project running both does not need
  to read totals together when scoping spend caps.

## USYC (via the ERC-4626 Teller)

What worked:

- The standard ERC-4626 subscribe and redeem interface matched what we
  needed for our vault and treasury contracts. We could write the
  integration once and have it talk to a mock adapter on testnet or to
  the live Hashnote teller on mainnet without changing the call sites.

Friction:

- USYC entitlement on Arc Testnet was not available to our wallets
  during the build, so we shipped a deterministic mock adapter to keep
  the demo path working. The integration is real production wiring; the
  demo just cannot show live T-bill yield without an entitled wallet.

Asks:

- A self-serve sandbox entitlement on Arc Testnet for builders who want
  to demo the live USYC interface end to end, even with a rate cap.

## Arc Testnet

What worked:

- Fast finality. Most transactions confirmed in well under a minute when the
  public RPC was healthy.
- The ERC-8004 IdentityRegistry already being deployed meant we did not have to
  stand up identity infrastructure ourselves.

Friction:

- The public RPC (`rpc.testnet.arc.network`) was intermittently slow or dropped
  WebSocket connections during our build sessions. Transactions still landed,
  but `waitForTransactionReceipt` would time out and a few txs needed a manual
  retry. We added retry and resume handling around it.

Asks:

- A status page for the public testnet RPC, or guidance on a recommended
  private RPC provider for heavier development.
