import type { Metadata } from 'next';
import { FinancierGate } from '@/features/financier/components/FinancierGate';
import { SmeTradesComingSoon } from '@/features/financier/components/SmeTradesComingSoon';

// Read the launch flag straight from the public env here rather than from
// features/profile/config, which pulls in the wagmi client setup and cannot
// be imported into this server component. Same value, no client dependency.
const SME_TRADES_ENABLED = process.env.NEXT_PUBLIC_SME_TRADES_ENABLED === '1';

/// Financier desk. Before the SME rail launches this serves the SME Trades
/// holding page; once NEXT_PUBLIC_SME_TRADES_ENABLED is set it renders the
/// live desk where financiers browse open factoring and PO financing
/// opportunities. Posting an offer requires sign-in.
export const metadata: Metadata = {
  title: 'SME Trades · Karwan',
  description:
    'Invoice factoring and purchase-order financing on Arc, with a portable on-chain credit passport for every counterparty.',
  openGraph: {
    title: 'SME Trades · Karwan',
    description:
      'Invoice factoring and purchase-order financing on Arc, with a portable on-chain credit passport for every counterparty.',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'SME Trades · Karwan' },
};

export default function FinancierPage() {
  return SME_TRADES_ENABLED ? <FinancierGate /> : <SmeTradesComingSoon />;
}
