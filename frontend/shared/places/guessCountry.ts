import zones from './tzCountry.json';
import { browserCountry } from '@/features/signup/countries';

/// The country setup starts from when the account has none (view 39, 19 Nov):
/// the phone's time zone, then its language region, then Nigeria. Nothing
/// leaves the phone to work this out.
const BY_ZONE = zones as Record<string, string>;
const FIRST = 'NG';

export function guessCountry(timeZone: string | undefined, languages: readonly string[]): string {
  const byZone = timeZone ? BY_ZONE[timeZone] : undefined;
  return byZone ?? browserCountry(languages) ?? FIRST;
}

/// The guess on this device.
export function deviceCountry(): string {
  if (typeof window === 'undefined') return FIRST;
  let zone: string | undefined;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zone = undefined;
  }
  return guessCountry(zone, navigator.languages ?? [navigator.language]);
}
