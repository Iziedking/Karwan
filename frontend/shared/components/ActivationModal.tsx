'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { shortAddress } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { Button } from '@/shared/components/Button';
import { FormError } from '@/shared/components/FormError';
import { spring } from '@/shared/motion/tokens';
import type { AgentNames } from '@/core/api';

interface ActivationModalProps {
  open: boolean;
  onClose: () => void;
  activate: (names?: AgentNames) => Promise<unknown>;
  renameAgents: (names: AgentNames) => Promise<unknown>;
  activating: boolean;
  error: string | null;
  activated: boolean;
  agents: { buyer: string; seller: string; buyerName?: string; sellerName?: string } | null;
}

/**
 * Agent provisioning opens as a right drawer on desktop and a bottom sheet on
 * mobile. The current workspace remains visible behind the decision.
 */
export function ActivationModal({
  open,
  onClose,
  activate,
  renameAgents,
  activating,
  error,
  activated,
  agents,
}: ActivationModalProps) {
  const t = useTranslations().activation.modal;
  const [buyerName, setBuyerName] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    setMounted(true);
    const query = window.matchMedia('(min-width: 640px)');
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    setBuyerName(agents?.buyerName ?? '');
    setSellerName(agents?.sellerName ?? '');
    setSaved(false);
  }, [open, agents?.buyerName, agents?.sellerName]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !activating) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open, activating, onClose]);

  const names = (): AgentNames => ({
    buyerName: buyerName.trim() || undefined,
    sellerName: sellerName.trim() || undefined,
  });

  async function onSaveNames() {
    try {
      await renameAgents(names());
      setSaved(true);
    } catch {
      // The hook owns the translated failure state rendered below.
    }
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end bg-black/60 sm:items-stretch sm:justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !activating) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="activation-title"
            className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[var(--shadow-pop)] sm:h-full sm:max-h-none sm:w-[480px] sm:rounded-none sm:rounded-s-[16px]"
            initial={sheetHiddenState(reduce, desktop)}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={sheetHiddenState(reduce, desktop)}
            transition={reduce ? { duration: 0 } : spring.drawer}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="border-b border-[var(--color-line)] px-6 pb-5 pt-6">
              <p className="mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
                • [:AGENT SETUP]
              </p>
              <h2
                id="activation-title"
                className="mt-3 font-sans text-[28px] font-bold leading-[1.02] tracking-[-0.03em]"
              >
                {activated ? t.titleActivated : t.titleNew}
              </h2>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
              <p className="max-w-[48ch] text-[13px] leading-relaxed text-[var(--color-ink-dim)]">
                {activated && agents ? t.namedBody : t.provisionBody}
              </p>

              <div className="space-y-4">
                <NameField
                  label={activated ? t.fields.buyerName : t.fields.buyerNameOptional}
                  placeholder={t.fields.buyerPlaceholder}
                  value={buyerName}
                  onChange={(next) => {
                    setBuyerName(next);
                    setSaved(false);
                  }}
                  address={activated ? agents?.buyer : undefined}
                  disabled={activating}
                />
                <NameField
                  label={activated ? t.fields.sellerName : t.fields.sellerNameOptional}
                  placeholder={t.fields.sellerPlaceholder}
                  value={sellerName}
                  onChange={(next) => {
                    setSellerName(next);
                    setSaved(false);
                  }}
                  address={activated ? agents?.seller : undefined}
                  disabled={activating}
                />
              </div>

              {!activated ? (
                <p className="border-s border-[var(--color-line-strong)] ps-3 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
                  {t.setupHint}
                </p>
              ) : null}
              {error ? (
                <FormError>{activated ? t.errorSavePrefix : t.errorActivatePrefix}</FormError>
              ) : null}
              {saved ? (
                <p className="mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-positive)]">
                  • [:SAVED] {t.savedNote}
                </p>
              ) : null}
            </div>

            <footer className="grid grid-cols-2 gap-3 border-t border-[var(--color-line)] bg-[var(--color-surface-2)] px-6 py-5">
              <Button type="button" variant="outline" onClick={onClose} disabled={activating}>
                {activated ? t.doneButton : t.notNowButton}
              </Button>
              <Button
                type="button"
                loading={activating}
                onClick={() => {
                  if (activated) void onSaveNames();
                  else void activate(names()).catch(() => undefined);
                }}
              >
                {activationButtonLabel({
                  activating,
                  activated,
                  saving: t.savingButton,
                  activatingLabel: t.activatingButton,
                  save: t.saveButton,
                  activate: t.activateButton,
                })}
              </Button>
            </footer>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function sheetHiddenState(reduce: boolean | null, desktop: boolean) {
  if (reduce) return { opacity: 0 };
  if (desktop) return { x: '100%' };
  return { y: '100%' };
}

function activationButtonLabel(input: {
  activating: boolean;
  activated: boolean;
  saving: string;
  activatingLabel: string;
  save: string;
  activate: string;
}): string {
  if (input.activating) return input.activated ? input.saving : input.activatingLabel;
  return input.activated ? input.save : input.activate;
}

function NameField({
  label,
  placeholder,
  value,
  onChange,
  address,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  address?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3 mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-faint)]">
        <span>• [:{label}]</span>
        {address ? (
          <span className="normal-case tracking-normal">{shortAddress(address)}</span>
        ) : null}
      </span>
      <input
        type="text"
        value={value}
        maxLength={40}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full rounded-[10px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-[13px] text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink-faint)] focus:border-[color-mix(in_srgb,var(--accent)_60%,transparent)] disabled:opacity-50"
      />
    </label>
  );
}
