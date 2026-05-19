'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsBand } from '@/features/settings/components/SettingsBand';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useAuth } from '@/shared/hooks/useAuth';
import { SignInGate } from '@/shared/components/SignInGate';
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
  const wasUnauthedRef = useRef(false);

  // If the user signs in from this page's gate, route them home rather than
  // keep them parked on settings. Tracks "was unauthenticated then became
  // authenticated" via a ref so a normal page load while signed in does NOT
  // trigger the redirect.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      wasUnauthedRef.current = true;
      return;
    }
    if (wasUnauthedRef.current) {
      router.replace('/app');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />} compact>
          <div className="h-14 w-3/4 rounded-md bg-white/[0.06] animate-pulse motion-reduce:animate-none" />
          <div className="mt-4 h-4 w-1/2 rounded-md bg-white/[0.04] animate-pulse motion-reduce:animate-none" />
        </Band>
      </FullBleed>
    );
  }

  if (!isAuthenticated) {
    return (
      <SignInGate
        tag="SETTINGS"
        title={
          <>
            Sign in to manage your settings<Punc>.</Punc>
          </>
        }
        body="Language, notifications, and preferences are tied to your wallet. Sign in once and your choices follow you across every surface."
      />
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
