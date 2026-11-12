'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { jumpTo } from '@/features/admin/adminNavigation';
import { deskMe, useDesk } from './deskContext';

/// ⌘K: go to any of the teammate's pages, or a part of one, by its words.
export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useDesk();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = jumpTo(deskMe(me), query);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setAt(0);
    input.current?.focus();
  }, [open]);

  if (!open) return null;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[at]) go(results[at].href);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Go to a page"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-[var(--d-line)] bg-[var(--d-surface)] shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-[var(--d-line)] px-3.5">
          <Search aria-hidden="true" strokeWidth={1.5} className="size-4 text-[var(--d-text-3)]" />
          <input
            ref={input}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setAt(0); }}
            onKeyDown={onKey}
            placeholder="Go to a page"
            aria-label="Go to a page"
            className="h-12 flex-1 bg-transparent text-[14px] text-[var(--d-text)] outline-none placeholder:text-[var(--d-text-3)]"
          />
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-[var(--d-text-3)]">No page by that name on your desk.</li>}
          {results.map((r, i) => (
            <li key={r.href}>
              <button
                type="button"
                onMouseEnter={() => setAt(i)}
                onClick={() => go(r.href)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] ${i === at ? 'bg-[var(--d-hover)] text-[var(--d-text)]' : 'text-[var(--d-text-2)]'}`}
              >
                <span className="font-medium">{r.label}</span>
                <span className="text-[12px] text-[var(--d-text-3)]">{r.group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
