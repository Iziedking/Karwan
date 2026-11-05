'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, profilePhotoOf, type Reputation, type SealedReputation } from '@/core/api';
import { useTierLabels } from '@/features/reputation/useTierLabels';
import { isSealedReputation } from '@/features/reputation/sealed';
import { fill } from '@/features/deals/workspace/presentation';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { WalletAvatar } from '@/shared/components/WalletAvatar';

/// Who someone is on Karwan: their profile and the record the market shows.
export function usePersonRecord(address: string, known?: { name?: string; tag?: string }) {
  const profile = useQuery({ queryKey: ['profile', address], queryFn: () => api.getProfile(address), staleTime: 60_000 });
  const reputation = useQuery({ queryKey: ['reputation', address], queryFn: () => api.reputation(address), staleTime: 60_000 });
  const p = profile.data?.profile;
  const tag = p?.handle ?? known?.tag;
  const name = tag ? `@${tag}` : p?.displayName?.trim() || known?.name || `${address.slice(0, 6)}…${address.slice(-4)}`;
  return { profile: p, name, tag, displayName: p?.displayName?.trim() || known?.name, reputation: reputation.data };
}

/// A person with their record beside the name, wherever money goes to or
/// comes from (view 50). A sealed record shows only its tier. `known` is what
/// a tag lookup already said, used until the profile loads, so a person is
/// never shown by their wallet address.
export function PersonRecord({ address, size = 48, known }: { address: string; size?: number; known?: { name?: string; tag?: string } }) {
  const tiers = useTierLabels();
  const t = useTranslations();
  const copy = t.payLink.pay;
  const { profile, name, tag, displayName, reputation } = usePersonRecord(address, known);
  const [failed, setFailed] = useState(false);
  const photo = profilePhotoOf(profile);
  const sealed: SealedReputation | null = reputation && isSealedReputation(reputation) ? reputation : null;
  const open: Reputation | null = reputation && !isSealedReputation(reputation) ? reputation : null;
  const settled = open?.successCount ?? 0;
  const recordLine = sealed
    ? sealed.tier === 'NEW' ? copy.recordNew : `${t.sealedRecord.tier} ${tiers[sealed.tier]}`
    : settled > 0 && open?.tier ? fill(copy.record, { tier: open.tier, n: settled }) : copy.recordNew;
  return (
    <div className="flex min-w-0 items-center gap-3">
      {photo && !failed ? (
        <img src={photo} referrerPolicy="no-referrer" alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <WalletAvatar address={address} size={size} />
      )}
      <div className="min-w-0">
        <p className="truncate text-[16px] font-semibold text-[var(--ink)]">{displayName || name}</p>
        <p className="truncate text-[14px] font-medium text-[var(--ink-secondary)]">
          {[tag ? `@${tag}` : null, recordLine].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}
