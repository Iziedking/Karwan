'use client';
import { SettingsBand } from '@/features/settings/components/SettingsBand';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
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
          {/* Language picker works without sign-in (cookie-backed). Authed
              users see the same band; their saves persist to the backend. */}
          <SettingsBand />
        </div>
      </Band>
    </FullBleed>
  );
}
