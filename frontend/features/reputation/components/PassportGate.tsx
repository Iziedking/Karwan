'use client';
import { useCallback, useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { passportShareCopy } from '@/shared/i18n/messages/passportShare';
import { passportView } from '../passportGate';
import { CreditPassport } from './CreditPassport';
import { PublicPassport } from './PublicPassport';

/// The owner sees their full passport. Everyone else sees the sealed one, unless
/// they opened a share the owner made (view 29); once it ends they are told so.
export function PassportGate({ address, share }: { address: string; share?: string }) {
  const { address: viewer } = useAuth();
  const { locale } = useLocale();
  const [ended, setEnded] = useState(false);
  const onSealed = useCallback(() => setEnded(true), []);
  if (passportView(viewer, address) === 'owner') return <CreditPassport address={address} />;
  if (share && !ended) return <CreditPassport address={address} share={share} onSealed={onSealed} />;
  return <PublicPassport address={address} notice={share ? passportShareCopy[locale].ended : undefined} />;
}
