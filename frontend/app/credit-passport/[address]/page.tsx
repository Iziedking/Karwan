import type { Metadata } from 'next';
import { CreditPassport } from '@/features/reputation/components/CreditPassport';

/// Public, shareable trade record for a wallet. No sign-in. OG tags so a passport
/// link previews well when a financier or counterparty shares it.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const title = `Credit passport · ${short} · Karwan`;
  const description = `On-chain trade record for ${short}: reputation tier, settled deals, dispute rate, and active stake. Verified on Arc.`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'profile' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function CreditPassportPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return <CreditPassport address={address} />;
}
