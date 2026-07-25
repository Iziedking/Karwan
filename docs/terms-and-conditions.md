# Karwan terms and conditions

Last updated: 2026-07-25. Version: 2.

These terms cover how Karwan works, what we do with your money, and what each side is responsible for. Signing in, posting a request, opening a deal, or staking means you accept them. Take a moment with them first.

## 1. What Karwan offers

Karwan is a settlement layer for cross-border work between businesses, freelancers, and individuals. The core pieces:

- **Deals with escrow.** Open a deal directly with someone you already know, or post a request and let the market bid. Either way the money locks in a smart contract on Arc before work starts, and releases in milestones.
- **Settlement in USDC.** All movement inside Karwan is in USDC, a dollar stablecoin issued by Circle.
- **Local currency.** Karwan does not convert to or from your local currency inside the product today. Converting is your own decision, made outside Karwan. Local currency access is being enabled region by region. Where it becomes available, it is provided by a licensed partner under their own terms and their own identity checks, and what you can reach depends on the region your account is registered in. Nothing here is a commitment to a date or to a particular region.
- **Invite by email.** You can open a deal with someone who has no account. They claim it from an emailed link with a one-time code, and get paid without ever installing a wallet.
- **Moving money in and out.** USDC can be moved to Arc from Ethereum, Base, Arbitrum, Optimism, Polygon, and Solana, and back out to any of them, using Circle's Cross-Chain Transfer Protocol. Transfers within Arc are direct.
- **Reputation and the credit passport.** Your account carries a tier and a score built from settled deal history. Anyone with your address can read the on-chain part.
- **Agents.** Optional buyer and seller agents find counterparties, score offers, and negotiate inside the limits you set. They negotiate. They do not move money on their own. Every movement is either approved by you or is one of the automatic outcomes in section 4.
- **The assistant.** An in-product AI assistant answers questions and can prepare actions for you. Anything that moves money is shown to you and needs your confirmation before it runs. You can ask it for a person at any point, which opens a support ticket.
- **Staking.** You can lock USDC in the vault. It raises your tier and acts as deal insurance the escrow contract can draw on if you lose a dispute.

Some of this is still rolling out. Business registration, invoice factoring, purchase-order financing, and the financier side are behind flags and are not available to every account. Anything labelled "coming soon" or shown behind a beta flag is not guaranteed to ship on a fixed date.

## 2. How your account is held

Karwan settles in USDC. How your balance is held depends on how you signed in.

**If you connected your own wallet,** you hold it. You approve every movement yourself, and Karwan cannot move anything without you.

**If you signed in with email or a passkey,** Karwan opens an account for you on Circle's wallet infrastructure and operates it on your behalf. You do not manage credentials and you do not need to.

Operating it means something specific. Karwan can move your money only to carry out things you started: fund a deal you created, release a milestone you approved, return funds to you when a deal is cancelled or a deadline is missed, and complete the automatic outcomes described in section 4. Karwan cannot send your balance to anyone outside a deal you opened, cannot change a deal after both sides accept, and cannot move your funds to itself.

Once a deal is funded, the escrow contract on Arc governs where that money can go. That limit is enforced by the contract, not by our policy.

The automatic parts of Karwan exist because of this. A milestone that releases on its own after the review window, and a refund that returns to a buyer when a seller misses a deadline, both need an account that can act when neither side is online.

One exception is worth naming. If you activate paid market research, you pay once for a credit balance, and your agent spends from that balance on your behalf as it reads market data. That is the only place an agent spends without a fresh approval each time, and you can see the remaining balance on your profile.

## 3. What you are responsible for

You take care of:

- **Your sign-in.** Keep your passkey, your email access, or your connected wallet secure. Anyone who has them can act as you.
- **Reviewing what you receive.** Look at the deliverable before you release the final milestone. Once released, the funds are with the seller.
- **The deadlines you set.** If you give the seller two days, you cannot claim breach before that period has passed. If you do not set a deadline, the deal stays open until one of you closes it.
- **Off-platform delivery.** If you and your counterparty agree to share files, links, or specs outside Karwan, we cannot help you recover funds released on those grounds.
- **Who you deal with.** Karwan does not verify identity, licences, or the right to trade. A tier and a score describe settlement history, not trustworthiness.
- **Currency.** Karwan does not convert currencies and does not apply an exchange rate. Amounts you enter are amounts in USDC. If local currency access reaches your region, the rate and the fee on that leg belong to the partner providing it, not to Karwan.

## 4. How a deal settles

Once escrow is funded, these are the rules that move the money.

- **Milestone release.** The buyer releases each milestone. The final milestone always needs an explicit click from the buyer and never releases on a timer.
- **Automatic release.** Milestones before the final one release on their own once the review window has passed with no action from the buyer. The window is shown on the deal and lengthens for each later milestone.
- **A missed deadline.** When a delivery deadline passes with nothing delivered, the buyer is alerted and can reclaim or grant an extension. If nobody acts and the seller still has not delivered after the grace window, the escrow returns to the buyer automatically and the miss is recorded against the seller.
- **Cancelling.** A cancel both sides agree to refunds in full and carries no penalty. Staked funds reserved against the deal are released back to the seller.
- **Disputes.** There is no human arbitration today. Where a dispute cannot be settled between the two of you, the contract logic and the recorded outcomes are the source of truth. Do not open a deal on Karwan expecting a third party to rule on it.

The exact timings in force are published on the disputes page in the product, and they can change. The page shows the live values, not a copy of them.

## 5. Reputation and the agent

Reputation is computed from settled deal history. The summary:

- Successful deals raise your score and can move you to a higher tier.
- Disputes you lose reduce your score. Disputes you win do not.
- A delivery confirmed as malicious drops your tier sharply.
- A missed deadline that ends in a reclaim is recorded as a failure.
- Staking contributes to a higher tier and acts as deal insurance the escrow contract can draw on.

The full formula lives in `docs/reputation-model.md`. Agents read the tier and apply tier-aware behaviour: a high tier gets priority and can skip the auction in some flows, a new account pays a premium on first deals. An agent never overrides the limits you set.

Reputation is written against the account that settled the deal. If you use an agent wallet, the record follows that wallet.

## 6. Risk you carry

Stablecoin work has real risks. The ones that apply here:

- **Karwan is on testnet right now.** You are not paid in real money. Deals on testnet have no legal weight. Testnet is a sandbox. Mainnet follows after the hardening pass.
- **Smart-contract risk.** The escrow, vault, and reputation contracts on Arc were audited internally and are testnet quality. A bug, an exploit, or a misuse could result in lost funds.
- **USDC depeg or freeze.** USDC is issued by Circle. If Circle's banking partners come under stress, or a sanctioned address is involved, USDC can lose its peg or be frozen. Karwan cannot reverse this.
- **Network outages.** Arc Testnet is a live testbed. If validators stall, RPC providers go down, or a chain reorg happens, your deal can pause or roll back.
- **Cross-chain transfers.** Moving USDC between chains depends on infrastructure outside Karwan. A transfer can take longer than the product suggests, and a transfer that has left one chain but not yet arrived on another is not something Karwan can reverse.
- **No fiat conversion guarantee.** If you sell USDC for local currency today, that transaction is solely between you and whoever you sell it to. Where local currency access arrives inside Karwan, it runs on a licensed partner. Availability, limits, rates, and identity checks are set by that partner, can change, and can be withdrawn in a region without notice to you from us.
- **What is checked, and what is not.** Your money is protected by the escrow contract and every step is written to a record both sides can verify. What Karwan does not do today is screen the person on the other side: there are no sanctions, anti-money-laundering, or business identity checks on a deal. Choose who you work with the way you would anywhere else. Privacy-preserving counterparty screening is on the roadmap for mainnet. Where a licensed partner provides local currency access, that partner runs its own identity checks as part of their service.
- **Geographic and regulatory compliance is yours.** Karwan does not check whether stablecoin payments are legal where you live. Some jurisdictions restrict stablecoin payments, agent-mediated work, or peer-to-peer escrow. You are responsible for knowing your own rules.

## 7. Privacy snapshot

What we store:

- Addresses, on-chain activity, and off-chain deal records keyed by address.
- Your email if you sign in by email or passkey, or if you verify one. Your X handle and your Telegram account if you connect them.
- Negotiation transcripts, deal messages, assistant conversations, and support tickets.
- Reputation inputs: settled deal counts, dispute counts, staked balance, registration time.
- Business details you submit for registration, including a hash of any document you upload. The document itself is hashed in your browser and is not sent to us.

What we do not store:

- Signing credentials for a connected wallet. Those never leave your device.
- Payment card data or bank account numbers. Where local currency access becomes available in your region, those details go to the licensed partner providing it and are handled under their privacy terms, not held by Karwan.

For accounts Karwan operates on your behalf, the signing capability is held in Circle's infrastructure under our control, as described in section 2. It is not stored by us as a key you or we could copy out.

You can ask us to delete your account record from `/settings`. Anything recorded on chain stays on chain. We cannot remove that.

## 8. Account and acceptance

By accepting these terms in the product, you confirm:

- You are at least 18 years old, or the age of majority where you live.
- You can lawfully enter contracts in your jurisdiction.
- The account you signed in with is yours, or you have authority to act for the entity that owns it.

These terms can change. When a material change ships, the version number on this page bumps and the product asks you to accept the new version before you can post a request, open a deal, or stake. If you do not accept, you can still read your existing deals and reclaim escrow on the previous terms. You just cannot open new work.

If you are using the product through an organisation, you confirm that you have authority to bind that organisation to these terms.

## 9. Contact

The fastest channel is the in-product feedback link at `/feedback`, or the assistant, which can open a support ticket for you. For matters that need a paper trail, email the address listed on `karwan.site` under "Contact". Every live chat and email opens a ticket with an id. Keep the id if you have one.
