'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { api, type UserProfile } from '@/core/api';
import { PROFILE_SAVED_EVENT } from '@/shared/hooks/useUserProfile';
import { WalletAvatar } from '@/shared/components/WalletAvatar';
import { shortAddress } from '@/shared/utils/format';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { useAuth } from '@/shared/hooks/useAuth';
import { formatBalance, heroAmount } from '@/features/money/balanceModel';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { ProfileFrame, Row, RowGroup } from '../ui/ProfileUi';
import { ProfileSignOut } from './ProfileSignOut';
import { WorkspaceSwitcher } from '@/features/workspaces/components/WorkspaceSwitcher';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { useAddPasskey } from '@/features/settings/components/SettingsBand';

type ProfileAccountHubProps = {
  profile: UserProfile;
  address: string;
  hasOpenDeals: boolean;
  hasAction: boolean;
  openCount: number;
};


export function ProfileAccountHub({
  profile,
  address,
  hasAction,
  openCount,
}: ProfileAccountHubProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [savedPhoto, setSavedPhoto] = useState(profile.profileImageDataUrl);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);
  const messages = useTranslations();
  const nav = messages.nav;
  const businessCopy = messages.businessProfilePage;
  const hub = messages.profile.hub;
  useEffect(() => {
    setSavedPhoto(profile.profileImageDataUrl);
    setImageFailed(false);
  }, [profile.profileImageDataUrl]);

  async function savePhoto(imageDataUrl: string | null) {
    setPhotoBusy(true);
    setPhotoError('');
    try {
      const result = await api.setProfileAvatar(address, imageDataUrl);
      setSavedPhoto(result.profile.profileImageDataUrl);
      setImageFailed(false);
      window.dispatchEvent(new Event(PROFILE_SAVED_EVENT));
    } catch {
      setPhotoError(hub.photoError);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5_000_000) {
      setPhotoError(hub.photoTypeError);
      return;
    }
    try {
      const imageDataUrl = await cropProfilePhoto(file);
      await savePhoto(imageDataUrl);
    } catch {
      setPhotoError(hub.photoTypeError);
    }
  }
  const { isBusinessWorkspace, workspaces } = useWorkspaceContext();
  const business = isBusinessWorkspace;
  const hasBusinessWorkspace = workspaces.some((workspace) => workspace.kind === 'business');
  const displayName =
    (business ? profile.smeProfile?.companyName : profile.displayName)?.trim() ||
    profile.displayName?.trim() ||
    messages.profile.hero.fallbackName;
  const contact = profile.xHandle
    ? `@${profile.xHandle.replace(/^@/, '')}`
    : profile.email || shortAddress(address);

  const money = useMoneyBalances();
  const { hasPasskey, method, email, refresh } = useAuth();
  const passkey = useAddPasskey(email, () => refresh());
  const { locale } = useLocale();
  const simple = messages.profile.simple;
  const balanceFacts = { balance: money.balance, pool: money.pool, loading: money.loading, error: money.error };
  const agentTotal = money.buyer != null || money.seller != null ? (money.buyer ?? 0) + (money.seller ?? 0) : null;
  const usdc = (value: number | null) => (value == null ? undefined : `${formatBalance(value, locale)} USDC`);

  return (
    <ProfileFrame
      title={
        <span className="flex min-w-0 items-center gap-4">
          <span className="relative shrink-0">
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label={savedPhoto ? hub.changePhoto : hub.addPhoto} onChange={(event) => void choosePhoto(event)} />
            <button type="button" disabled={photoBusy} aria-label={savedPhoto ? hub.changePhoto : hub.addPhoto} onClick={() => photoInput.current?.click()} className="group relative block size-14 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 disabled:opacity-60">
              {(savedPhoto || profile.xProfileImageUrl) && !imageFailed ? (
                <img src={savedPhoto || profile.xProfileImageUrl} alt="" width={56} height={56} className="size-14 rounded-full object-cover" onError={() => setImageFailed(true)} />
              ) : (
                <WalletAvatar address={address} size={56} />
              )}
              <span aria-hidden className="absolute -bottom-0.5 -end-0.5 grid size-6 place-items-center rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[14px] text-[var(--lp-dark)]">+</span>
            </button>
          </span>
          <span className="min-w-0">
            <span className="block truncate">{displayName}</span>
            <span className="block truncate text-[14px] font-normal tracking-normal text-[var(--lp-text-sub)]">
              {[profile.handle ? `@${profile.handle}` : contact, business ? hub.businessAccount : hub.personalAccount].join(' · ')}
            </span>
          </span>
        </span>
      }
      hint={simple.photoHint}
    >
      {photoBusy || photoError || savedPhoto ? (
        <div className="-mt-3 flex flex-wrap items-center gap-3 text-[13px]">
          {savedPhoto ? <button type="button" disabled={photoBusy} onClick={() => void savePhoto(null)} className="min-h-11 font-semibold text-[var(--lp-text-sub)] underline underline-offset-4">{hub.removePhoto}</button> : null}
          <span role="status" aria-live="polite" className="text-[var(--lp-text-sub)]">{photoBusy ? hub.savingPhoto : ''}</span>
          {photoError ? <span role="alert" className="text-[var(--color-critical)]">{photoError}</span> : null}
        </div>
      ) : null}

      {DEALS_AVAILABLE && hasBusinessWorkspace ? (
        <RowGroup>
          <Row label={hub.workspaces}><WorkspaceSwitcher /></Row>
        </RowGroup>
      ) : null}

      <RowGroup title={DEALS_AVAILABLE ? hub.moneyAndTrade : hub.money}>
        <Row label={hub.usdcBalance} value={money.balance == null ? undefined : `${formatBalance(heroAmount(balanceFacts), locale)} USDC`} href="/account" />
        {DEALS_AVAILABLE ? (
          <>
            <Row label={simple.agents} value={usdc(agentTotal)} href="/profile/agent-funds" />
            <Row label={hub.openDeals} value={hasAction ? hub.reviewNow : openCount > 0 ? String(openCount) : undefined} href="/profile/open-deals" />
          </>
        ) : null}
        <Row label={hub.activityReceipts} href="/activity" />
        {DEALS_AVAILABLE ? <Row label={hub.reputation} href="/stake" /> : null}
      </RowGroup>

      <RowGroup title={hub.account}>
        <Row label={simple.profileTitle} href="/profile/edit" />
        {DEALS_AVAILABLE ? <Row label={simple.agentsTitle} href="/profile/setup" /> : null}
        <Row label={simple.contactTitle} value={profile.email ?? simple.setUp} href="/profile/contact" />
        <Row label={simple.walletsTitle} href="/profile/wallets" />
        <Row label={messages.payLink.create.title} href="/request" />
        {DEALS_AVAILABLE ? (
          <Row
            label={business || hasBusinessWorkspace ? businessCopy.label : businessCopy.open}
            value={business ? profile.smeProfile?.companyName : hasBusinessWorkspace ? undefined : simple.setUp}
            href="/profile/business"
          />
        ) : null}
      </RowGroup>

      {/* A wallet account signs with its wallet; passkeys belong to email accounts. */}
      {method === 'circle' ? (
        <RowGroup title={hub.security}>
          {hasPasskey || passkey.justAdded ? (
            <Row label={hub.passkey} value={simple.on} />
          ) : (
            <Row
              label={hub.passkey}
              value={passkey.busy ? passkey.copy.addingButton : passkey.error ?? simple.off}
              onClick={passkey.supports && !passkey.busy ? () => void passkey.addPasskey() : undefined}
            />
          )}
          <Row label={hub.recovery} soon={hub.soon} />
          <Row label={hub.devices} soon={hub.soon} />
        </RowGroup>
      ) : null}

      <RowGroup title={hub.other}>
        <Row label={hub.publicProfile} href={`/credit-passport/${address}`} />
        <Row label={nav.allSettings} href="/settings" />
        <Row label={nav.help} href="/how-it-works" />
      </RowGroup>

      <footer className="flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-[12px] text-[var(--lp-text-sub)]">{hub.accountLabel} {shortAddress(address)}</p>
        <ProfileSignOut />
      </footer>
    </ProfileFrame>
  );
}

async function cropProfilePhoto(file: File): Promise<string> {
  const image = await createImageBitmap(file);
  try {
    const side = Math.min(image.width, image.height);
    if (side < 1) throw new Error('empty image');
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('image canvas unavailable');
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 160, 160);
    let result = canvas.toDataURL('image/jpeg', 0.78);
    if (result.length > 100_000) result = canvas.toDataURL('image/jpeg', 0.55);
    if (result.length > 100_000) throw new Error('image too large');
    return result;
  } finally {
    image.close();
  }
}
