import { api } from '@/core/api';
import { ActivityView } from '@/features/activity/components/ActivityView';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
  PageCard,
} from '@/shared/components/Bands';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const status = await api.status().catch(() => null);
  const explorer = status?.chain.explorer ?? 'https://testnet.arcscan.app';

  return (
    <FullBleed>
      {/* HERO */}
      <Band tone="dark" overlay={<GridOverlay />}>
        <div className="max-w-[58ch]">
          <div className="fade-up">
            <SectionTag tone="dark" dot="live">
              STREAM
            </SectionTag>
          </div>
          <div className="fade-up fade-up-1">
            <HeroHeadline>
              Every event<Punc>.</Punc>
              <br />
              <Accent>On chain.</Accent>
            </HeroHeadline>
          </div>
          <p className="fade-up fade-up-2 mt-6 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[44ch]">
            Live from Arc Testnet. Each row deep-links to the explorer.
          </p>
        </div>
      </Band>

      {/* STREAM SECTION */}
      <Band tone="light" compact>
        <SectionTag>EVENT STREAM</SectionTag>
        <HeroHeadline size="md">
          Audit the <Accent>chain</Accent>
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-pretty text-[15px] leading-relaxed text-[var(--lp-text-sub)] max-w-[44ch]">
          Full network event log.
        </p>
        <div className="mt-10 fade-up fade-up-1">
          <PageCard>
            <div className="p-6 md:p-8">
              <ActivityView explorer={explorer} />
            </div>
          </PageCard>
        </div>
      </Band>
    </FullBleed>
  );
}
