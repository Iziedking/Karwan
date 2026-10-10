import type { Metadata } from 'next';
import { RecordView } from '@/features/verification/RecordView';

/// Public, shareable record for a Karwan tag. No sign-in.
export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const title = `@${tag} · Karwan record`;
  const description = `Verified record on Karwan for @${tag}: level, tier and the proof on Arc.`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'profile' },
    twitter: { card: 'summary', title, description },
  };
}

export default async function RecordPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  return <RecordView tag={decodeURIComponent(tag).replace(/^@/, '')} />;
}
