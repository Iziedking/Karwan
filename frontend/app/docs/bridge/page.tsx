import {
  DocsEyebrow,
  DocsH2,
  DocsH3,
  DocsP,
  DocsList,
  DocsListItem,
  DocsFigure,
  DocsCallout,
} from '@/features/docs/components/Prose';

export const metadata = {
  title: 'Bridge · Karwan Docs',
  description: 'Move USDC into Arc and out of Arc using Circle CCTP, with no wrapped tokens.',
};

export default function DocsBridgePage() {
  return (
    <article>
      <DocsEyebrow>BRIDGE</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        Move USDC in and out of Arc
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>
        Deals settle in USDC on Arc. The bridge moves your USDC over from
        another chain and, after settlement, sends it back out to wherever you
        want it. The whole flow runs on Circle Cross-Chain Transfer Protocol, so
        your USDC is burned on the source chain and minted fresh on the
        destination. No wrapped tokens, no third-party liquidity pools.
      </DocsP>

      <DocsH2>Supported chains</DocsH2>
      <DocsP>
        Six chains today, in both directions. New chains come on as Circle
        rolls them out.
      </DocsP>
      <DocsList>
        <DocsListItem>Base Sepolia</DocsListItem>
        <DocsListItem>Ethereum Sepolia</DocsListItem>
        <DocsListItem>Arbitrum Sepolia</DocsListItem>
        <DocsListItem>Optimism Sepolia</DocsListItem>
        <DocsListItem>Polygon Amoy</DocsListItem>
        <DocsListItem>Solana Devnet</DocsListItem>
      </DocsList>

      <DocsH2>Bringing USDC to Arc</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>Pick a source chain.</strong> Choose where your USDC currently
          sits.
        </DocsListItem>
        <DocsListItem>
          <strong>Approve and burn.</strong> Your USDC is burned on the source
          chain. Web3 users sign this from their own wallet; email and passkey
          users have it handled by their Circle wallet, which never asks them
          to hold a native gas token.
        </DocsListItem>
        <DocsListItem>
          <strong>Wait for attestation.</strong> Circle confirms the burn. On
          testnet this takes about ten to nineteen minutes for the standard
          path.
        </DocsListItem>
        <DocsListItem>
          <strong>Mint on Arc.</strong> Karwan relays the mint on your behalf,
          so you do not need Arc gas to receive your funds.
        </DocsListItem>
      </DocsList>

      <DocsFigure
        src="/docs/images/bridge-steps.png"
        alt="Bridge card showing the approve, burn, attestation, and mint steps"
        caption="The four steps of an inbound bridge, tracked live."
      />

      <DocsCallout tone="warn" title="ATTESTATION TAKES TIME ON TESTNET">
        Standard transfers wait for source-chain finality, which runs ten to
        nineteen minutes on Sepolia testnets. If a bridge shows as still
        attesting, give it time before retrying. The Recheck button on the
        bridge card re-queries Circle.
      </DocsCallout>

      <DocsH2>Cashing out after a deal settles</DocsH2>
      <DocsP>
        Once your deal settles, the Cashout page lets you send your USDC where
        you want it. Two destinations:
      </DocsP>
      <DocsList>
        <DocsListItem>
          <strong>Arc to Arc.</strong> Send to any wallet on Arc. Instant, with
          fees in fractions of a cent.
        </DocsListItem>
        <DocsListItem>
          <strong>Cross-chain.</strong> Send to one of the six supported source
          chains. Your USDC is burned on Arc, attested by Circle, and minted on
          the destination. The progress card on the page shows burning, burned,
          attested, and minted in real time, so you never have to track a
          transaction hash on a block explorer.
        </DocsListItem>
      </DocsList>

      <DocsH2>If you sign in with email or a passkey</DocsH2>
      <DocsP>
        You get a dedicated bridge wallet on each chain the first time you
        bridge from it. Send USDC to that wallet&apos;s address and Karwan
        handles the burn for you. The bridge page shows the address and the
        balance.
      </DocsP>

      <DocsH3>Why this rail and not a generic bridge</DocsH3>
      <DocsP>
        The USDC that leaves Base is the same USDC that arrives on Arc. Circle
        burns it on one side and mints it on the other. There is no wrapped
        token, no liquidity pool, no third-party custody between the two ends.
        That matters for a trust product: the asset you receive is the same
        asset that left.
      </DocsP>
    </article>
  );
}
