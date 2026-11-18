/// The orbit above the closing facts (view 49, 18 Nov amendment): partners on
/// the inner rings, the places to reach Karwan on the outer ones. A channel the
/// agent is not on yet shows without a link, so the page promises nothing that
/// does not work today.

import { TEAM_EMAIL } from '@/shared/i18n/messages/landing';

export type OrbitId = 'arc' | 'circle' | 'ignyte' | 'paytag' | 'telegram' | 'whatsapp' | 'x' | 'linkedin' | 'tiktok' | 'email';

export interface OrbitItem {
  id: OrbitId;
  /// The brand as written, never translated.
  name: string;
  kind: 'partner' | 'channel';
  /// Null while the agent is not on that channel yet.
  href: string | null;
}

export interface OrbitSlot {
  item: OrbitItem;
  /// Degrees around the ring centre; the upper half is on screen.
  angle: number;
  /// Each badge sits on its ring twice so the visible half is never empty;
  /// only the first copy takes keyboard focus.
  focusable: boolean;
}

export interface OrbitRing {
  slots: OrbitSlot[];
}

export function orbitRings(telegramBot: string): OrbitRing[] {
  const bot = telegramBot.replace(/^@/, '');
  const item = (id: OrbitId, name: string, kind: OrbitItem['kind'], href: string | null): OrbitItem => ({ id, name, kind, href });
  const rings: OrbitItem[][] = [
    [item('arc', 'Arc', 'partner', 'https://www.arc.network'), item('circle', 'Circle', 'partner', 'https://www.circle.com')],
    [
      item('ignyte', 'Ignyte', 'partner', 'https://www.ignyte.ae/'),
      item('paytag', 'Paytag', 'partner', 'https://www.usepaytag.xyz/'),
      item('telegram', 'Telegram', 'channel', bot ? `https://t.me/${bot}` : null),
      item('whatsapp', 'WhatsApp', 'channel', null),
    ],
    [
      item('x', 'X', 'channel', 'https://x.com/karwanBuild'),
      item('linkedin', 'LinkedIn', 'channel', 'https://www.linkedin.com/company/karwanbuild'),
      item('tiktok', 'TikTok', 'channel', null),
      item('email', TEAM_EMAIL, 'channel', `mailto:${TEAM_EMAIL}`),
    ],
  ];
  return rings.map((items) => {
    const all = [...items, ...items];
    const step = 360 / all.length;
    return { slots: all.map((it, i) => ({ item: it, angle: -180 + step / 2 + i * step, focusable: i < items.length })) };
  });
}
