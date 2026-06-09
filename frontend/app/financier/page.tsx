import type { Metadata } from 'next';
import { FinancierDashboard } from '@/features/financier/components/FinancierDashboard';

/// Financier dashboard. Public-ish surface: anyone can land here and
/// browse the open factoring + PO financing opportunities. Posting an
/// offer requires sign-in (the auth gate kicks in at the offer modal).
///
/// SEO + share-card metadata so a financier sharing the URL with their
/// team previews well in X / Slack / Telegram.
export const metadata: Metadata = {
  title: 'Financier · Karwan',
  description:
    'Browse open invoice factoring and PO financing opportunities on Karwan. On-chain trade record, USDC settlement, Arc Testnet.',
  openGraph: {
    title: 'Financier · Karwan',
    description:
      'Browse open invoice factoring and PO financing opportunities on Karwan.',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'Financier · Karwan' },
};

export default function FinancierPage() {
  return <FinancierDashboard />;
}
