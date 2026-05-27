'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: ReactNode;
  /// When present, a textarea renders inside the dialog and its value flows
  /// back through the confirm callback. Reason flows are propose-cancellation
  /// and similar moments where the action carries a free-form note.
  reasonPrompt?: { label: string; placeholder?: string; required?: boolean };
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}

/// Portal-based confirmation overlay. Replaces window.confirm/prompt across
/// the product so the page stays inside its own visual language. Backdrop
/// click and Escape both cancel; the confirm button takes initial focus.
export function ConfirmDialog({
  open,
  title,
  body,
  reasonPrompt,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setReason('');
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);

  if (!mounted || !open) return null;

  const reasonInvalid =
    reasonPrompt?.required && (!reason || reason.trim().length === 0);

  const confirmBg =
    tone === 'danger'
      ? '#b25425'
      : 'var(--lp-accent)';
  const confirmText =
    tone === 'danger' ? '#fff' : 'var(--lp-band-dark)';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6"
    >
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />
      <div
        className="relative w-full max-w-[480px] mx-auto px-6 py-6"
        style={{
          background: 'var(--lp-card)',
          color: 'var(--lp-dark)',
          border: '1px solid var(--lp-border-light)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 5,
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.45)',
        }}
      >
        <span
          className="inline-block mono text-[10px] font-bold uppercase tracking-[0.16em] px-1.5 py-0.5 mb-3"
          style={{
            background: 'var(--lp-band-dark)',
            color: 'var(--lp-accent)',
            borderRadius: 3,
          }}
        >
          [:CONFIRM:]
        </span>
        <h2 className="font-sans text-[22px] font-extrabold tracking-[-0.01em] leading-tight">
          {title}
        </h2>
        <div className="mt-3 text-[14px] leading-relaxed text-[var(--lp-text-sub)]">
          {body}
        </div>

        {reasonPrompt && (
          <div className="mt-5">
            <label className="block mono text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--lp-text-muted)] mb-2">
              {reasonPrompt.label}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPrompt.placeholder}
              rows={3}
              autoFocus
              className="form-input w-full resize-none"
              style={{ minHeight: 86 }}
            />
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-sub)] hover:text-[var(--lp-dark)] hover:bg-black/[0.04] transition-colors"
            style={{
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              borderBottomLeftRadius: 10,
              borderBottomRightRadius: 2,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={reasonInvalid}
            onClick={() => onConfirm(reasonPrompt ? reason.trim() : undefined)}
            className="inline-flex items-center gap-2 px-5 py-2.5 mono text-[12px] font-bold uppercase tracking-[0.1em] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 active:translate-y-0 shadow-[0_3px_0_rgba(0,0,0,0.22)] hover:shadow-[0_4px_0_rgba(0,0,0,0.22)] active:shadow-[0_1px_0_rgba(0,0,0,0.22)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            style={{
              background: confirmBg,
              color: confirmText,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 3,
            }}
          >
            {confirmLabel}
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
