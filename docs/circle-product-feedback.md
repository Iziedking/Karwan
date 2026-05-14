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

- The transaction API is async with no webhook in our setup, so every call
  becomes a poll loop against `getTransaction`. We poll up to 90 seconds. A
  push notification or a long-poll option would remove that loop.
- A submitted transaction returns an id immediately but no `txHash` until it
  reaches `COMPLETE`. Surfacing the hash at broadcast time would let a UI link
  to the explorer sooner.

Asks:

- An optional webhook or SSE stream for transaction state changes.
- Return the `txHash` as soon as the transaction is broadcast, not only on
  completion.

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

- Sandbox attestation latency was variable, roughly 10 to 19 minutes in our
  runs. Our relay polls IRIS for up to 25 minutes before giving up. A rough
  expected-latency figure in the docs would help set timeouts.

Asks:

- A documented latency range for sandbox attestations.
- A webhook for attestation-ready, as an alternative to polling IRIS.

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
