'use client';
import { ConfirmSheetShell } from '@/shared/components/ConfirmSheetShell';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import type { Messages } from '@/shared/i18n/messages';
import { useTelegramLink } from '../hooks/useTelegramLink';

const TG_BLUE = '#229ED9';

/// Telegram's own round logo, so the button reads as Telegram at a glance.
export function TelegramGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="12" fill={TG_BLUE} />
      <path
        d="M5.5 11.7 16.9 7.3c.6-.2 1.1.1.9 1l-1.9 9c-.1.6-.6.8-1.1.5l-2.9-2.1-1.4 1.4c-.2.2-.3.3-.6.3l.2-3 5.4-4.9c.2-.2 0-.3-.3-.1l-6.7 4.2-2.9-.9c-.6-.2-.6-.6.1-.9z"
        fill="#fff"
      />
    </svg>
  );
}

export function TelegramConnectButton({
  address,
  tone = 'dark',
}: {
  address?: string;
  tone?: 'dark' | 'light';
}) {
  const tc = useTranslations().telegramConnect;
  const link = useTelegramLink(address);
  const [open, setOpen] = useState(false);

  // Theme-aware tokens. `dark` keeps the original white-on-dark chip; `light`
  // uses --lp-dark + --lp-text-sub which both flip under html[data-theme="dark"],
  // so the chip stays legible in dark mode too instead of dark-on-dark.
  const onLight = tone === 'light';
  const chipClass = onLight
    ? 'border-[var(--lp-border)] text-[var(--lp-dark)] hover:bg-[var(--lp-light)]'
    : 'border-white/20 text-white hover:bg-white/[0.08] hover:border-white/35';
  const chipMuted = onLight
    ? 'border-[var(--lp-border)] text-[var(--lp-text-sub)]'
    : 'border-white/20 text-white/75';
  const offPillClass = onLight
    ? 'bg-[var(--lp-light)] text-[var(--lp-text-sub)]'
    : 'bg-white/[0.08] text-white/75';

  const linkedLabel = link.status?.linked
    ? link.status.username
      ? `@${link.status.username}`
      : tc.chatLabelTemplate.replace('{chatId}', String(link.status.chatId ?? ''))
    : null;

  if (link.status && !link.status.enabled) {
    return (
      <button
        type="button"
        disabled
        className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold border ${chipMuted} cursor-not-allowed w-fit`}
      >
        <TelegramGlyph />
        {tc.button.brand}
        <span className={`text-[14px] font-semibold px-1.5 py-0.5 ${offPillClass} rounded-sm`}>
          {tc.button.offBadge}
        </span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold border ${chipClass} transition-colors w-fit`}
      >
        <TelegramGlyph />
        {linkedLabel ?? tc.button.connectLabel}
        {linkedLabel && (
          <span
            className="text-[14px] font-semibold px-1.5 py-0.5"
            style={{
              background: 'rgba(175, 201, 91,0.18)',
              color: 'var(--lp-accent)',
              borderRadius: 3,
            }}
          >
            {tc.button.linkedBadge}
          </span>
        )}
      </button>

      {open && (
        <TelegramConnectModal
          copy={tc}
          link={link}
          onClose={() => {
            link.cancelLink();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ModalNote({ tone, children }: { tone: 'info' | 'error'; children: ReactNode }) {
  const style =
    tone === 'error'
      ? {
          background: 'rgba(176,61,58,0.10)',
          color: '#b03d3a',
          border: '1px solid rgba(176,61,58,0.35)',
        }
      : {
          background: 'rgba(175, 201, 91,0.10)',
          color: 'var(--lp-dark)',
          border: '1px solid rgba(175, 201, 91,0.30)',
        };
  return (
    <div
      className="px-3 py-2.5 text-[14px] leading-snug"
      style={{
        ...style,
        borderRadius: 10,
      }}
    >
      {children}
    </div>
  );
}

function TelegramConnectModal({
  copy,
  link,
  onClose,
}: {
  copy: Messages['telegramConnect'];
  link: ReturnType<typeof useTelegramLink>;
  onClose: () => void;
}) {
  const { status, linking, deepLink, startLink, unlink, error } = link;
  // Portal to <body>: a `position: fixed` modal is contained by any ancestor
  // with a transform, and the profile bands animate with `.fade-up` (ends at
  // translateY(0), still a transform). Without the portal the modal anchors to
  // a band instead of the viewport, so it renders mid-content and clips the
  // post-"Generate link" state below the fold. Mounted guard keeps SSR happy.
  const titleId = useId();

  return (
    <ConfirmSheetShell open labelledBy={titleId} busy={linking} onClose={onClose}>
        <div className="pb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <TelegramGlyph size={22} />
              <span className="text-[14px] text-[var(--lp-text-muted)]">
                {copy.modal.eyebrow}
              </span>
            </div>
            <h2 id={titleId} className="mt-2 text-[20px] font-semibold text-[var(--lp-dark)]">
              {copy.modal.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.modal.closeAria}
            className="inline-flex size-11 items-center justify-center rounded-[10px] text-[var(--lp-text-sub)] transition-colors hover:bg-[var(--lp-light)] hover:text-[var(--lp-dark)]"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-[14px] text-[var(--lp-text-muted)]">
            {copy.modal.subheading}
          </p>

          {!status?.linked && !linking && (
            <>
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">
                {copy.modal.startBody}
              </p>
              <button
                type="button"
                onClick={startLink}
                className="inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-[14px] font-semibold transition-[transform,box-shadow] duration-150 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  borderRadius: 14,
                  boxShadow: '0 4px 0 rgba(0,0,0,0.22)',
                }}
              >
                {copy.modal.generateCta}
              </button>
            </>
          )}

          {!status?.linked && linking && deepLink && (
            <>
              <p className="text-[14px] leading-relaxed text-[var(--lp-text-sub)] font-medium">
                {copy.modal.waitingBodyBefore}
                <span className="font-semibold text-[var(--lp-dark)]">{copy.modal.startWord}</span>
                {copy.modal.waitingBodyAfter}
              </p>
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-[14px] font-semibold transition-[transform,box-shadow] duration-150 bg-[var(--lp-accent)] text-[var(--lp-band-dark)] hover:bg-[var(--lp-accent-hover)] hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  borderRadius: 14,
                  boxShadow: '0 4px 0 rgba(0,0,0,0.22)',
                }}
              >
                <TelegramGlyph size={20} />
                {copy.modal.openTelegramCta}
              </a>
              <ModalNote tone="info">
                <p className="font-semibold text-[14px]">
                  {copy.modal.waitingNoteTitle}
                </p>
                <p className="mt-1 text-[14px] opacity-90 normal-case">
                  {copy.modal.waitingNoteBody}
                </p>
              </ModalNote>
            </>
          )}

          {status?.linked && (
            <>
              <div
                className="px-4 py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                style={{
                  background: 'var(--lp-light)',
                  border: '1px solid var(--lp-border-light)',
                  borderRadius: 12,
                }}
              >
                <div>
                  <p className="text-[14px] text-[var(--lp-text-muted)]">
                    {copy.linkedCard.label}
                  </p>
                  <p className="mt-1 font-sans text-[16px] font-extrabold tracking-[-0.01em]">
                    {status.username
                      ? `@${status.username}`
                      : copy.chatLabelTemplate.replace('{chatId}', String(status.chatId ?? ''))}
                  </p>
                </div>
                {status.linkedAt && (
                  <p className="text-[14px] text-[var(--lp-text-muted)]">
                    {copy.linkedCard.linkedAtTemplate.replace(
                      '{date}',
                      formatLinkedAt(status.linkedAt),
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={unlink}
                  className="px-3 py-1.5 text-[14px] font-semibold text-[var(--lp-text-sub)] hover:text-[#b03d3a] hover:bg-[rgba(176,61,58,0.07)] transition-colors rounded"
                >
                  {copy.linkedCard.unlinkCta}
                </button>
              </div>
            </>
          )}

          {error && <ModalNote tone="error">{error}</ModalNote>}
        </div>
    </ConfirmSheetShell>
  );
}

function formatLinkedAt(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
