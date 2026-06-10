# Karwan terms and conditions

Last updated: 2026-05-29. Version: 1.

These terms cover everything you do on Karwan. By signing in, posting a request, opening a deal, or staking, you agree to them. If you don't agree, please don't use the platform.

## 1. What Karwan offers

Karwan is a settlement layer for cross-border SME work. The core pieces:

- **On-chain escrow.** Every funded deal locks USDC in a smart contract on Arc, with milestone release controlled by the buyer.
- **Stablecoin settlement.** All movement is in USDC. There is no fiat rail in the product; conversions to and from your local currency are your own decision.
- **Reputation passport.** Your wallet carries a tier and score based on your deal history. Anyone with the address can read it.
- **Agent assistance.** Optional buyer and seller agents help you find counterparties, score offers, and negotiate within the limits you set. The agent never spends without your explicit approval.
- **Bridging.** USDC from supported source chains can be moved to Arc via Circle's Cross-Chain Transfer Protocol.

Some of this is still rolling out. Anything labelled "coming soon" or shown behind a beta flag is not guaranteed to ship on a fixed date.

## 2. What you are responsible for

You take care of:

- **Your keys and sign-in.** Whether that's a passkey, an email login, or a connected wallet. Karwan never holds the keys that move your funds.
- **Reviewing what you receive.** Look at the deliverable before you release the final milestone. Once released, the funds are with the seller.
- **The deadlines you set.** If you give the seller two days, you can't claim breach on day one. If you don't set a deadline, the deal stays open until one of you closes it.
- **Off-platform delivery is at your own risk.** If you and your counterparty agree to share files, links, or specs outside Karwan, we cannot help you recover funds released on those grounds.
- **Disputes follow the rules in the reputation doc.** There is no human arbitration today. The contract logic and the recorded outcomes are the source of truth.

## 3. Reputation and the agent

Reputation is computed from actual on-chain settlement history. The summary:

- Successful deals raise your score and can move you to a higher tier.
- Disputes you lose lower your score. Disputes you win don't.
- A confirmed malicious delivery (security-tagged) drops your tier sharply.
- Staking shows commitment and contributes to a higher tier. It also acts as deal insurance enforced by the current escrow contract.

The full formula lives in `docs/reputation-model.md`. The agent reads the tier and applies tier-aware behaviour: ELITE gets priority and skips the auction in some flows; NEW pays a premium for first deals. The agent never overrides the limits you've set.

## 4. Risk you carry

Crypto and stablecoin work has real risks. The ones that apply here:

- **USDC depeg or freeze.** USDC is issued by Circle. If Circle's banking partners hit trouble, or if a sanctioned address mixes in, USDC can lose its peg or be frozen. Karwan cannot reverse this.
- **Smart-contract risk.** The escrow, vault, and reputation contracts on Arc were audited internally and are still considered testnet-quality. A bug, an exploit, or a misuse could result in lost funds.
- **Network outages.** Arc Testnet is a live testbed. If validators stall, RPC providers go down, or a chain reorg happens, your deal can pause or roll back.
- **No fiat conversion guarantee.** If you sell USDC for local currency, that's between you and your exchange.
- **Geographic and regulatory compliance is yours.** Karwan does not check whether USDC payments are legal where you live. Some jurisdictions restrict stablecoin payments, agent-mediated work, or peer-to-peer escrow. You are responsible for knowing your own rules.
- **Karwan is testnet right now.** You are not paid in real money. None of the deals on testnet have legal weight. Testnet is a sandbox; mainnet rolls out after the standard hardening pass.

## 5. Privacy snapshot

What we store:

- Wallet addresses, on-chain activity, and off-chain deal records keyed by address.
- Optional email if you use the Circle sign-in path. Optional X handle if you bind it to your profile.
- Negotiation transcripts and chat messages tied to a deal.
- Reputation inputs (success counts, dispute counts, staked balance, registration timestamp).

What we do not store:

- Private keys for any wallet path. Circle holds the user wallet keys; web3 wallets sign locally and we never see the secret.
- Payment card data, bank account numbers, or fiat ramp credentials. There is no fiat ramp in product.

You can ask us to delete your account record from `/settings`. Reputation events recorded on chain stay on chain. We cannot remove those.

## 6. Account and acceptance

By accepting these terms in the product, you confirm:

- You are at least 18 years old, or the age of majority where you live.
- You can lawfully enter contracts in your jurisdiction.
- The address you signed in with is yours, or you have authority to act for the entity that owns it.

These terms can change. When a material change ships, the version number on this page bumps and the product asks you to accept the new version before you can post a request, open a deal, or stake. If you do not accept, you can still read your existing deals and reclaim escrow on the previous terms; you just cannot open new work.

If you are using the product through an organisation, you confirm that you have authority to bind that organisation to these terms.

## 7. Contact

The fastest channel is the in-product feedback link at `/feedback`. For matters that need a paper trail, email the address listed on `karwan.site` under "Contact".
