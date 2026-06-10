'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/// Brand-styled confirmation modal. Replaces window.confirm() everywhere we
/// were using it for "are you sure?" gates, those rendered the OS / browser
/// dialog, which broke the Karwan visual contract and felt cheap.
///
/// Portals to <body> so a fixed-position modal can't be clipped by an
/// ancestor with overflow:hidden (per the UI overflow gotchas rule).
/// Backdrop click and Esc both cancel. Confirm and Cancel labels are
/// callable so each caller can tune the verbs to its specific action.
export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  /// Mark destructive when the action removes data (clears history, deletes).
  /// The confirm button picks up a warmer red-leaning fill instead of lime
  /// so a misclick doesn't feel like an obvious "go" cue.
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  /// Only mount the portal after we have a window. SSR fallback returns
  /// null so we never call createPortal on the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  /// Esc dismisses. Listen at the window level so focus position doesn't
  /// matter, a click on the backdrop blurs the cancel button before the
  /// keydown fires.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || !mounted) return null;

  const confirmBg = destructive ? '#b03d3a' : 'var(--lp-accent)';
  const confirmFg = destructive ? 'white' : 'var(--lp-dark)';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 motion-safe:animate-[fadeUp_0.18s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      {/* Backdrop. Click anywhere off the panel cancels. */}
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 cursor-default"
        style={{
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px) saturate(140%)',
          WebkitBackdropFilter: 'blur(6px) saturate(140%)',
        }}
      />
      {/* Panel. Dark Karwan surface, asymmetric corners, lime accent rule
          at the top mirroring the email shell. */}
      <div
        className="relative w-full max-w-[420px]"
        style={{
          background: 'var(--lp-band-dark)',
          border: '1px solid var(--rule-dark)',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 4,
          boxShadow: '0 24px 64px -20px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{ height: 3, background: 'var(--lp-accent)' }}
        />
        <div className="px-6 pt-5 pb-6">
          <p
            id="confirm-title"
            className="font-sans text-[18px] font-extrabold uppercase tracking-tight"
            style={{ color: 'var(--ink-1)' }}
          >
            {title}
          </p>
          <p
            className="mt-3 text-[14px] leading-relaxed"
            style={{ color: 'var(--ink-2)' }}
          >
            {body}
          </p>
          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="mono text-[11px] font-bold uppercase tracking-[0.1em] px-4 py-2.5 transition-colors hover:bg-[rgba(255,255,255,0.06)]"
              style={{
                color: 'var(--ink-2)',
                background: 'transparent',
                border: '1px solid var(--rule-dark)',
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              autoFocus
              className="mono text-[11px] font-bold uppercase tracking-[0.1em] px-4 py-2.5 transition-opacity hover:opacity-90"
              style={{
                color: confirmFg,
                background: confirmBg,
                border: '1px solid transparent',
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 3,
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
