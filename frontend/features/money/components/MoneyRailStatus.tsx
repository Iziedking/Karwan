'use client';

import { useEffect, useState } from 'react';
import { api, type MoneyRailCapability } from '@/core/api';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

type Direction = 'in' | 'out';

export function MoneyRailStatus({ direction }: { direction: Direction }) {
  const copy = useTranslations().depositRails;
  const gatewayCopy = useTranslations().gatewayCard;
  const [capabilities, setCapabilities] = useState<MoneyRailCapability[]>([]);

  useEffect(() => {
    let active = true;
    void api.moneyCapabilities()
      .then((response) => {
        if (active) setCapabilities(response.capabilities);
      })
      .catch(() => {
        if (active) setCapabilities([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const statusFor = (rail: MoneyRailCapability['rail']) =>
    capabilities.find((capability) => capability.rail === rail)?.state ?? 'unavailable';
  const statusLabel = (state: MoneyRailCapability['state']) =>
    state === 'live' ? gatewayCopy.confirmed : state === 'configured' ? copy.onramp.tab : copy.soon;
  const statusTone = (state: MoneyRailCapability['state']) =>
    state === 'live'
      ? { color: 'var(--lp-accent)', background: 'rgba(175, 201, 91, 0.12)' }
      : state === 'configured'
        ? { color: 'var(--lp-text-sub)', background: 'var(--lp-light)' }
        : { color: 'var(--lp-text-muted)', background: 'var(--lp-light)' };

  const rows = direction === 'in'
    ? [
        { rail: 'gateway_deposit' as const, label: copy.gateway.tab, body: copy.gateway.blurb },
        { rail: 'cctp_deposit' as const, label: copy.cctp.tab, body: copy.cctp.blurb },
        { rail: 'bank_deposit' as const, label: copy.onramp.tab, body: copy.onramp.inLabel },
      ]
    : [
        { rail: 'arc_transfer' as const, label: gatewayCopy.toWallet, body: gatewayCopy.arcPinned },
        { rail: 'gateway_deposit' as const, label: copy.gateway.tab, body: copy.gateway.blurb },
        { rail: 'bank_withdrawal' as const, label: copy.onramp.tab, body: copy.onramp.outLabel },
      ];

  return (
    <section
      aria-label={copy.chooserAria}
      className="mb-5 overflow-hidden"
      style={{
        background: 'var(--lp-card)',
        border: '1px solid var(--lp-border-light)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 4,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--lp-border-light)] px-4 py-3">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--lp-text-muted)]">
            {gatewayCopy.arcPinned}
          </p>
          <p className="mt-1 text-[13px] font-semibold text-[var(--lp-dark)]">
            {direction === 'in' ? copy.direct.title : copy.cctp.title}
          </p>
        </div>
        <span className="mono text-[10px] uppercase tracking-[0.14em] text-[var(--lp-text-muted)]">
          {gatewayCopy.tag.replace(/[\[\]:]/g, '')}
        </span>
      </div>
      <div className="grid sm:grid-cols-3">
        {rows.map((row, index) => {
          const state = statusFor(row.rail);
          const tone = statusTone(state);
          return (
            <div
              key={`${row.rail}-${row.label}`}
              className={`${index > 0 ? 'border-t sm:border-t-0 sm:border-s' : ''} border-[var(--lp-border-light)] px-4 py-3`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-[var(--lp-dark)]">{row.label}</p>
                <span
                  className="mono rounded-full px-2 py-1 text-[9px] uppercase tracking-[0.12em]"
                  style={{ color: tone.color, background: tone.background }}
                >
                  {statusLabel(state)}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--lp-text-sub)]">{row.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
