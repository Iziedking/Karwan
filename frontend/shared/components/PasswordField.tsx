'use client';
import { useState, type InputHTMLAttributes } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Icon } from '@/shared/components/Icon';

/// A password box with an eye that shows what is typed, and hides it again
/// (owner, 9 Nov 2026). The eye names itself Show or Hide for screen readers.
export function PasswordField({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const t = useTranslations().recovery.step;
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={visible ? 'text' : 'password'} className={`${className} pe-14`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t.hide : t.show}
        aria-pressed={visible}
        className="absolute inset-y-0 end-1 my-auto grid size-11 place-items-center rounded-[10px] text-[var(--ink-secondary)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]"
      >
        <Icon name={visible ? 'eye-off' : 'eye'} size={20} />
      </button>
    </span>
  );
}
