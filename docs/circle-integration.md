# Circle integration verification

Last reviewed: 25 September 2026.

[CIRCLE.md](../CIRCLE.md) maps each product to its implementation and current availability. This guide describes what to verify before calling an operation complete. The current demo proves the filmed testnet workflow, not every implemented path or a full mainnet release.

## Wallet authority

Identify the account type before testing. A connected wallet signs its own transactions. Karwan operates testnet Developer-Controlled Wallets through backend credentials. Circle Modular Wallets use a separate passkey-signing path. A login label does not establish custody.

Record the source wallet, network, asset, recipient, amount, fees and expected contract change. Never include API keys, entity secrets, passkey material or private keys in evidence.

## Completion checks

| Path | Required evidence |
| --- | --- |
| USDC escrow | Successful receipt, expected token transfers, funded contract state and matching deal record |
| Milestone release | Expected recipient and net amount, fee transfer, milestone state and receipt |
| Developer-Controlled Wallet execution | Provider result plus independent receipt and contract-state checks; `COMPLETE` alone is insufficient |
| CCTP transfer | Source burn, attestation and destination mint or independently verified destination credit |
| Gateway | Accepted authorization, applicable fees, destination credit and reconciliation of uncertain attempts |
| Modular Wallets | User-signed operation and resulting chain state on the specified network |
| USYC | Address entitlement, subscription or redemption receipt, token balance and reserve accounting |
| x402 | Authorized request, provider response and reconciled payment result; this integration is not live |

For an uncertain outcome, look up the existing operation before resubmitting it. Reusing a transaction identifier or receiving an HTTP success response does not establish that funds arrived.

## Network and fees

Use the routes exposed by the current network configuration. Testnet records must be labelled as testnet and excluded from real-money settlement or revenue claims. Do not infer support for every chain from one successful route.

Review source and destination fees before signing. A forwarder submitting a mint does not establish that Karwan sponsors gas or that a transfer has no cost. Timing depends on the source network, provider and destination execution.

## Current evidence boundaries

- The demo records a testnet agreement, funding, delivery, milestone release and settlement receipt.
- Mainnet Reputation and BusinessRegistry addresses are listed in the [README](../README.md#contracts). They do not hold escrow funds.
- Gateway and Modular Wallets are code walkthroughs in the demo.
- USYC code demonstrates the treasury integration, not a promise of current holdings or yield.
- x402 is implemented but not live. Do not report paid usage or revenue from it without a later verified record.

## Further reading

- [Architecture](./architecture.md)
- [Agent workflows](./agent-workflows.md)
- [Marketplace service policy](./circle-agent-marketplace-services.md)
- [Setup](../SETUP.md)
