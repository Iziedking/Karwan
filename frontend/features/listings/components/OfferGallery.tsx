'use client';

import { useState } from 'react';
import { cn } from '@/shared/utils/cn';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { offerPhotosCopy } from '@/shared/i18n/messages/offerPhotos';
import { photoSrc } from '../photos';

/// The offer's photos on its page: one large, the rest as small buttons that
/// swap it in.
export function OfferGallery({ urls, title }: { urls: string[]; title: string }) {
  const { locale } = useLocale();
  const t = offerPhotosCopy[locale];
  const [shown, setShown] = useState(0);
  if (!urls.length) return null;
  const alt = (i: number) => t.altTemplate.replace('{n}', String(i + 1)).replace('{title}', title);
  return (
    <div className="mt-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoSrc(urls[shown] ?? urls[0]!)}
        alt={alt(shown)}
        className="aspect-[4/3] w-full rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--tint)] object-cover"
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
                  'block size-14 overflow-hidden rounded-[12px] border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                  i === shown ? 'border-[var(--lp-accent)]' : 'border-transparent opacity-80 hover:opacity-100',
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
  );
}
