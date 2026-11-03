'use client';

import { useState } from 'react';
import { cn } from '@/shared/utils/cn';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { offerPhotosCopy } from '@/shared/i18n/messages/offerPhotos';
import { photoSrc } from '../photos';

/// The offer's photos on its page (view 48). On a phone they swipe sideways,
/// the next one peeking in; on a wide screen one is large and the rest are
/// small buttons that swap it in.
export function OfferGallery({ urls, title }: { urls: string[]; title: string }) {
  const { locale } = useLocale();
  const t = offerPhotosCopy[locale];
  const [shown, setShown] = useState(0);
  if (!urls.length) return null;
  const alt = (i: number) => t.altTemplate.replace('{n}', String(i + 1)).replace('{title}', title);
  return (
    <div className="mt-2">
      <ul
        data-photo-strip
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:hidden [&::-webkit-scrollbar]:hidden"
      >
        {urls.map((url, i) => (
          <li key={url} className={cn('shrink-0 snap-start', urls.length > 1 ? 'w-[85%]' : 'w-full')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc(url)} alt={alt(i)} loading={i ? 'lazy' : undefined} className="aspect-[4/3] w-full rounded-[var(--radius-card)] bg-[var(--raised)] object-cover" />
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoSrc(urls[shown] ?? urls[0]!)}
          alt={alt(shown)}
          className="aspect-[16/9] w-full rounded-[var(--radius-card)] bg-[var(--raised)] object-cover"
        />
        {urls.length > 1 ? (
          <ul className="mt-3 flex gap-2">
            {urls.map((url, i) => (
              <li key={url}>
                <button
                  type="button"
                  onClick={() => setShown(i)}
                  aria-label={t.openTemplate.replace('{n}', String(i + 1))}
                  aria-pressed={i === shown}
                  className={cn(
                    'block h-14 w-[72px] overflow-hidden rounded-[10px] border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]',
                    i === shown ? 'border-[var(--ink)]' : 'border-transparent opacity-80 hover:opacity-100',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoSrc(url)} alt="" className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
