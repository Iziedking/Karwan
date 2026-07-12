# Circle product feedback

Developer notes from building Karwan on Circle's stack. Karwan runs an agentic
settlement layer on Arc: buyer and seller agents negotiate a deal, pay each other
and the platform for market intelligence per call, and settle in USDC through
milestone escrow. The integration touches Developer-Controlled Wallets, USDC on
Arc, CCTP V2 through App Kit, Circle Gateway for unified balance and for x402
settlement, USYC, and the ERC-8004 identity registry.

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
  Funding an agent is one transfer, and a business's balance and its ability to
  transact are the same number. For an SME product this is the difference between
  onboarding and abandonment.
- The single-asset model is the right call. There is no wrapped USDC on Arc, so a
  contract pairs against the ERC-20 address directly and there is no bridged-asset
  ambiguity to explain to a trader.

Friction:

- The dual-decimal interface, 6 for the ERC-20 and 18 for native, cost us a debugging
  session. We sent a `parseUnits(amount, 6)` value through what we treated as an
  ERC-20 transfer and it registered as effectively zero, because the amount was
  interpreted at native 18-decimal precision. The Arc docs warn about this clearly and
  in several places, so the gap was ours, not theirs. It is worth recording anyway,
  because it is the one place where correct-looking code is wrong by a factor of a
  trillion, and every team porting a contract to Arc will meet it.

Asks:

- We now follow the Arc docs' own guidance and read and send exclusively through the
  ERC-20 interface, which sidesteps the class of bug entirely. If there is one thing
  to amplify for new builders, it is that recommendation: it is currently a note
  inside a longer page, and it is the single sentence that prevents the mistake.

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

- The Circle Wallets adapter for Bridge Kit (shipped 2025-11-17) removed a
  hand-rolled signing path. Our agent and identity wallets are Circle SCAs, and
  before the adapter existed we were building the burn as a user-signed transaction
  ourselves. Adopting `@circle-fin/adapter-circle-wallets` deleted that code. This
  is the single most useful thing Circle shipped for us during the build.

Friction:

- We ran CCTP Standard (slow) transfers, which wait for source-chain hard finality.
  Sandbox attestation latency was variable, roughly 10 to 19 minutes in our runs, in
  line with the documented finality windows. Our relay polls Iris for up to 25
  minutes before giving up.
- The chain a CCTP burn can originate from and the chain a Circle wallet can sign on
  are two different lists, and they are published separately. A CCTP burn is a
  contract execution, so a Circle-wallet user cannot burn from a chain Circle has not
  named, even though CCTP itself supports it. The failure surfaces at signing time,
  which is late. We now mark those chains web3-only in config and reflect it in the
  UI, but we found the boundary by hitting it.

What the Forwarding Service changed:

- Moving outbound settlement onto the Forwarding Service was the single highest-
  leverage change in our bridge. Because Circle submits the destination mint, we no
  longer need a funded wallet on each destination chain, and withdrawal coverage went
  from a handful of chains to every chain CCTP reaches. A user cashes out to any of
  them without ever holding that chain's gas token. This deserves more prominence in
  the docs than it currently gets. It reads like an optimization and it is actually a
  capability unlock.

Asks:

- An attestation-ready webhook. Both direct CCTP and the Forwarding Service surface
  the mint by polling `GET /v2/messages`; a push notification would remove the poll
  loop every integrator writes.
- One published matrix of chain support across CCTP, Circle Wallets, Gateway, and
  Bridge Kit, with a column for what each product can do on each chain. Three lists
  that nearly agree are harder to build against than one list that does, and this
  is the highest-leverage document Circle could publish.

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

- A short reference that maps x402 roles (buyer, seller, facilitator) onto the
  Gateway pieces (Gateway Wallet balance, EIP-3009 authorization, batched
  settlement), so a team new to both can wire the flow in one read. Gateway's
  `addDelegate` mechanism is the clean answer to the SCA signing constraint here,
  and pointing at it from the x402 material would shorten the path for anyone
  building agent payments on Circle wallets.

## Circle Gateway (unified balance)

What worked:

- The burn-intent design is better than it first looks. The EIP-712 signing domain
  carries no chain id and no verifying contract, and the payload is a set of burn
  intents rather than one. So a single signature can cover burns across several
  source chains at once: no chain switching, no source-chain gas, no per-chain
  approval dance. Once we understood that, our entire fund-and-withdraw surface
  collapsed from a chain picker into one card with a pooled balance.
- Gateway requires an ECDSA signature on a burn intent, so an SCA cannot sign one
  directly. Circle documents two ways through this: the `addDelegate` mechanism on
  the wallet contract, which authorizes an EOA to sign on the SCA's behalf, and
  EIP-7702 upgraded EOAs, which can still sign natively. We took a third path that
  suited our topology: the pooled balance lives on the user's own EOA, and their
  Circle agent wallets, which are SCAs, are the recipients. Gateway accepts SCAs as
  recipients, so a one-click agent top-up straight out of the pooled balance falls
  out of the design for free.
- `getBalances` needs only an address. No adapter, no signer, no credentials. That
  makes the read a cacheable backend call, which is what let us put a live pooled
  balance on a page without dragging a wallet connection into it.
- Fees are clearly documented: a 0.005 percent transfer fee plus gas, deducted from
  the unified balance at burn, and the forwarding fee taken from each burn intent's
  `maxFee`. We reserve for them with `estimateSpend` before offering a Max amount.

Friction:

- A funded wallet that has not deposited reads as a zero Gateway balance, with
  nothing in the response to say why. The docs are explicit that a deposit is
  required, so this is not a documentation gap. It is a response-shape gap: an
  address holding several hundred USDC on Base returns exactly what an empty address
  returns, and every integrator loses the same afternoon to it.
- Gateway transfers can be fetched by id but not listed. Any product that shows a
  user their own transfer history has to keep a parallel ledger, which means the
  on-chain record and the product record can drift.

Asks:

- An explicit signal in the balance response distinguishing "pooled" from "held on
  chain, not yet deposited". The silent zero is the sharpest edge in an otherwise
  excellent API, and it is fixable at the API rather than in every app.
- A list endpoint for Gateway transfers, so a product does not have to shadow-ledger
  its own users' activity.

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
