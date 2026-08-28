'use client';

import Link from 'next/link';
import { AnimatedNumber } from '@/shared/components/AnimatedNumber';
import { Accent, Band, HeroHeadline, Punc, SectionTag } from '@/shared/components/Bands';
import { DataMetric, RotatingDataPanel } from '@/shared/components/RotatingDataPanel';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export interface LiveNetworkStats {
  deals: number;
  direct: number;
  agent: number;
  settled: number;
  usdc: number;
}

export function LiveNetworkBand({ stats }: { stats: LiveNetworkStats | null }) {
  const t = useTranslations().appHome.liveNetwork;
  const loading = !stats;
  const slides = [
    {
      id: 'total',
      label: t.stats.totalDeals,
      content: (
        <DataMetric
          value={<AnimatedNumber value={stats?.deals ?? 0} decimals={0} />}
          hint={t.stats.directPlusAgent}
          loading={loading}
        />
      ),
    },
    {
      id: 'direct',
      label: t.stats.directDeals,
      content: <DataMetric value={<AnimatedNumber value={stats?.direct ?? 0} decimals={0} />} loading={loading} />,
    },
    {
      id: 'agent',
      label: t.stats.agentDeals,
      content: <DataMetric value={<AnimatedNumber value={stats?.agent ?? 0} decimals={0} />} loading={loading} />,
    },
    {
      id: 'settled',
      label: t.stats.settled,
      content: <DataMetric value={<AnimatedNumber value={stats?.settled ?? 0} decimals={0} />} loading={loading} />,
    },
    {
      id: 'volume',
      label: t.stats.usdcThrough,
      content: (
        <DataMetric
          value={<AnimatedNumber value={stats?.usdc ?? 0} decimals={2} />}
          unit="USDC"
          loading={loading}
        />
      ),
    },
    {
      id: 'network',
      label: t.stats.chain,
      content: <DataMetric value="Arc" hint={t.stats.arcTestnet} />,
    },
  ];

  return (
    <Band tone="dark">
      <div className="grid items-center gap-8 md:min-h-[360px] lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-14">
        <div className="max-w-[42ch]">
          <SectionTag tone="dark" dot="live">
            {t.sectionTag}
          </SectionTag>
          <HeroHeadline as="h2" className="text-[clamp(2rem,4.6vw,3.75rem)]">
            {t.headlineTop}
            <br />
            {t.headlineBottomPrefix}<Accent>{t.headlineBottomAccent}</Accent><Punc>.</Punc>
          </HeroHeadline>
          <Link
            href="/activity"
            className="group -mx-2 mt-7 inline-flex min-h-11 items-center gap-1.5 px-2 mono text-[12px] uppercase tracking-[0.08em] text-white/70 transition-colors hover:text-white"
          >
            {t.fullFeed}
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </Link>
        </div>

        <RotatingDataPanel label={t.sectionTag} slides={slides} />
      </div>
    </Band>
  );
}
