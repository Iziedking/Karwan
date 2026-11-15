'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { guideCopy } from '@/shared/i18n/messages/guide';
import { openAssistant } from '@/shared/assistant/openAssistant';
import { useGuideSetting } from '@/features/guide/useGuideSetting';
import { isAssistantRoute } from '@/shared/utils/routes';
import { AmanFace } from './AmanFace';

/// Aman waits in the top bar as a small face that never speaks first; a tap
/// opens the assistant page (view 57). It is the way in whenever Aman is out of
/// sight on the page, and the only face when the guide is set to the top bar.
export function HeaderAman() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { locale } = useLocale();
  const { guide } = useGuideSetting();
  if (guide === 'off' || isAssistantRoute(pathname)) return null;
  return (
    <button
      type="button"
      aria-label={guideCopy[locale].open}
      data-aman-header
      onClick={() => openAssistant(pathname, (href) => router.push(href))}
      className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
    >
      <AmanFace size={28} mood="idle" label={null} />
    </button>
  );
}
