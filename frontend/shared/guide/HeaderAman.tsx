'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { guideCopy } from '@/shared/i18n/messages/guide';
import { openAssistant } from '@/shared/assistant/openAssistant';
import { useGuideSetting } from '@/features/guide/useGuideSetting';
import { isAssistantRoute } from '@/shared/utils/routes';
import { AmanFace } from './AmanFace';

/// With the guide hidden from pages, Aman waits in the top bar as a small face
/// that never speaks first; a tap opens the assistant page (view 57).
export function HeaderAman() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const { locale } = useLocale();
  const { guide } = useGuideSetting();
  if (guide !== 'face' || isAssistantRoute(pathname)) return null;
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
