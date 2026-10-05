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
  const statusTone = (_state: MoneyRailCapability['state']) =>
    ({ color: 'var(--ink-secondary)', background: 'var(--tint)' });

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
      className="mb-5 overflow-hidden rounded-[20px] bg-[var(--surface)] p-5 sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {rows.map((row) => {
          const state = statusFor(row.rail);
          const tone = statusTone(state);
          return (
            <div
              key={`${row.rail}-${row.label}`}
              className="min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-medium text-[var(--ink)]">{row.label}</p>
                <span
                  className="mono rounded-full px-2 py-1 text-[14px]"
                  style={{ color: tone.color, background: tone.background }}
                >
                  {statusLabel(state)}
                </span>
              </div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--ink-secondary)] font-medium">{row.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
