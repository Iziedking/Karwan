# Circle integration

How each Circle tool is wired into Karwan: the package, the file, the call, and
the gotcha worth knowing. This reflects what runs, not what is planned. Setup and
run instructions are in [SETUP.md](./SETUP.md); the deeper per-product notes and
the build-time friction are in [docs/circle-integration.md](./docs/circle-integration.md)
and [docs/circle-product-feedback.md](./docs/circle-product-feedback.md).

Products used on Arc: **USDC, Wallets, Gateway, CCTP with Bridge Kit, USYC, Nanopayments.**

## USDC on Arc

The settlement asset for escrow, milestone release, factoring, purchase-order
custody, repayment, staking, and fees. On Arc, USDC is also the native gas token.

- ERC-20 interface at `0x3600000000000000000000000000000000000000`, 6 decimals.
- Native gas view is 18 decimals. **They are one balance, not two tokens.**
  Application code reads and sends only through the 6-decimal ERC-20 view; mixing
  the two is the sharpest edge on Arc (a value correct at 6 decimals is off by a
  factor of a trillion at 18). Chain config in `backend/src/chain/client.ts`.

## Circle Wallets (Developer-Controlled)

Package: `@circle-fin/developer-controlled-wallets`. Every user gets an identity
wallet and two agent wallets, provisioned on sign-in, so no one handles a key.

- Setup: `backend/src/circle/wallets.ts` — `initiateDeveloperControlledWalletsClient`
  then `createWalletSet` → `createWallets({ blockchains: ['ARC-TESTNET'], accountType: 'SCA' })`.
  Run once with `npm run wallets:create` (see SETUP.md step 4).
- Every on-chain write the agents make goes through `executeContractCall` in
  `backend/src/chain/txs.ts`, which calls `createContractExecutionTransaction`
  with an ABI signature string and a params array, so we never hand-encode
  calldata. Nonce and gas handling come from the SDK.
- The entity-secret model keeps signing authority on the backend without us
  holding raw private keys.

## CCTP V2 with Bridge Kit / App Kit

Packages: `@circle-fin/app-kit` with `@circle-fin/adapter-circle-wallets`
(backend) and `@circle-fin/adapter-viem-v2` (frontend). USDC moves into and out
of Arc across **twelve chains**, both directions.

- Backend bridge: `backend/src/circle/bridge-kit.ts` — `bridgeInToArcViaAppKit`
  and `bridgeOutFromArcViaAppKit`, both with `useForwarder: true`. The Circle
  Wallets adapter signs straight from the Developer-Controlled Wallets, so an
  email or passkey user bridges without a wallet popup.
- Withdrawal uses Circle's **Forwarding Service** to submit the destination mint,
  so we hold no wallet on the destination chain and a supplier cashes out to any
  supported chain without ever holding that chain's gas token.
- Chain registry: `backend/src/chain/cctpChains.ts` (11 non-Arc chains + Arc,
  domain 26). Frontend config: `frontend/features/bridge/config.ts`.
- Capability boundary encoded in code: a CCTP burn is a contract execution, so a
  Circle wallet cannot burn from a chain Circle Wallets does not name. Those
  chains are marked web3-only in config and the UI reflects it.

## Circle Gateway

Package: `@circle-fin/app-kit` (`unifiedBalance`). Two roles.

- **Unified balance.** One pooled USDC balance across twelve chains. Read:
  `backend/src/routes/gateway.ts` → `kit.unifiedBalance.getBalances`. Deposit and
  spend: `frontend/features/gateway/lib.ts` → `deposit()` and `spend({ useForwarder: true })`.
  Deposit once, spend to any chain from a single signature.
- Design facts that shaped the code: the burn-intent signing domain carries no
  chain id, so one signature covers burns across several source chains at once;
  and Gateway needs an ECDSA signature, so an SCA cannot sign a burn intent
  directly. Circle's `addDelegate` on the Gateway Wallet is the answer — our
  pooled balance lives on the user's own EOA, and the agent SCAs receive from it.
- **x402 settlement rail.** Gateway also nets the agents' per-call payments into
  batched on-chain settlement (see Nanopayments).

## Hashnote USYC

The gated tool. Idle capital earns instead of waiting, through tokenized Treasury
bills on Arc.

- `contracts/src/KarwanTreasury.sol` is an ERC-4626 vault that subscribes to real
  allowlisted USYC through the Hashnote Teller and redeems on demand, marking its
  holdings to the on-chain oracle in `totalReserves()`.
- Three balances route in: platform-fee reserves (treasury, live), idle staking
  principal (vault, via an operator-mediated Teller path because the Teller checks
  the direct caller and the vault contract is not itself entitled), and, with the
  v2 release, idle escrow float.
- USYC is permissioned, so holding it at all is the integration proof: an address
  without an entitlement cannot. Reproduce the live position:
  `cd backend && npm run usyc:prove` (read-only, no keys).

## Nanopayments (x402)

Packages: `@circle-fin/x402-batching` (Karwan as seller and on-platform buyer) and
`@x402/evm` exact-EVM scheme (off-platform buyer). Two rails, different questions.

- **On Arc, through Gateway.** Before scoring a bid, an agent pays 0.01 USDC to
  read a counterparty's full settled-deal record. Buyer client:
  `backend/src/x402/buyerClient.ts` (a lazily-provisioned Circle DCW EOA signs,
  because Gateway rejects SCA signatures). These net into one batched settlement.
- **On Base mainnet, to an independent provider.** A neutral platform agent pays
  a genuinely third-party provider in real USDC over the standard exact-EVM
  scheme for live market research: `backend/src/x402/externalClient.ts`. The
  receipt resolves on the Base explorer like any other transaction.
- **Karwan as seller.** Five paid endpoints (credit passport, repayment
  behaviour, concentration, document anchors, skill demand) in
  `backend/src/x402/sellerFacilitator.ts` + `backend/src/routes/x402.ts`, so an
  outside underwriter can price Karwan credit without asking Karwan.

## Circle webhooks

`backend/src/circle/webhooks.ts` verifies Circle's event push notifications
(ECDSA-SHA256, `X-Circle-Signature` / `X-Circle-Key-Id`), mounted at
`POST /api/circle/webhook`. Set `CIRCLE_WEBHOOK_SUBSCRIPTION_ID` to enable; when
unset the route reports not-configured and the polling path in `chain/txs.ts` is
the completion signal.

## Contract addresses

The live Arc Testnet (chain 5042002) addresses, including the Hashnote USYC token,
Teller, and oracle, are in the [README](./README.md#contracts-on-arc-testnet-chain-5042002).
