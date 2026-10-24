import { notFound } from 'next/navigation';
import { DEV_PAGES, type DevPageSlug } from '@/features/developers/sections';
import { RecordSourcePage } from '@/features/developers/components/RecordSourcePages';
import { PaidDataArticle } from '@/features/developers/components/PaidDataArticle';

export function generateStaticParams() {
  return DEV_PAGES.filter(Boolean).map((slug) => ({ slug }));
}

export default async function DeveloperDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug || !DEV_PAGES.includes(slug as DevPageSlug)) notFound();
  if (slug === 'paid-data') return <PaidDataArticle />;
  return <RecordSourcePage slug={slug as Exclude<DevPageSlug, '' | 'paid-data'>} />;
}
