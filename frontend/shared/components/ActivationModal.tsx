'use client';
import { useEffect, useState } from 'react';
import { shortAddress } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
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

/// Presentational modal for provisioning a wallet's Circle agent pair, and for
/// naming the agents. State is owned by the caller via useActivation so the same
/// hook backs the gate and any other entry point. Names are optional: blank
/// leaves the defaults ("Buyer agent" / "Seller agent").
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

  // Prefill the inputs from existing names when the modal opens.
  useEffect(() => {
    if (!open) return;
    setBuyerName(agents?.buyerName ?? '');
    setSellerName(agents?.sellerName ?? '');
    setSaved(false);
  }, [open, agents?.buyerName, agents?.sellerName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !activating) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, activating, onClose]);

  if (!open) return null;

  const names = (): AgentNames => ({
    buyerName: buyerName.trim() || undefined,
    sellerName: sellerName.trim() || undefined,
  });

  async function onSaveNames() {
    try {
      await renameAgents(names());
      setSaved(true);
    } catch {
      /* error surfaces via the error prop */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'color-mix(in oklab, var(--color-ink) 32%, transparent)' }}
      onClick={() => !activating && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] overflow-hidden"
      >
        <div className="px-6 pt-6 pb-4">
          <p className="eyebrow">{t.eyebrow}</p>
          <h2 className="display text-[26px] leading-tight mt-1">
            {activated ? t.titleActivated : t.titleNew}
          </h2>
        </div>

        {activated && agents ? (
          <div className="px-6 pb-6 space-y-4">
            <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
              {t.namedBody}
            </p>
            <div className="space-y-3">
              <NameField
                label={t.fields.buyerName}
                placeholder={t.fields.buyerPlaceholder}
                value={buyerName}
                onChange={(v) => {
                  setBuyerName(v);
                  setSaved(false);
                }}
                address={agents.buyer}
                disabled={activating}
              />
              <NameField
                label={t.fields.sellerName}
                placeholder={t.fields.sellerPlaceholder}
                value={sellerName}
                onChange={(v) => {
                  setSellerName(v);
                  setSaved(false);
                }}
                address={agents.seller}
                disabled={activating}
              />
            </div>
            {error && <ErrorNote message={error} prefix={t.errorSavePrefix} />}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onSaveNames}
                disabled={activating}
                style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
                className="flex-1 px-4 py-2.5 rounded-md text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity inline-flex items-center justify-center gap-2"
              >
                {activating && <Spinner />}
                {activating ? t.savingButton : t.saveButton}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={activating}
                className="px-4 py-2.5 rounded-md text-[13px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] disabled:opacity-50 transition-colors"
              >
                {t.doneButton}
              </button>
            </div>
            {saved && (
              <p className="text-[12px] text-[var(--color-positive)]">{t.savedNote}</p>
            )}
          </div>
        ) : (
          <div className="px-6 pb-6 space-y-4">
            <p className="text-[13px] text-[var(--color-ink-dim)] leading-relaxed">
              {t.provisionBody}
            </p>
            <div className="space-y-3">
              <NameField
                label={t.fields.buyerNameOptional}
                placeholder={t.fields.buyerPlaceholder}
                value={buyerName}
                onChange={setBuyerName}
                disabled={activating}
              />
              <NameField
                label={t.fields.sellerNameOptional}
                placeholder={t.fields.sellerPlaceholder}
                value={sellerName}
                onChange={setSellerName}
                disabled={activating}
              />
            </div>
            <p className="text-[12px] text-[var(--color-ink-faint)] leading-relaxed">
              {t.setupHint}
            </p>
            {error && <ErrorNote message={error} prefix={t.errorActivatePrefix} />}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => activate(names()).catch(() => {})}
                disabled={activating}
                style={{ backgroundColor: '#0c0e10', color: '#ffffff' }}
                className="flex-1 px-4 py-2.5 rounded-md text-[13px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity inline-flex items-center justify-center gap-2"
              >
                {activating && <Spinner />}
                {activating ? t.activatingButton : t.activateButton}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={activating}
                className="px-4 py-2.5 rounded-md text-[13px] text-[var(--color-ink-dim)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] disabled:opacity-50 transition-colors"
              >
                {t.notNowButton}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
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
  onChange: (v: string) => void;
  address?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="eyebrow flex items-baseline justify-between gap-3">
        <span>{label}</span>
        {address && (
          <span className="mono text-[11px] normal-case tracking-normal text-[var(--color-ink-faint)]">
            {shortAddress(address)}
          </span>
        )}
      </span>
      <input
        type="text"
        value={value}
        maxLength={40}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--color-ink)] disabled:opacity-50"
      />
    </label>
  );
}

function ErrorNote({ message, prefix }: { message: string; prefix: string }) {
  return (
    <div
      className="rounded-md px-3 py-2"
      style={{
        border: '1px solid color-mix(in oklab, var(--color-critical) 30%, transparent)',
        background: 'color-mix(in oklab, var(--color-critical) 8%, transparent)',
      }}
    >
      <p className="text-[12px] text-[var(--color-critical)] leading-snug">
        {prefix}: {message}
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="animate-spin" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
