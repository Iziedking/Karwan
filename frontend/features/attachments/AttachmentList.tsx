'use client';

import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { attachCopy } from '@/shared/i18n/messages/attachCopy';
import { attachmentHref } from './attachments';

/// The photos and PDFs on a request or a deal (view 56): photos as thumbnails,
/// PDFs as links, each opening on its own.
export function AttachmentList({ on, jobId, items, className }: {
  on: 'request' | 'deal';
  jobId: string;
  items: ReadonlyArray<{ name: string; contentType: string }> | undefined;
  className?: string;
}) {
  const { locale } = useLocale();
  const t = attachCopy[locale];
  if (!items?.length) return null;
  let photo = 0;
  return (
    <section data-attachments className={className} aria-label={t.shown}>
      <ul className="flex flex-wrap gap-3">
        {items.map((item, n) => {
          const href = attachmentHref(on, jobId, n);
          const isPhoto = item.contentType.startsWith('image/');
          if (isPhoto) photo += 1;
          return (
            <li key={n}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
              >
                {isPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={href} alt={t.photoAltTemplate.replace('{n}', String(photo))} loading="lazy" className="size-20 rounded-[14px] border border-[var(--line)] object-cover" />
                ) : (
                  <span className="flex min-h-11 max-w-[240px] items-center gap-2 rounded-[14px] border border-[var(--line)] px-3 py-2 text-[14px] font-medium text-[var(--ink)] underline-offset-4 hover:underline">
                    <Icon name="file-text" size={16} />
                    <span className="truncate">{item.name}</span>
                  </span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
