import type { GreetingsCopy } from '@/shared/i18n/messages/greetings';

export function greetingFor(hour: number): keyof GreetingsCopy {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
