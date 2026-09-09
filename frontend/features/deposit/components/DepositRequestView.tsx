'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type DepositRequestPublic } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

export function DepositRequestView({ token }: { token: string }) {
  const copy = useTranslations().deposit.request;
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['deposit-request', token],
    queryFn: () => api.getDepositRequest(token),
    enabled: !!token,
    staleTime: 15_000,
  });

  const request = data?.request ?? null;
  const copyAddress = useCallback(async () => {
    if (!request) return;
    try {
      await navigator.clipboard.writeText(request.recipientAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // The address remains fully visible and selectable.
    }
  }, [request]);

  return (
    <main className="product-surface min-h-[calc(100vh-7rem)]">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
        {isLoading ? <RequestSkeleton /> : null}
        {isError || !request ? <RequestUnavailable copy={copy} /> : null}
        {request ? (
          <RequestCard request={request} copy={copy} copied={copied} onCopyAddress={copyAddress} />
        ) : null}
      </div>
    </main>
  );
}

function RequestCard({
  request,
  copy,
  copied,
  onCopyAddress,
}: {
  request: DepositRequestPublic;
  copy: ReturnType<typeof useTranslations>['deposit']['request'];
  copied: boolean;
  onCopyAddress: () => void;
}) {
  const link = typeof window !== 'undefined' ? window.location.href : '';
  const active = request.status === 'open';
  const senderHref = `/bridge?direction=in&rail=cctp&recipient=${encodeURIComponent(request.recipientAddress)}${request.amountUsdc ? `&amount=${encodeURIComponent(request.amountUsdc)}` : ''}`;
  const statusLabel = active
    ? copy.waiting
    : request.status === 'matched'
      ? copy.matched
      : request.status === 'expired'
        ? copy.expired
        : request.status === 'cancelled'
          ? copy.cancelled
          : copy.needsAttention;
  return (
    <section
      className="overflow-hidden"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 6,
      }}
    >
      <div className="grid gap-8 p-7 sm:p-10 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
            {copy.tag}
          </span>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className="inline-flex min-h-8 items-center px-3 mono text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{
                background: active ? 'var(--lp-accent)' : 'var(--lp-light)',
                color: active ? 'var(--accent-ink)' : 'var(--lp-text-sub)',
                borderRadius: 999,
              }}
            >
              {statusLabel}
            </span>
          </div>
          <h1 className="mt-5 max-w-[16ch] text-[clamp(2.4rem,7vw,5.2rem)] font-extrabold leading-[0.94] tracking-[-0.065em] text-[var(--lp-dark)]">
            {request.amountUsdc ? `${request.amountUsdc} USDC` : 'USDC'}
          </h1>
          <p className="mt-5 max-w-[42ch] text-[17px] leading-relaxed text-[var(--lp-text-sub)]">
            {request.purpose}
          </p>
          <p className="mt-5 text-[13px] font-semibold text-[var(--lp-dark)]">{copy.recipientLabel}</p>
          <p className="mt-2 mono break-all text-[12px] leading-relaxed text-[var(--lp-text-sub)]">
            {request.recipientAddress}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCopyAddress}
              className="inline-flex min-h-11 items-center px-4 py-3 mono text-[11px] font-bold uppercase tracking-[0.1em]"
              style={{
                background: 'var(--lp-control-active-bg)',
                color: 'var(--lp-control-active-ink)',
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 2,
              }}
            >
              {copied ? copy.copied : copy.copyLink}
            </button>
            {active ? (
              <a
                href={senderHref}
                className="inline-flex min-h-11 items-center px-4 py-3 mono text-[11px] font-bold uppercase tracking-[0.1em]"
                style={{
                  background: 'transparent',
                  color: 'var(--lp-dark)',
                  border: '1px solid var(--lp-border-light)',
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  borderBottomLeftRadius: 10,
                  borderBottomRightRadius: 2,
                }}
              >
                {copy.sendCta}
              </a>
            ) : null}
          </div>
          {active ? <p className="mt-3 max-w-[42ch] text-[12px] leading-relaxed text-[var(--lp-text-muted)]">{copy.sendBody}</p> : null}
        </div>
        <RequestQr value={link} label={copy.qrAlt} />
      </div>
      <div
        className="grid gap-4 border-t px-7 py-5 sm:grid-cols-2 sm:px-10"
        style={{ borderColor: 'var(--lp-border-light)' }}
      >
        <div>
          <span className="mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--lp-text-muted)]">
            {copy.expiresTemplate.replace('{time}', new Date(request.expiresAt).toLocaleString())}
          </span>
        </div>
        <p className="text-[13px] leading-relaxed text-[var(--lp-text-sub)] sm:text-right">
          {request.acceptedChains.join(' · ')}
        </p>
      </div>
    </section>
  );
}

function RequestQr({ value, label }: { value: string; label: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const QR = await import('qrcode');
        if (cancelled || !ref.current || !value) return;
        await QR.toCanvas(ref.current, value, {
          margin: 1,
          width: 190,
          errorCorrectionLevel: 'M',
          color: { dark: '#0A0A0BFF', light: '#FFFFFFFF' },
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (failed || !value) return null;
  return (
    <div
      className="justify-self-start p-3 md:justify-self-end"
      style={{
        background: '#FFFFFF',
        border: '1px solid var(--lp-border-light)',
        borderRadius: 16,
      }}
    >
      <canvas ref={ref} aria-label={label} role="img" width={190} height={190} />
    </div>
  );
}

function RequestSkeleton() {
  return (
    <div
      aria-hidden
      className="motion-safe:animate-pulse motion-reduce:animate-none"
      style={{
        height: 440,
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderRadius: 24,
      }}
    />
  );
}

function RequestUnavailable({
  copy,
}: {
  copy: ReturnType<typeof useTranslations>['deposit']['request'];
}) {
  return (
    <section
      className="p-8 sm:p-12"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 6,
      }}
    >
      <span className="mono text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
        Karwan
      </span>
      <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.05em] text-[var(--lp-dark)]">
        {copy.unavailableTitle}
      </h1>
      <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-[var(--lp-text-sub)]">
        {copy.unavailableBody}
      </p>
    </section>
  );
}
