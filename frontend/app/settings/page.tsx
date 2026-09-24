'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsBand } from '@/features/settings/components/SettingsBand';
import { PageTour } from '@/shared/guide/PageTour';
import { SETTINGS_TOUR_ID, SETTINGS_STEPS } from '@/shared/guide/tours';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { useAuth } from '@/shared/hooks/useAuth';

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
      <div className="mx-auto w-full max-w-[1240px] px-[clamp(20px,3.6vw,52px)] py-10" aria-busy="true">
        <div className="h-10 w-56 rounded-md bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
        <div className="mt-5 h-4 w-80 max-w-full rounded-md bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] px-[clamp(20px,3.6vw,52px)] pb-16 pt-8 sm:pt-10">
      <PageTour id={SETTINGS_TOUR_ID} steps={SETTINGS_STEPS} />
      <header className="max-w-[720px]">
        <p className="text-[13px] font-medium text-[var(--lp-text-sub)]">{t.settings.eyebrow}</p>
        <h1 className="mt-3 text-[clamp(2rem,3vw,2.5rem)] font-semibold leading-tight tracking-[-0.035em] text-[var(--lp-dark)]">
          {t.settings.title}
        </h1>
        <p className="mt-3 max-w-[52ch] text-[16px] leading-relaxed text-[var(--lp-text-sub)]">
          {t.settings.description}
        </p>
      </header>
      <div className="mt-8 max-w-[720px]">
        <SettingsBand />
      </div>
    </div>
  );
}
