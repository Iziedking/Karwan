'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { cn } from '@/shared/utils/cn';

export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { workspaces, activeWorkspace, isLoading, switchWorkspace } = useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (isLoading || !activeWorkspace) return null;

  return (
    <div ref={rootRef} className="relative z-40">
      <button
        type="button"
        aria-label={`Current workspace: ${activeWorkspace.name}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--color-line-strong)] px-3 text-[12px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
          compact && 'max-w-[150px] px-2.5 sm:max-w-[220px]',
        )}
      >
        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--lp-accent)] text-[10px] font-black text-[#10170b]">
          {activeWorkspace.kind === 'business' ? 'B' : 'P'}
        </span>
        <span className={cn('min-w-0 truncate', compact && 'hidden sm:block')}>
          {activeWorkspace.name}
        </span>
        <span aria-hidden className="text-[14px] text-[var(--color-ink-dim)]">⌄</span>
      </button>

      {open ? (
        <div className="absolute end-0 top-[calc(100%+8px)] w-[min(290px,calc(100vw-32px))] overflow-hidden rounded-[18px] border border-[var(--color-line-strong)] bg-[var(--color-surface)] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
          <div className="px-3 pb-2 pt-2">
            <p className="mono text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-dim)]">Workspace</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--color-ink-dim)]">Same identity, wallet, and USDC balance.</p>
          </div>
          <div className="space-y-1">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                onClick={() => { switchWorkspace(workspace.id); setOpen(false); }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-start transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]',
                  workspace.id === activeWorkspace.id && 'bg-[var(--color-surface-2)]',
                )}
              >
                <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--color-line-strong)] text-[10px] font-bold text-[var(--lp-accent)]">
                  {workspace.kind === 'business' ? 'B' : 'P'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[var(--color-ink)]">{workspace.name}</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--color-ink-dim)]">{workspace.kind === 'business' ? 'Business workspace' : 'Personal workspace'}</span>
                </span>
                {workspace.id === activeWorkspace.id ? <span aria-hidden className="text-[var(--lp-accent)]">✓</span> : null}
              </button>
            ))}
          </div>
          {!workspaces.some((workspace) => workspace.kind === 'business') ? (
            <Link href="/profile/business/setup" onClick={() => setOpen(false)} className="mt-2 flex min-h-11 items-center justify-between rounded-[12px] border border-dashed border-[var(--color-line-strong)] px-3 text-[12px] font-semibold text-[var(--color-ink)] hover:border-[var(--lp-accent)]">
              Add a business workspace <span aria-hidden>＋</span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
