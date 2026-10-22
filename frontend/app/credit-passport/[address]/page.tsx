import type { Metadata } from 'next';
import { PassportGate } from '@/features/reputation/components/PassportGate';

/// Public, shareable trade record for a wallet. No sign-in. OG tags so a passport
/// link previews well when a financier or counterparty shares it.
async function publicName(address: string): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL?.trim().replace(/\/$/, '');
  if (!base || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  try {
    const res = await fetch(`${base}/api/profile?address=${address}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const { profile } = (await res.json()) as { profile?: { displayName?: string; handle?: string } | null };
    const name = profile?.displayName?.trim();
    const tag = profile?.handle ? `@${profile.handle}` : null;
    return name && tag ? `${name} (${tag})` : name || tag;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  // A shared link names the person, not their wallet. The address is the fallback.
  const who = (await publicName(address)) ?? short;
  const title = `Credit passport · ${who} · Karwan`;
  const description = `Trade record on Karwan for ${who}: tier and plain reasons.`;
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
