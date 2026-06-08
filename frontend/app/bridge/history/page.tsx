'use client';
import Link from 'next/link';
import { BridgeHistoryPanel } from '@/features/bridge/components/BridgeHistorySection';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
  Accent,
} from '@/shared/components/Bands';

/// Standalone Bridge History route. The history panel used to live inline on
/// /bridge and ate vertical space whether the user wanted it or not. Pulled
/// onto its own route so /bridge stays focused on the active flow and users
/// reach history intentionally via the "Bridge history" link — at which
/// point a "dismiss all" affordance becomes unnecessary (just leave the
/// page if you don't want to look at it).
export default function BridgeHistoryPage() {
  const t = useTranslations().bridge;
  return (
    <AuthGuard gateTag={t.signInGate.tag} gateBody={t.signInGate.body}>
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <SectionTag tone="dark">[:BRIDGE HISTORY:]</SectionTag>
          <HeroHeadline>
            EVERY <Accent>BRIDGE</Accent><Punc>.</Punc>
          </HeroHeadline>
          <p className="mt-5 text-[15px] leading-relaxed text-[var(--lp-text-muted)] max-w-[50ch]">
            Both directions, all statuses. Filter by chip; click a row to
            inspect the on-chain trail.
          </p>
          <Link
            href="/bridge"
            className="mt-6 inline-flex items-center gap-2 mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)] hover:text-[var(--lp-accent)] transition-colors"
          >
            <span aria-hidden>←</span> Back to bridge
          </Link>
        </Band>
        <Band tone="light" compact>
          <div className="max-w-xl">
            <BridgeHistoryPanel />
          </div>
        </Band>
      </FullBleed>
    </AuthGuard>
  );
}
