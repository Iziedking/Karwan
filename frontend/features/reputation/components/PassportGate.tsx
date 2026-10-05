'use client';
import { useAuth } from '@/shared/hooks/useAuth';
import { passportView } from '../passportGate';
import { CreditPassport } from './CreditPassport';
import { PublicPassport } from './PublicPassport';

export function PassportGate({ address }: { address: string }) {
  const { address: viewer } = useAuth();
  return passportView(viewer, address) === 'owner' ? <CreditPassport address={address} /> : <PublicPassport address={address} />;
}
