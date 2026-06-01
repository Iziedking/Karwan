import {
  DocsEyebrow,
  DocsH2,
  DocsH3,
  DocsP,
  DocsList,
  DocsListItem,
  DocsCallout,
} from '@/features/docs/components/Prose';

export const metadata = {
  title: 'Roadmap · Karwan Docs',
  description: 'What is live on Karwan today and what is shipping next.',
};

export default function DocsRoadmapPage() {
  return (
    <article>
      <DocsEyebrow>ROADMAP</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        What is live, and what is next
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>
        Karwan runs on Arc Testnet today. The escrow, the agents, the
        reputation passport, and the bridge are all live. The list below shows
        what has shipped and what we are building next.
      </DocsP>

      <DocsH2>Live today</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>Agentic match and negotiate.</strong> Buyer and seller agents
          ranked by reputation, negotiating in multiple rounds inside the
          ranges each side set. Either side can read every counter on the deal
          timeline.
        </DocsListItem>
        <DocsListItem>
          <strong>Stake as deal insurance.</strong> A portion of the
          seller&apos;s free stake reserves against every accepted deal. A
          failed dispute slashes that reservation to the buyer.
        </DocsListItem>
        <DocsListItem>
          <strong>Public Credit Passport.</strong> Every wallet has a public
          reputation page showing tier, score, term breakdown, and on-chain
          history. Anyone can read it without signing in.
        </DocsListItem>
        <DocsListItem>
          <strong>Shareable deal links.</strong> Open a deal pointed at an
          email address. The recipient claims with a one-time code and a
          Circle wallet is provisioned in their browser.
        </DocsListItem>
        <DocsListItem>
          <strong>Cashout after settlement.</strong> Send settled USDC to any
          wallet on Arc, or bridge out to Ethereum, Base, Arbitrum, Optimism,
          Polygon, or Solana with an inline progress card.
        </DocsListItem>
        <DocsListItem>
          <strong>Vault and treasury wired for USYC.</strong> Idle stake
          principal routes through the standard ERC-4626 interface that
          Hashnote USYC uses on mainnet. Testnet runs against a deterministic
          mock so the demo path works today.
        </DocsListItem>
        <DocsListItem>
          <strong>Terms and Conditions with versioned consent.</strong> A
          public terms page and a first-signup consent gate that re-prompts
          when the version changes.
        </DocsListItem>
        <DocsListItem>
          <strong>Three sign-in paths.</strong> Email and passkey, email
          one-time code, or a web3 wallet through Sign-In with Ethereum.
        </DocsListItem>
        <DocsListItem>
          <strong>Multi-language framework.</strong> English, Arabic, French,
          Hindi, and Swahili across the most user-facing surfaces today.
        </DocsListItem>
        <DocsListItem>
          <strong>Guided coachmark tours.</strong> Role-aware walkthroughs run
          once per page so new users learn the product as they use it.
        </DocsListItem>
      </DocsList>

      <DocsH2>Shipping next</DocsH2>

      <DocsH3>x402 nanopayment rails for agents</DocsH3>
      <DocsP>
        Today the agents reason on what is already inside Karwan: the deal
        under negotiation, recent matches, on-chain reputation, our internal
        market median for the skill. x402 lets the agents pay sub-cent fees
        in USDC to call outside services in line with a negotiation: live
        market medians from paid data, trade and shipping signals, deeper
        credit checks on a passport, news during a review window. Every paid
        signal is recorded on the deal timeline so the user sees exactly what
        the agent paid for and why. The agent earns its keep by spending
        pennies to make better decisions.
      </DocsP>

      <DocsH3>Invoice factoring</DocsH3>
      <DocsP>
        A financier funds an accepted deal at a discount; the escrow&apos;s
        payout slot switches to the financier for the release; the seller
        gets paid early. Reputation tier sets the discount floor. The credit
        passport becomes the financing surface.
      </DocsP>

      <DocsH3>Symmetric reputation crediting</DocsH3>
      <DocsP>
        Settled deals will credit both buyer and seller on chain instead of
        only the seller. Both wallets carry the same outcome record.
      </DocsP>

      <DocsH3>Verified deliverables</DocsH3>
      <DocsP>
        A security agent scans every delivered link before the buyer sees it,
        so a malicious URL never reaches the person about to release escrow.
        Confirmed bad actors take a permanent reputation hit.
      </DocsP>

      <DocsH3>File delivery</DocsH3>
      <DocsP>
        Deliver work as a file rather than only a link, with the same scan
        pipeline. Built on Cloudflare R2 for speed and IPFS for
        tamper-evident, content-addressed delivery of confidential trade
        documents.
      </DocsP>

      <DocsH3 id="referral-marketing-rail">Referral marketing rail (mainnet)</DocsH3>
      <DocsP>
        A growth surface that rewards users for bringing real counterparties
        on board. When you refer someone who registers through a completed
        deal with you, both wallets get a reputation lift on the new
        referral signal. Designed for mainnet, where every honest signup is
        a real customer rather than a faucet click. Sits behind a small
        anti-fraud check so the same wallet does not refer itself, and so
        repeating with the same counterparty does not stack indefinitely.
      </DocsP>

      <DocsH3>Mainnet hardening</DocsH3>
      <DocsList>
        <DocsListItem>
          <strong>External smart-contract audit</strong> before any mainnet
          deployment.
        </DocsListItem>
        <DocsListItem>
          <strong>Safe multisig treasury</strong> to replace the deployer
          address before the mainnet contracts hold real funds.
        </DocsListItem>
        <DocsListItem>
          <strong>Higher test coverage</strong> on the escrow and vault
          branches before audit.
        </DocsListItem>
      </DocsList>

      <DocsH3>Reach</DocsH3>
      <DocsP>
        Karwan is built for cross-border service trade anywhere in the world.
        The early language roster covers several corridors where bank rails
        are slowest today, and new locales come on as the user base grows.
      </DocsP>
      <DocsList>
        <DocsListItem>
          <strong>Full string coverage and Arabic right-to-left pass</strong>{' '}
          across every page, not only the sign-in and notification surfaces.
        </DocsListItem>
        <DocsListItem>
          <strong>Public handbook.</strong> A hosted guide for buyers,
          sellers, financiers, and agent operators.
        </DocsListItem>
      </DocsList>

      <DocsCallout title="TESTNET TODAY">
        Everything live on Karwan runs on Arc Testnet, so testnet USDC has no
        real value. Mainnet items, including treasury yield through Hashnote
        USYC, ship after the contracts pass a professional external audit.
      </DocsCallout>
    </article>
  );
}
