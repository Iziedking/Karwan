'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PlatformIcon } from './PlatformIcon';
import { orbitRings, type OrbitItem, type OrbitId } from '../orbit';
import type { LandingCopy } from '@/shared/i18n/messages/landing';
import s from '../landing.module.css';

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT ?? '';

/// Partners and channels turning slowly around the Karwan mark, above the
/// closing facts (view 49, 18 Nov amendment). Rings grow in the first time the
/// orbit is seen; hovering holds it still so a badge is easy to hit.
export function Orbit({ t }: { t: LandingCopy['closing'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        observer.disconnect();
      }
    }, { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={s.orbit} data-seen={seen ? '' : undefined}>
      <div className={s.dome}>
        <span className={s.band} data-ring="2" aria-hidden="true" />
        <span className={s.band} data-ring="1" aria-hidden="true" />
        {orbitRings(TELEGRAM_BOT).map((ring, r) => (
          <div key={r} className={s.ring} data-ring={r + 1}>
            {ring.slots.map((slot, i) => (
              <span key={i} className={s.slot} style={{ '--a': `${slot.angle}deg` } as React.CSSProperties}>
                <Badge item={slot.item} focusable={slot.focusable} t={t} />
              </span>
            ))}
          </div>
        ))}
        <div className={s.core} aria-hidden="true">
          <svg viewBox="0 0 512 512">
            <path d="M56 20h400q36 0 36 36v400q0 36-36 36H92q-72 0-72-72V56q0-36 36-36Z" fill="#0e0e0e" />
            <path d="M148 362 215 150l41 128 41-128 67 212" fill="none" stroke="#AFC95B" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <div className={s.orbitCaption}>
        <p>{t.orbitLabel}</p>
        <h3>{t.orbitTitle}</h3>
      </div>
    </div>
  );
}

function Badge({ item, focusable, t }: { item: OrbitItem; focusable: boolean; t: LandingCopy['closing'] }) {
  const wide = item.id === 'ignyte';
  const className = [s.badge, wide && s.badgeWide, item.href === null && s.badgeSoon].filter(Boolean).join(' ');
  const name = item.id === 'ignyte' ? 'Ignyte by DIFC' : item.name;
  if (item.href === null) {
    const label = t.comingSoon.replace('{name}', item.name);
    return (
      <span className={className} data-name={label} role="img" aria-label={label} tabIndex={focusable ? 0 : undefined} aria-hidden={focusable ? undefined : true}>
        {logo(item.id)}
      </span>
    );
  }
  const label = item.kind === 'partner' ? name : item.id === 'email' ? t.emailLabel : t.onChannel.replace('{name}', item.name);
  const external = item.href.startsWith('http');
  return (
    <a
      className={className}
      href={item.href}
      data-name={name}
      aria-label={label}
      tabIndex={focusable ? undefined : -1}
      aria-hidden={focusable ? undefined : true}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {logo(item.id)}
    </a>
  );
}

function logo(id: OrbitId): ReactNode {
  switch (id) {
    case 'arc':
      return <img src="/arc-logo.png" alt="" width={64} height={64} loading="lazy" decoding="async" />;
    case 'circle':
      return <img src="/circle-logo.png" alt="" width={64} height={64} loading="lazy" decoding="async" />;
    case 'x':
    case 'linkedin':
    case 'tiktok':
      return <PlatformIcon platform={id} size={24} />;
    case 'ignyte':
      // Ignyte's own wordmark, as published on ignyte.ae.
      return (
        <svg viewBox="0 0 154 20" aria-hidden="true">
          <g fill="#0A0A0A">
            <path d="M3.34675 0H0V3.41282L3.34675 0Z" />
            <path d="M31.8986 8.85334C31.7898 8.46992 31.6391 8.12927 31.4434 7.83298C31.2476 7.5367 31.0099 7.2832 30.7286 7.07564C30.4474 6.86808 30.1289 6.70964 29.77 6.59873C29.4111 6.48782 29.0164 6.43395 28.5829 6.43395C27.7734 6.43395 27.0634 6.63834 26.4528 7.0487C25.8421 7.45906 25.3667 8.05322 25.0264 8.83433C24.6862 9.61545 24.5168 10.5677 24.5168 11.691C24.5168 12.8144 24.6846 13.7714 25.0187 14.5604C25.3527 15.3494 25.8282 15.9483 26.4403 16.3619C27.0541 16.7738 27.7781 16.9798 28.6125 16.9798C29.3707 16.9798 30.0186 16.8419 30.5562 16.5662C31.0953 16.2906 31.5071 15.9008 31.7929 15.3954C32.0648 14.9169 32.2078 14.3544 32.2202 13.708H29.1438L31.6702 11.1381H35.4458V13.1724C35.4458 14.5905 35.1521 15.8089 34.5648 16.8261C33.9775 17.8433 33.168 18.626 32.1379 19.1758C31.1077 19.7256 29.9269 19.9997 28.5985 19.9997C27.1146 19.9997 25.8111 19.6654 24.6877 18.9951C23.5644 18.3249 22.6896 17.3711 22.0635 16.1337C21.4373 14.8963 21.125 13.426 21.125 11.7243C21.125 10.4156 21.3114 9.24786 21.6859 8.22117C22.0588 7.19447 22.584 6.32304 23.2583 5.60847C23.9326 4.89391 24.7188 4.35045 25.6153 3.97653C26.5118 3.60261 27.4829 3.41724 28.5301 3.41724C29.4266 3.41724 30.261 3.55033 31.0347 3.81492C31.8085 4.07952 32.4937 4.45502 33.095 4.93827C33.6947 5.42151 34.1857 5.99507 34.5679 6.66052C34.9486 7.32597 35.1941 8.05639 35.3028 8.85493H31.9017L31.8986 8.85334Z" />
            <path d="M66.4675 3.63647V19.7784H63.576L56.6883 9.6192H56.5733V19.7784H53.2266V3.63647H56.1631L62.9964 13.7878H63.1363V3.63647H66.4675Z" />
            <path d="M112.48 6.4499V3.63599H125.482V6.4499H120.634V19.778H117.327V6.4499H112.48Z" />
            <path d="M143.301 19.7784V3.63647H153.967V6.45039H146.648V10.2973H153.419V13.1112H146.648V16.9645H153.998V19.7784H143.301Z" />
            <path d="M82.1875 3.60278H85.932L89.5398 10.5504H89.6936L93.3014 3.60278H97.0474L91.2768 14.0314V19.7337H87.9565V14.0314L82.1875 3.60278Z" />
            <path d="M0 6.8114V19.7782H3.34675V3.41284L0 6.8114Z" />
          </g>
        </svg>
      );
    case 'paytag':
      return (
        <svg viewBox="85 48 1152 1152" aria-hidden="true">
          <rect x="85.5" y="48.5" width="1150" height="1150" rx="255" fill="#fff" />
          <g stroke="#000" fill="none">
            <circle cx="660" cy="509" r="207" strokeWidth="72" />
            <path d="M460 337v600h121" strokeWidth="84" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
      );
    case 'telegram':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="#2AABEE" />
          <path fill="#fff" d="M17.6 7.1 15.7 16.4c-.15.65-.53.8-1.07.5l-2.96-2.18-1.43 1.38c-.16.16-.29.29-.6.29l.21-3.02 5.5-4.97c.24-.21-.05-.33-.37-.12l-6.8 4.28-2.92-.91c-.64-.2-.65-.64.13-.94l11.4-4.4c.53-.19 1 .13.76 1.33Z" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="#25D366" />
          <path fill="#fff" d="M12 5.2a6.8 6.8 0 0 0-5.85 10.27L5.2 18.8l3.42-.9A6.8 6.8 0 1 0 12 5.2Zm0 12.4a5.6 5.6 0 0 1-2.86-.78l-.2-.12-2.03.53.54-1.98-.13-.2A5.6 5.6 0 1 1 12 17.6Zm3.07-4.2c-.17-.08-1-.49-1.15-.55-.16-.06-.27-.08-.38.08s-.44.55-.54.67c-.1.11-.2.13-.37.04a4.6 4.6 0 0 1-2.29-2c-.17-.3.17-.28.5-.93.05-.11.03-.2-.02-.29-.04-.08-.38-.92-.52-1.26-.14-.33-.28-.28-.38-.29h-.33a.63.63 0 0 0-.46.21c-.16.17-.6.59-.6 1.43s.62 1.66.7 1.78c.09.11 1.22 1.86 2.95 2.6 1.1.47 1.52.51 2.07.43.33-.05 1-.41 1.15-.81.14-.4.14-.75.1-.82-.05-.07-.16-.11-.33-.2Z" />
        </svg>
      );
    case 'email':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="#AFC95B" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      );
  }
}
