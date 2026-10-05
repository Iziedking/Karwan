import type { Metadata } from 'next';
import { PassportGate } from '@/features/reputation/components/PassportGate';

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
  const description = `Trade record on Karwan for ${short}: tier and plain reasons.`;
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
  return <PassportGate address={address} />;
}
