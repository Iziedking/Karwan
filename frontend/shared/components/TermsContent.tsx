import type { ReactNode } from 'react';

/// Single source of the visible Terms text used by `/terms` (public page) and
/// by the first-signin TermsModal. The backend has its own copy in
/// `docs/terms-and-conditions.md`; bumping the `TERMS_CURRENT_VERSION` env on
/// the backend AND editing the version here together is what triggers a
/// re-prompt across the product.
export const TERMS_LAST_UPDATED = '2026-05-29';

/// Bump this in lockstep with the backend's TERMS_CURRENT_VERSION when the
/// visible text changes materially. The modal records whatever the backend
/// says is current, so the source of truth for "is this user up to date" lives
/// on the backend; this constant is just for the human-visible footer.
export const TERMS_DISPLAY_VERSION = 1;

export function TermsContent({ heading }: { heading?: ReactNode }) {
  return (
    <div className="space-y-7">
      {heading}
      <p className="text-[13.5px] leading-relaxed text-[var(--lp-text-sub)]">
        These terms cover everything you do on Karwan. By signing in, posting a request, opening a
        deal, or staking, you agree to them. If you don&apos;t agree, please don&apos;t use the platform.
      </p>

      <Section title="1. What Karwan offers">
        <p>Karwan is a settlement layer for cross-border SME work. The core pieces:</p>
        <Bullets>
          <li>
            <strong>On-chain escrow.</strong> Every funded deal locks USDC in a smart contract on
            Arc, with milestone release controlled by the buyer.
          </li>
          <li>
            <strong>Stablecoin settlement.</strong> All movement is in USDC. There is no fiat rail
            in the product; conversions to and from your local currency are your own decision.
          </li>
          <li>
            <strong>Reputation passport.</strong> Your wallet carries a tier and score based on
            your deal history. Anyone with the address can read it.
          </li>
          <li>
            <strong>Agent assistance.</strong> Optional buyer and seller agents help you find
            counterparties, score offers, and negotiate within the limits you set. The agent never
            spends without your explicit approval.
          </li>
          <li>
            <strong>Bridging.</strong> USDC from supported source chains can be moved to Arc via
            Circle&apos;s Cross-Chain Transfer Protocol.
          </li>
        </Bullets>
        <p>
          Some of this is still rolling out. Anything labelled &quot;v2&quot;, &quot;coming
          soon&quot;, or shown behind a beta flag is not guaranteed to ship on a fixed date.
        </p>
      </Section>

      <Section title="2. What you are responsible for">
        <p>You take care of:</p>
        <Bullets>
          <li>
            <strong>Your keys and sign-in.</strong> Whether that&apos;s a passkey, an email login,
            or a connected wallet. Karwan never holds the keys that move your funds.
          </li>
          <li>
            <strong>Reviewing what you receive.</strong> Look at the deliverable before you release
            the final milestone. Once released, the funds are with the seller.
          </li>
          <li>
            <strong>The deadlines you set.</strong> If you give the seller two days, you can&apos;t
            claim breach on day one. If you don&apos;t set a deadline, the deal stays open until
            one of you closes it.
          </li>
          <li>
            <strong>Off-platform delivery is at your own risk.</strong> If you and your counterparty
            agree to share files, links, or specs outside Karwan, we cannot help you recover funds
            released on those grounds.
          </li>
          <li>
            <strong>Disputes follow the rules in the reputation doc.</strong> There is no human
            arbitration today. The contract logic and the recorded outcomes are the source of truth.
          </li>
        </Bullets>
      </Section>

      <Section title="3. Reputation and the agent">
        <p>Reputation is computed from actual on-chain settlement history. The summary:</p>
        <Bullets>
          <li>Successful deals raise your score and can move you to a higher tier.</li>
          <li>Disputes you lose lower your score. Disputes you win don&apos;t.</li>
          <li>A confirmed malicious delivery (security-tagged) drops your tier sharply.</li>
          <li>
            Staking shows commitment and contributes to a higher tier. It also acts as deal
            insurance starting in the v2.D contract.
          </li>
        </Bullets>
        <p>
          The full formula lives in the reputation model doc. The agent reads the tier and applies
          tier-aware behaviour: ELITE gets priority and skips the auction in some flows; NEW pays a
          premium for first deals. The agent never overrides the limits you&apos;ve set.
        </p>
      </Section>

      <Section title="4. Risk you carry">
        <p>Crypto and stablecoin work has real risks. The ones that apply here:</p>
        <Bullets>
          <li>
            <strong>USDC depeg or freeze.</strong> USDC is issued by Circle. If Circle&apos;s
            banking partners hit trouble, or if a sanctioned address mixes in, USDC can lose its
            peg or be frozen. Karwan cannot reverse this.
          </li>
          <li>
            <strong>Smart-contract risk.</strong> The escrow, vault, and reputation contracts on
            Arc were audited internally and are still considered testnet-quality. A bug, an
            exploit, or a misuse could result in lost funds.
          </li>
          <li>
            <strong>Network outages.</strong> Arc Testnet is a live testbed. If validators stall,
            RPC providers go down, or a chain reorg happens, your deal can pause or roll back.
          </li>
          <li>
            <strong>No fiat conversion guarantee.</strong> If you sell USDC for local currency,
            that&apos;s between you and your exchange.
          </li>
          <li>
            <strong>Geographic and regulatory compliance is yours.</strong> Karwan does not check
            whether USDC payments are legal where you live. Some jurisdictions restrict stablecoin
            payments, agent-mediated work, or peer-to-peer escrow. You are responsible for knowing
            your own rules.
          </li>
          <li>
            <strong>Karwan is testnet right now.</strong> You are not paid in real money. None of
            the deals on testnet have legal weight. We use testnet as a sandbox until the v2.D
            bundle plus an external audit clears the way to mainnet.
          </li>
        </Bullets>
      </Section>

      <Section title="5. Privacy snapshot">
        <p>What we store:</p>
        <Bullets>
          <li>Wallet addresses, on-chain activity, and off-chain deal records keyed by address.</li>
          <li>
            Optional email if you use the Circle sign-in path. Optional X handle if you bind it to
            your profile.
          </li>
          <li>Negotiation transcripts and chat messages tied to a deal.</li>
          <li>
            Reputation inputs (success counts, dispute counts, staked balance, registration
            timestamp).
          </li>
        </Bullets>
        <p>What we do not store:</p>
        <Bullets>
          <li>
            Private keys for any wallet path. Circle holds the user wallet keys; web3 wallets sign
            locally and we never see the secret.
          </li>
          <li>
            Payment card data, bank account numbers, or fiat ramp credentials. There is no fiat
            ramp in product.
          </li>
        </Bullets>
        <p>
          You can ask us to delete your account record from settings. Reputation events recorded
          on chain stay on chain. We cannot remove those.
        </p>
      </Section>

      <Section title="6. Account and acceptance">
        <p>By accepting these terms in the product, you confirm:</p>
        <Bullets>
          <li>You are at least 18 years old, or the age of majority where you live.</li>
          <li>You can lawfully enter contracts in your jurisdiction.</li>
          <li>
            The address you signed in with is yours, or you have authority to act for the entity
            that owns it.
          </li>
        </Bullets>
        <p>
          These terms can change. When a material change ships, the version number on this page
          bumps and the product asks you to accept the new version before you can post a request,
          open a deal, or stake. If you do not accept, you can still read your existing deals and
          reclaim escrow on the previous terms; you just cannot open new work.
        </p>
        <p>
          If you are using the product through an organisation, you confirm that you have authority
          to bind that organisation to these terms.
        </p>
      </Section>

      <Section title="7. Contact">
        <p>
          The fastest channel is the in-product feedback link. For matters that need a paper trail,
          email the address listed on karwan.site under &quot;Contact&quot;.
        </p>
      </Section>

      <p className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)] pt-4 border-t border-[var(--lp-border-light)]">
        Version {TERMS_DISPLAY_VERSION} . Last updated {TERMS_LAST_UPDATED}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-sans text-[18px] font-extrabold tracking-[-0.01em] text-[var(--lp-dark)]">
        {title}
      </h2>
      <div className="space-y-3 text-[13.5px] leading-relaxed text-[var(--lp-text-sub)]">
        {children}
      </div>
    </section>
  );
}

function Bullets({ children }: { children: ReactNode }) {
  return <ul className="space-y-2 list-disc pl-5 marker:text-[var(--lp-text-muted)]">{children}</ul>;
}
