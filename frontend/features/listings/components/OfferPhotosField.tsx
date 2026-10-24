'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { offerPhotosCopy } from '@/shared/i18n/messages/offerPhotos';
import { MAX_OFFER_PHOTOS, photoSrc, resizePhoto, room } from '../photos';

/// Up to four photos on an offer, resized on the device before they are sent.
export function OfferPhotosField({ value, onChange, title }: { value: string[]; onChange: (next: string[]) => void; title: string }) {
  const { locale } = useLocale();
  const t = offerPhotosCopy[locale];
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const picked = Array.from(files);
    const fits = room(value.length, picked.length);
    if (fits < picked.length) setError(t.max);
    setBusy(true);
    const added: string[] = [];
    for (const file of picked.slice(0, fits)) {
      try {
        added.push(await resizePhoto(file));
      } catch {
        setError(t.unreadable);
      }
    }
    setBusy(false);
    if (added.length) onChange([...value, ...added]);
  }

  return (
    <div>
      <p className="text-[14px] font-semibold text-[var(--lp-dark)]">{t.label}</p>
      <p className="mt-0.5 text-[13px] font-medium text-[var(--lp-text-sub)]">{t.hint}</p>
      <ul className="mt-3 flex flex-wrap gap-3">
        {value.map((src, i) => (
          <li key={`${i}-${src.slice(-16)}`} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoSrc(src)} alt={t.altTemplate.replace('{n}', String(i + 1)).replace('{title}', title || t.label)} className="size-20 rounded-[14px] border border-[var(--lp-border-light)] object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label={t.removeTemplate.replace('{n}', String(i + 1))}
              className="absolute -end-2 -top-2 grid size-7 place-items-center rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)] shadow-sm before:absolute before:-inset-2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
        {value.length < MAX_OFFER_PHOTOS ? (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="flex size-20 flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-[var(--lp-outline-strong)] bg-[var(--tint)] text-[13px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <Icon name="image-plus" size={20} />
              <span className="px-1 text-center leading-tight">{t.add}</span>
            </button>
          </li>
        ) : null}
      </ul>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = '';
        }}
      />
      {error ? <p role="alert" className="mt-2 text-[13px] font-medium text-[var(--color-critical)]">{error}</p> : null}
    </div>
  );
}
