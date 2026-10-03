import { Icon, type IconName } from '@/shared/components/Icon';
import { notificationKind, type NotificationKind } from '../notificationKind';

const LOOK: Record<NotificationKind, { icon: IconName; bg: string; ink: string }> = {
  attention: { icon: 'alert', bg: 'var(--color-warning-soft)', ink: 'var(--color-warning)' },
  money: { icon: 'wallet', bg: 'var(--color-positive-soft)', ink: 'var(--color-positive)' },
  done: { icon: 'check', bg: 'var(--color-accent-soft)', ink: 'var(--lp-dark)' },
  match: { icon: 'bot', bg: 'var(--tint)', ink: 'var(--lp-dark)' },
  deal: { icon: 'briefcase', bg: 'var(--lp-light)', ink: 'var(--lp-text-sub)' },
};

export function KindIcon({ type, size = 36 }: { type: string; size?: number }) {
  const look = LOOK[notificationKind(type)];
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: look.bg, color: look.ink }}>
      <Icon name={look.icon} size={size >= 40 ? 20 : 16} />
    </span>
  );
}
