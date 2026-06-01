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

- `@circle-fin/app-kit` collapsed our bridge, swap, and unified-balance
  surfaces into one client. The adapter pattern (Viem, Solana Kit,
  Circle Wallets) let us mount the same SDK on web3 wallet flows and on
  Circle DCW flows without forking the call sites.
- Server-side usage is well-supported. Our bridge router never has to
  expose user keys to the browser, which is exactly the security shape
  we wanted.
- Falling back to `bridge-kit` for bridge-only paths was useful while we
  were still scoping which surfaces needed the full app kit.

Friction:

- The documentation does not consistently flag which methods are App Kit
  versus Bridge Kit versus Swap Kit. We hit a few "no this only exists in
  the standalone kit" moments during scoping.
- The error surfaces from cross-chain failures bubble up as generic
  exception types in some paths. Mapping them to user-friendly retry vs
  fund-then-retry copy took some pattern-matching.

Asks:

- A single docs index that lists every method across App Kit, Bridge Kit,
  Swap Kit, and Unified Balance Kit, with a column noting which package
  it lives in.
- Typed error union per call so the consumer can branch on Insufficient
  Balance vs Source Allowance vs Attestation Pending without parsing
  messages.

## Gas Station

What worked:

- Setting up a sponsorship policy from the Circle console took minutes.
  Source-chain gas sponsorship for our Base Sepolia and Ethereum Sepolia
  CCTP burns just worked once the policy was live.
- We never had to write a "buy a small amount of ETH first" detour into
  our onboarding. The user holds USDC end to end.

Friction:

- Per-chain sponsorship coverage is uneven across testnets. Arbitrum
  Sepolia was missing the policy class we wanted for a while during the
  build. The user had to top up native gas manually on that source chain.
- The policy editor sets one cap per metric type, with no per-route
  override. A "burn-only" cap that's tighter than a generic "any call"
  cap would have helped us scope spend more aggressively.

Asks:

- Same-day parity across the major testnets when a new sponsorship class
  ships on one of them.
- Per-route policy slices: "burn on $chain at this cap, anything else at
  zero" without having to spin up multiple wallets.

## USYC (via the ERC-4626 Teller)

What worked:

- The standard ERC-4626 subscribe and redeem surface is exactly what we
  wanted. Our vault deposit and withdraw paths are the same code on
  testnet (against a mock adapter) and on mainnet (against the live
  Hashnote teller). Constructor flag flips between them.
- Sticking to a clean ERC-4626 contract on our side meant we did not
  have to special-case the integration. The mock and the live teller
  look identical to `KarwanVault`.

Friction:

- USYC entitlement on Arc Testnet was still pending for our wallets at
  the time of the build. We worked around it with a deterministic mock
  adapter, but that meant the demo cannot show real T-bill yield even on
  testnet. Entitlement onboarding is the gate.
- The entitlement application process is high-touch. A self-serve sandbox
  entitlement (rate-limited, capped, expiring) would have removed the
  block.

Asks:

- A sandbox USYC entitlement for Arc Testnet builds, gated only by
  knowing your Circle account and your testnet wallet addresses.
- Public docs that explicitly say "this is the same Teller interface
  Hashnote ships on mainnet, here's the testnet address when entitled."

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
