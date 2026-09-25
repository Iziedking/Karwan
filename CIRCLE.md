# Circle integration

Reviewed against the repository and demo evidence on 25 September 2026. Mainnet currently has the wallet application and two registries. The demonstrated trade flow uses Arc testnet. See the [availability table](./README.md#availability) before interpreting an integration as a production service.

## USDC

Karwan uses USDC for escrow principal, milestone payments, fees and staking. On Arc, USDC is also the native gas asset. The ERC-20 interface uses six decimals; the native interface uses eighteen. These are views of the same balance, not separate assets.

Network definitions are in `backend/src/chain/networks.ts`. Escrow funding and release are implemented in `contracts/src/KarwanEscrow.sol`. Amount conversion must respect the interface used; a provider acknowledgement is not proof that the expected transfer occurred.

## Developer-Controlled Wallets

`backend/src/circle/wallets.ts` provisions Circle wallets with `@circle-fin/developer-controlled-wallets`. Testnet email accounts use a customer identity wallet and separate operational agent wallets. Karwan has backend signing authority for these wallets. They must not be described as user-only signing wallets.

`backend/src/chain/txs.ts` submits contract execution requests and tracks provider status. A Circle `COMPLETE` result can still contain an inner smart-account failure. Callers must verify receipts, transfers and resulting contract state before reporting success.

Customer Developer-Controlled Wallet provisioning is refused on mainnet. Connected-wallet users sign with their own wallet. A passkey used for application sign-in does not change the authority of an existing Developer-Controlled Wallet.

## Modular Wallets

`frontend/features/modularWallet/passkey.ts` implements the separate Circle passkey smart-wallet path using `@circle-fin/modular-wallets-core`. Its signing model is distinct from the testnet email wallet model. The current demo shows code; it does not establish that every mainnet passkey workflow is operational.

## CCTP, App Kit and Bridge Kit adapters

The server transfer adapter is `backend/src/circle/bridge-kit.ts`. Connected-wallet transfers are coordinated by `frontend/features/bridge/hooks/useBridge.ts`. The implementation uses App Kit with Circle Wallets or viem adapters, depending on the signer.

A cross-chain transfer has separate source submission, confirmation, attestation and destination mint stages. Forwarding can submit the destination mint on supported routes. It does not make every transfer free or guarantee gas sponsorship. Fees, account support and route availability must come from the active configuration and quote.

Supported routes are defined in `backend/src/chain/cctpChains.ts` and `frontend/features/bridge/config.ts`. Testnet and mainnet routes are separate. A wallet may support receiving on a chain without supporting a contract execution from that chain.

## Gateway

The unified-balance implementation is in `frontend/features/gateway/lib.ts`, with server routing in `backend/src/gateway/router.ts` and balance reads in `backend/src/routes/gateway.ts`.

Gateway is shown as code only in the current demo. Source code for deposits, spending, delegate controls and fee reservation is not evidence of a completed transfer. Verify the supported account type, signing authority, fees and destination credit before treating a route as available.

## USYC

`contracts/src/KarwanTreasury.sol` implements treasury subscription and redemption through the Teller interface. `backend/src/chain/usycOrchestrator.ts` coordinates those operations and supports inspection before execution.

USYC access is permissioned. Deployment of the integration does not establish that a particular address is entitled, currently holds USYC or has paid yield. A current position needs a chain read. Escrow and staking yield must not be presented as guaranteed or as a general mainnet capability.

## x402 and Agent Nanopayments

The x402 integration is implemented but not live. `backend/src/x402/buyerClient.ts` contains the Gateway payment path; `backend/src/x402/externalClient.ts` contains the external-provider path. Seller implementation is in `backend/src/x402/sellerFacilitator.ts` and `backend/src/routes/x402.ts`.

These paths require provider, asset, recipient, price and spending-policy checks. A signed request that times out has an unknown outcome until reconciled. The presence of a service catalogue or payment client is not evidence of a paid request or settled revenue.

Circle CLI and Skills are development and operator tools. Agent Wallet and Marketplace adapters are separate from customer deal wallets. They should not be counted as active customer services without an enabled path and transaction evidence.

## Webhooks and verification

`backend/src/circle/webhooks.ts` verifies signed notifications at `POST /api/circle/webhook`. Polling and reconciliation remain necessary when notifications are absent or delayed. A notification reports provider state; the application still needs the financial result expected by the operation.

See [integration verification](./docs/circle-integration.md) for the evidence required for each path and [SETUP.md](./SETUP.md) for local configuration.
