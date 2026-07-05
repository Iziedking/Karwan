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
- `createContractExecutionTransaction` returns `{ id, state: 'INITIATED' }`, and
  the `txHash` populates as the transaction moves through the documented lifecycle
  (INITIATED, CLEARED, QUEUED, SENT, CONFIRMED, COMPLETE). Circle sends a webhook
  notification at each state change, and the payload carries the transaction object
  including the hash once it is broadcast. Our poll loop only surfaces the hash at
  `COMPLETE`, which is our own simplification rather than a product gap. A webhook
  subscription would give it earlier.

Developer-Controlled Wallets covered the whole agent signing path, so we have
nothing to ask changed here.

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
  the managed bridge path did not fit them directly, and we build the burn as a
  user-signed transaction. This is the part that still needs a hand-rolled signing
  path.
- We relay the destination mint through our backend agent. Circle's newer Forwarding
  Service now does that leg for you, and Arc is a supported destination: a forward
  request in the burn hook data lets Circle broadcast the mint on Arc. We have not
  moved to it yet, mostly because our burn is already hand-rolled for the wallet
  reason above, and because the mint is still surfaced by polling Iris rather than a
  push.
- We ran CCTP Standard (slow) transfers, which wait for source-chain hard finality.
  Sandbox attestation latency was variable, roughly 10 to 19 minutes in our runs, in
  line with the documented finality windows. Our relay polls Iris for up to 25
  minutes before giving up.

Asks:

- Circle wallet support in the Bridge Kit, so a project already on
  Developer-Controlled Wallets can bridge without dropping to a hand-rolled signing
  path.
- An attestation-ready webhook. Both direct CCTP and the Forwarding Service surface
  the mint by polling `GET /v2/messages`; a push notification would remove the poll
  loop.

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

- The testnet default policy meant no setup. On our Circle-wallet deposit path,
  where the backend signs the burn from a provisioned SCA, the Gas Station policy
  sponsored the gas on Base and Ethereum Sepolia, so that user held only USDC.

Friction:

- Gas Station sponsors Circle wallets, not external ones, which is expected but
  worth stating plainly: our default add-money flow signs the burn in the user's
  own connected wallet, so it falls outside sponsorship and the user pays the
  source-chain gas. The two facts we would want a builder to see together are that
  the Bridge Kit does not accept Circle wallets and that Gas Station only sponsors
  Circle wallets, because together they push a bridge integration toward exactly
  the external-wallet path that cannot be sponsored.

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

CCTP and Gateway already reach past the EVM world. Solana is supported on both,
and Circle has said CCTP V2 will add Sui and Aptos before the V1 phase-out, so the
chain coverage we would have asked for is already on the way. Our own Solana
cash-out works over CCTP, though the managed adapter's Solana signing flow did not
fit our backend-relay model the way the EVM adapters did, so we used a manual burn
for that leg.

The gap we still feel is adapter parity, not chain coverage. A product that relays
on a server would benefit from the same managed signing ergonomics on Solana, and
later Sui and Aptos, that it gets on EVM today. Extending Gateway's unified balance
to those same non-EVM chains would also let agent nanopayments settle from anywhere
USDC lives, not only from EVM and Solana. Same rails, matching ergonomics across
them.
