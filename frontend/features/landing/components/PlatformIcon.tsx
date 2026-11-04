import type { Platform } from '@/shared/i18n/messages/landing';

/// Simple line marks for where a chat started. Drawn in the current colour.
export function PlatformIcon({ platform, size = 18 }: { platform: Platform; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (platform) {
    case 'tiktok':
      return <svg {...common}><path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 4c.5 2.4 2.1 4 4.5 4.3" /></svg>;
    case 'instagram':
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.6" /><circle cx="16.8" cy="7.2" r=".6" fill="currentColor" /></svg>;
    case 'facebook':
      return <svg {...common}><path d="M14.5 8H13a1.5 1.5 0 0 0-1.5 1.5V20" /><path d="M9 12.5h5.5" /></svg>;
    case 'x':
      return <svg {...common}><path d="M5 5l14 14" /><path d="M19 5L5 19" /></svg>;
    case 'linkedin':
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 10.5V16" /><path d="M8.5 7.8v.1" /><path d="M12 16v-3.2a2 2 0 0 1 4 0V16" /><path d="M12 10.5V16" /></svg>;
  }
}
