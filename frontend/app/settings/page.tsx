'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsBand } from '@/features/settings/components/SettingsBand';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useAuth } from '@/shared/hooks/useAuth';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
} from '@/shared/components/Bands';

export default function SettingsPage() {
  const t = useTranslations();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Logged-out visitors don't see the settings surface at all. Anything that
  // exposes what settings are about (copy, headings, even the eyebrow) leaks
  // the product. Just route them home.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />} compact>
          <div className="h-14 w-3/4 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
          <div className="mt-4 h-4 w-1/2 rounded-md bg-white/[0.04] animate-pulse motion-reduce:animate-none" />
        </Band>
      </FullBleed>
    );
  }

  return (
    <FullBleed>
      <Band tone="dark" overlay={<GridOverlay />} compact>
        <SectionTag>{t.settings.eyebrow}</SectionTag>
        <HeroHeadline>
          {t.settings.title}
          <Punc>.</Punc>
        </HeroHeadline>
        <p className="mt-5 text-[15px] leading-relaxed text-white/65 max-w-[52ch]">
          {t.settings.description}
        </p>
      </Band>

      <Band tone="light" compact>
        <div className="max-w-[640px] mx-auto">
          <SettingsBand />
        </div>
      </Band>
    </FullBleed>
  );
}
