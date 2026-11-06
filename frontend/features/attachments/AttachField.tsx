'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/shared/components/Icon';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { attachCopy } from '@/shared/i18n/messages/attachCopy';
import { fits, MAX_ATTACHMENTS, readAttachment, type AttachProblem, type PickedAttachment } from './attachments';

/// The one attach button on a request and a direct deal (view 56): photos are
/// resized on the device, PDFs go as they are, within the server's limits.
export function AttachField({ value, onChange, on, disabled }: {
  value: PickedAttachment[];
  onChange: (next: PickedAttachment[]) => void;
  on: 'request' | 'deal';
  disabled?: boolean;
}) {
  const { locale } = useLocale();
  const t = attachCopy[locale];
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<AttachProblem | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setProblem(null);
    setBusy(true);
    let next = value;
    for (const file of Array.from(files)) {
      let read: PickedAttachment | AttachProblem;
      try {
        read = await readAttachment(file);
      } catch {
        read = 'notAllowed';
      }
      if (typeof read === 'string') {
        setProblem(read);
        continue;
      }
      const blocked = fits(next, read.size, read.kind);
      if (blocked) {
        setProblem(blocked);
        continue;
      }
      next = [...next, read];
    }
    setBusy(false);
    if (next !== value) onChange(next);
  }

  return (
    <div data-attach>
      <p className="text-[14px] font-semibold text-[var(--ink)]">{t.label}</p>
      <p className="mt-0.5 text-[13px] font-medium text-[var(--ink-secondary)]">{on === 'request' ? t.hintRequest : t.hintDeal}</p>
      <ul className="mt-3 flex flex-wrap gap-3">
        {value.map((item, i) => (
          <li key={`${i}-${item.name}`} className="relative">
            {item.kind === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.dataUrl} alt={item.name} className="size-20 rounded-[14px] border border-[var(--line)] object-cover" />
            ) : (
              <span className="flex size-20 flex-col items-center justify-center gap-1 rounded-[14px] border border-[var(--line)] bg-[var(--raised)] px-1 text-center text-[13px] font-semibold text-[var(--ink)]">
                <Icon name="file-text" size={20} />
                <span className="w-full truncate">{item.name}</span>
              </span>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label={t.removeTemplate.replace('{name}', item.name)}
              className="absolute -end-2 -top-2 grid size-7 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-sm before:absolute before:-inset-2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            >
              <Icon name="close" size={16} />
            </button>
          </li>
        ))}
        {value.length < MAX_ATTACHMENTS ? (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy || disabled}
              className="flex size-20 flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-[var(--line-strong)] bg-[var(--raised)] text-[13px] font-semibold text-[var(--ink)] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
            >
              <Icon name="paperclip" size={20} />
              <span className="px-1 text-center leading-tight">{t.add}</span>
            </button>
          </li>
        ) : null}
      </ul>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = '';
        }}
      />
      {problem ? <p role="alert" className="mt-2 text-[13px] font-medium text-[var(--color-critical)]">{t[problem]}</p> : null}
    </div>
  );
}
