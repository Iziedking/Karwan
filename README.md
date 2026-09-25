# Karwan

Karwan helps people and businesses agree a trade, hold USDC in milestone escrow, review delivery, and record payment. Bring a counterparty you already know, or use requests, offers and agent-assisted matching to find one.

## Availability

Status as of 25 September 2026:

| Environment | Available scope |
| --- | --- |
| [karwan.site](https://karwan.site) | Arc mainnet wallet application. Reputation and business registry contracts are deployed. Mainnet escrow and trading are not enabled. |
| [testnet.karwan.site](https://testnet.karwan.site) | Trade testing with test USDC: agreements, matching, milestone escrow, delivery review, disputes and receipts. Test funds have no monetary value. |

Mainnet and testnet have separate balances and records. Changing sites does not move funds between them. Use only the networks and transfer routes shown for your account. A deployed registry does not mean the money-holding contract suite is live.

Gateway is demonstrated as code only. The x402 payment integration is implemented but not live. Local-currency bank payouts and the mobile application are planned.

## How a deal works

1. The buyer and seller agree the amount, delivery requirements, deadline and milestones.
2. The buyer reviews the fees and funds escrow.
3. The seller submits delivery evidence.
4. The buyer reviews delivery and releases the applicable milestones. The agreement also defines deadline, claim and dispute paths.
5. Both parties can inspect the settlement record and its transaction evidence.

Read the review deadline before funding. The current testnet contract can allow a seller to claim an eligible milestone after its deadline, including the final milestone. A dispute freezes unreleased funds; it does not automatically refund the buyer. Contract versions can have different rules.

Agents compare candidates and prepare terms within account limits. Users approve deal funding. Contract-defined outcomes can proceed after the applicable deadlines, so approval of an agreement includes its recovery rules.

## Accounts and custody

A personal workspace and an optional owner-only business workspace share one account. Business verification is separate from personal identity checks. Team permissions are planned.

Connected-wallet users sign with their own wallet. Testnet email accounts use Circle Developer-Controlled Wallets operated by Karwan. Passkey sign-in and a passkey-controlled smart wallet are different mechanisms; a sign-in method alone does not establish custody. Customer Developer-Controlled Wallet provisioning is refused on mainnet. The Modular Wallet implementation is a separate passkey-signing path and is not evidence that every mainnet wallet flow has passed verification.

Once funded, escrow contracts govern deal payouts. Wallet signing authority, contract administrator powers and recovery rules should be considered separately. Neither escrow nor a reputation score guarantees delivery, asset value or recovery from a software failure.

## Circle integrations

| Product | Implementation and current scope |
| --- | --- |
| USDC | Testnet escrow, milestone payments, fees and stake; also Arc's gas asset. |
| Developer-Controlled Wallets | Testnet email and agent wallet operations in `backend/src/circle/wallets.ts` and `backend/src/chain/txs.ts`. |
| CCTP, App Kit and Bridge Kit adapters | Supported USDC transfers in `backend/src/circle/bridge-kit.ts` and `frontend/features/bridge/hooks/useBridge.ts`. Routes depend on network and wallet support. |
| Gateway | Unified-balance implementation in `frontend/features/gateway/lib.ts` and `backend/src/gateway/router.ts`. Code walkthrough only in the current demo. |
| Modular Wallets | Passkey smart-wallet implementation in `frontend/features/modularWallet/passkey.ts`; separate from Developer-Controlled Wallets. |
| USYC | Permissioned treasury integration in `contracts/src/KarwanTreasury.sol` and `backend/src/chain/usycOrchestrator.ts`. Code presence does not establish a current balance, entitlement or yield payment. |
| x402 and Agent Nanopayments | Paid-data buyer and seller implementations under `backend/src/x402/`. Not live. |

The application does not promise sponsored gas, free transfers, a fixed arrival time or guaranteed yield. Review the amount, fees, recipient and network before signing. [Circle integration details](./CIRCLE.md) describe the code and verification boundaries.

## Contracts

### Arc mainnet, chain 5042

Deployed on 25 September 2026. These two registries do not hold customer escrow funds. Both are owned by the Safe below; Reputation backfill is locked.

| Contract | Address |
| --- | --- |
| KarwanReputation | `0xa8E41F941b44CA091E3Ab7b600fe1484838aE27D` |
| KarwanBusinessRegistry | `0x69eA60B6EFd13A126Eb00d25aB0f21A4AfC636eF` |
| Owner Safe, 2 of 3 | `0x489C6367E2e943A3cC017589f73cAA8A80d7D028` |

Deployment records are in `contracts/deployments/registries-5042.json` and `contracts/deployments/safe-5042.json`.

### Arc testnet, chain 5042002

| Contract | Address |
| --- | --- |
| KarwanJobBoard | `0x35224C2234263B5506a9F7BfF4bb98e9FceD3FF3` |
| KarwanEscrow | `0x0262A4dFec0E057cAf80F124BfD2847581E82B63` |
| KarwanReputation | `0x8bD35853b986a04EfDED7F863AFF34826fde69eE` |
| KarwanVault | `0xA600Bd772A032Ec2b96a9A44545024E270418927` |
| KarwanTreasury | `0x5a642BE344Fc3a01999bF113197ddC1A163EE837` |
| KarwanYieldDistributor | `0x9E4AdFcfB46108ED7c2F3C1AF1728AAE937f336F` |
| KarwanInvoiceRegistry | `0xFb0Debd5E2618881699ED9b02CE0c9B718a1C649` |
| KarwanPOFinancing | `0xE87ef70E19FA8BbfdC04b9310371A7006B86b60A` |
| KarwanBusinessRegistry | `0x77F4a1Cc4C1F7BB35b23db679966b33b8d8b27cf` |
| USDC | `0x3600000000000000000000000000000000000000` |

Earlier deployments remain discoverable for existing positions. The public activity page distinguishes the network and contract history. Testnet transaction volume is not revenue or real-money settlement volume.

## Development

See [SETUP.md](./SETUP.md) for prerequisites and configuration. Never place credentials in source control.

```bash
npm ci
cp .env.example .env
# Configure the required values described in SETUP.md.
npm run dev
```

The backend listens on port 8787 and the frontend on port 3000. The frontend needs the API for account, balance, deal and activity data.

```bash
npm run typecheck
npm test
npm run build
cd contracts && forge test
```

Test prerequisites and environment configuration are described in the setup guide. Test counts change with the code; use the current command output rather than a historical count.

| Directory | Contents |
| --- | --- |
| `frontend/` | Next.js application and localized interface |
| `backend/` | Hono API, agents, provider adapters and reconciliation |
| `contracts/` | Solidity contracts, Foundry tests and deployment scripts |
| `docs/` | Public technical and product documentation |

## Planned releases

The target for the full mainnet contract release is 25 October 2026, after contract review, testnet stress testing, rehearsals and recovery checks. The mobile application is targeted for the following weeks. These dates are targets, not confirmation that the features are available.

Later work includes a user-invoked browser companion for bringing trade context into Karwan, recurring work agreements, expanded evidence checks and local-currency payout corridors. Financing implementations remain subject to eligibility, funding and deployment controls. An implementation is not an offer of credit.

## Documentation

- [Architecture](./docs/architecture.md)
- [Circle integration](./CIRCLE.md)
- [Agent workflows](./docs/agent-workflows.md)
- [Reputation model](./docs/reputation-model.md)
- [Work verification](./docs/work-verification.md)
- [Why Karwan](./docs/why-karwan.md)
- [Terms and conditions](./docs/terms-and-conditions.md)
- [Contract development](./contracts/README.md)

## License

See [LICENSE](./LICENSE).
