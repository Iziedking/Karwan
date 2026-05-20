import {
  DocsEyebrow,
  DocsH2,
  DocsP,
  DocsList,
  DocsListItem,
  DocsFigure,
  DocsCallout,
} from '@/features/docs/components/Prose';

export const metadata = {
  title: 'Bridge · Karwan Docs',
  description: 'Bringing USDC to Arc from other chains with CCTP.',
};

export default function DocsBridgePage() {
  return (
    <article>
      <DocsEyebrow>BRIDGE</DocsEyebrow>
      <h1 className="mt-4 font-sans text-[clamp(2rem,4vw,3.25rem)] font-extrabold uppercase tracking-[-0.025em] leading-[0.95] text-[var(--lp-dark)]">
        Bring your USDC to Arc
        <span style={{ color: 'var(--lp-accent)' }}>.</span>
      </h1>
      <DocsP>
        Deals settle in USDC on Arc. If your USDC is on Base or Ethereum, the
        bridge moves it over using Circle's Cross-Chain Transfer Protocol. Your
        USDC is burned on the source chain and minted fresh on Arc. No wrapped
        tokens, no third-party custody.
      </DocsP>

      <DocsH2>How it works</DocsH2>
      <DocsList>
        <DocsListItem>
          <strong>Pick a source chain.</strong> Base Sepolia or Ethereum Sepolia
          on testnet.
        </DocsListItem>
        <DocsListItem>
          <strong>Approve and burn.</strong> Your USDC is burned on the source
          chain. Web3 users sign this from their own wallet; email users have it
          handled by their Circle wallet.
        </DocsListItem>
        <DocsListItem>
          <strong>Wait for attestation.</strong> Circle confirms the burn. On
          testnet this takes about 10 to 19 minutes.
        </DocsListItem>
        <DocsListItem>
          <strong>Mint on Arc.</strong> The backend relays the mint so you do
          not need Arc gas to receive your funds.
        </DocsListItem>
      </DocsList>

      <DocsFigure
        src="/docs/images/bridge-steps.png"
        alt="Bridge card showing the approve, burn, attestation, and mint steps"
        caption="The four steps of a bridge, tracked live"
      />

      <DocsCallout tone="warn" title="ATTESTATION TAKES TIME ON TESTNET">
        Standard transfers wait for source-chain finality, which runs 10 to 19
        minutes on Sepolia testnets. If a bridge shows as still attesting, give
        it time before retrying. The Recheck button re-queries Circle.
      </DocsCallout>

      <DocsH2>If you sign in with email</DocsH2>
      <DocsP>
        Email and passkey users get a dedicated bridge wallet on each source
        chain, provisioned the first time you bridge from that chain. Send USDC
        to that wallet's address, and the platform handles the burn for you.
        The bridge page shows the address and its current balance.
      </DocsP>
    </article>
  );
}
