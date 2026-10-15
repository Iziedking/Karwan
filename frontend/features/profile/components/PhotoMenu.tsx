'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/// The avatar is the one photo control. With no photo yet it opens the picker
/// straight away; once there is one it opens a small menu to change or remove
/// it. Arrow keys move, Escape closes and focus goes back to the avatar.
export function PhotoMenu({
  hasPhoto,
  busy,
  label,
  changeLabel,
  removeLabel,
  onChange,
  onRemove,
  children,
}: {
  hasPhoto: boolean;
  busy: boolean;
  label: string;
  changeLabel: string;
  removeLabel: string;
  onChange: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const options = [
    { key: 'change', label: changeLabel, run: onChange },
    { key: 'remove', label: removeLabel, run: onRemove },
  ];

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const away = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <span ref={wrap} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        disabled={busy}
        aria-label={label}
        aria-haspopup={hasPhoto ? 'menu' : undefined}
        aria-expanded={hasPhoto ? open : undefined}
        onClick={() => (hasPhoto ? setOpen((was) => !was) : onChange())}
        className="group relative block size-14 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {children}
      </button>
      {open ? (
        <span
          role="menu"
          aria-label={label}
          className="absolute start-0 top-full z-30 mt-2 flex min-w-[200px] flex-col rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-1.5 text-[15px] font-medium tracking-normal shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          onKeyDown={(event) => {
            const at = items.current.findIndex((item) => item === document.activeElement);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const step = event.key === 'ArrowDown' ? 1 : -1;
              items.current[(at + step + options.length) % options.length]?.focus();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              close();
            } else if (event.key === 'Tab') {
              setOpen(false);
            }
          }}
        >
          {options.map((option, index) => (
            <button
              key={option.key}
              ref={(el) => {
                items.current[index] = el;
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                option.run();
              }}
              className="flex min-h-11 w-full items-center rounded-[10px] px-3 text-start text-[var(--ink)] hover:bg-[var(--tint)] focus-visible:bg-[var(--tint)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--action)]"
            >
              {option.label}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}
