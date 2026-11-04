import { useId } from 'react';
import type { Platform } from '@/shared/i18n/messages/landing';

/// Where a chat started, in each platform's own colours, simplified to read at
/// 16 to 20px on the black ground.
export function PlatformIcon({ platform, size = 18 }: { platform: Platform; size?: number }) {
  const id = useId();
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  switch (platform) {
    case 'tiktok': {
      const note = 'M13.5 3.5h2.6c.3 2 1.7 3.5 3.9 3.8v2.7c-1.5 0-2.8-.4-3.9-1.2v6a5 5 0 1 1-5-5h.6v2.8h-.6a2.2 2.2 0 1 0 2.4 2.2V3.5Z';
      return (
        <svg {...common}>
          <path d={note} fill="#25F4EE" transform="translate(-0.9 -0.7)" />
          <path d={note} fill="#FE2C55" transform="translate(0.9 0.7)" />
          <path d={note} fill="#FFFFFF" />
        </svg>
      );
    }
    case 'instagram':
      return (
        <svg {...common}>
          <defs>
            <linearGradient id={id} x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#FEDA75" />
              <stop offset="0.3" stopColor="#FA7E1E" />
              <stop offset="0.6" stopColor="#D62976" />
              <stop offset="1" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke={`url(#${id})`} strokeWidth="2" />
          <circle cx="12" cy="12" r="3.8" stroke={`url(#${id})`} strokeWidth="2" />
          <circle cx="17" cy="7" r="1.2" fill={`url(#${id})`} />
        </svg>
      );
    case 'facebook':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9.5" fill="#1877F2" />
          <path d="M13.1 21.4v-6.7h2.3l.4-2.7h-2.7v-1.7c0-.8.4-1.5 1.6-1.5h1.2V6.5s-1.1-.2-2.1-.2c-2.2 0-3.6 1.3-3.6 3.7V12H7.9v2.7h2.3v6.7" fill="#FFFFFF" />
        </svg>
      );
    case 'x':
      return (
        <svg {...common}>
          <path d="M17.6 3.5h2.9l-6.3 7.2 7.4 9.8h-5.8l-4.5-5.9-5.2 5.9H3.2l6.7-7.7L2.8 3.5h5.9l4.1 5.4 4.8-5.4Zm-1 15.3h1.6L7.5 5.1H5.8l10.8 13.7Z" fill="#FFFFFF" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="3.5" fill="#0A66C2" />
          <path d="M7 10h2.4v7H7v-7Zm1.2-3.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM11 10h2.3v1c.4-.7 1.2-1.2 2.4-1.2 2.3 0 2.7 1.5 2.7 3.5V17H16v-3.3c0-.9 0-1.9-1.2-1.9s-1.4.9-1.4 1.8V17H11v-7Z" fill="#FFFFFF" />
        </svg>
      );
  }
}
