'use client';

import { Icon } from '@/shared/components/Icon';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { api, type UserProfile } from '@/core/api';
import { PROFILE_SAVED_EVENT } from '@/shared/hooks/useUserProfile';
import { WalletAvatar } from '@/shared/components/WalletAvatar';
import { shortAddress } from '@/shared/utils/format';
import { useLocale, useTranslations } from '@/shared/i18n/LocaleProvider';
import { useAuth } from '@/shared/hooks/useAuth';
import { formatBalance, heroAmount } from '@/features/money/balanceModel';
import { useMoneyBalances } from '@/features/money/hooks/useMoneyBalances';
import { useOwnedBalance } from '@/features/money/hooks/useOwnedBalance';
import { ProfileFrame, Row, RowGroup, ToggleRow } from '../ui/ProfileUi';
import { useRouter } from 'next/navigation';
import { rememberReturn } from '@/features/assistant/assistantReturn';
import { ProfileSignOut } from './ProfileSignOut';
import { PhotoMenu } from './PhotoMenu';
import { WorkspaceSwitcher } from '@/features/workspaces/components/WorkspaceSwitcher';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { useAddPasskey } from '@/features/settings/components/SettingsBand';
import { accountRows } from '../accountRows';

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
  const router = useRouter();
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
  // The same total as Home and the balance page; the Agents row below shows its part.
  const owned = useOwnedBalance();
  const { hasPasskey, method, email, refresh } = useAuth();
  const passkey = useAddPasskey(email, () => refresh());
  const { locale } = useLocale();
  const simple = messages.profile.simple;
  const balanceFacts = { balance: money.balance, pool: money.pool, loading: money.loading, error: money.error };
  const agentTotal = money.buyer != null || money.seller != null ? (money.buyer ?? 0) + (money.seller ?? 0) : null;
  const usdc = (value: number | null) => (value == null ? undefined : `${formatBalance(value, locale)} USDC`);
  // What setup already filled in, instead of "Set up" (accountRows.ts).
  const rows = accountRows(
    {
      email: profile.email,
      ownWords: profile.ownWords,
      settings: profile.settings,
      businessDraft: profile.businessDraft,
      companyName: profile.smeProfile?.companyName,
      hasBusiness: business || hasBusinessWorkspace,
    },
    { setUp: simple.setUp, telegram: messages.setup.choices.reach.options.telegram.label },
  );

  return (
    <ProfileFrame
      hero
      title={
        <span className="flex min-w-0 items-center gap-4">
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label={savedPhoto ? hub.changePhoto : hub.addPhoto} onChange={(event) => void choosePhoto(event)} />
          <PhotoMenu
            hasPhoto={!!savedPhoto}
            busy={photoBusy}
            label={savedPhoto ? hub.changePhoto : hub.addPhoto}
            changeLabel={hub.choosePhoto}
            removeLabel={hub.removePhoto}
            onChange={() => photoInput.current?.click()}
            onRemove={() => void savePhoto(null)}
          >
            {(savedPhoto || profile.xProfileImageUrl) && !imageFailed ? (
              <img src={savedPhoto || profile.xProfileImageUrl} alt="" width={56} height={56} className="size-14 rounded-full object-cover" onError={() => setImageFailed(true)} />
            ) : (
              <WalletAvatar address={address} size={56} />
            )}
            <span aria-hidden className="absolute -bottom-0.5 -end-0.5 grid size-6 place-items-center rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[var(--lp-dark)]"><Icon name="plus" size={16} /></span>
          </PhotoMenu>
          <span className="min-w-0">
            <span className="line-clamp-2 break-words text-[20px] leading-tight">{displayName}</span>
            <span className="block truncate text-[14px] font-normal tracking-normal text-[var(--lp-text-sub)]">
              {[profile.handle ? `@${profile.handle}` : contact, business ? hub.businessAccount : hub.personalAccount].join(' · ')}
            </span>
          </span>
        </span>
      }
    >
      {photoBusy || photoError ? (
        <div className="-mt-3 flex flex-wrap items-center gap-3 text-[14px] font-medium">
          <span role="status" aria-live="polite" className="text-[var(--lp-text-sub)]">{photoBusy ? hub.savingPhoto : ''}</span>
          {photoError ? <span role="alert" className="text-[var(--color-critical)]">{photoError}</span> : null}
        </div>
      ) : null}

      {/* On a phone the top bar has no room for it, so the assistant switch
          leads the profile; on a wide screen it stays in the top bar. */}
      {DEALS_AVAILABLE ? (
        <div className="lg:hidden">
          <RowGroup>
            <ToggleRow
              label={messages.assistantMode.use}
              note={messages.assistantMode.greetingBody}
              checked={false}
              onChange={() => {
                rememberReturn('/profile');
                router.push('/assistant');
              }}
            />
          </RowGroup>
        </div>
      ) : null}

      {DEALS_AVAILABLE && hasBusinessWorkspace ? (
        <RowGroup>
          <Row inline label={hub.workspaces}><WorkspaceSwitcher /></Row>
        </RowGroup>
      ) : null}

      <RowGroup title={DEALS_AVAILABLE ? hub.moneyAndTrade : hub.money}>
        <Row label={hub.usdcBalance} value={owned.total == null ? undefined : `${formatBalance(owned.total, locale)} USDC`} href="/account" />
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
        <Row label={hub.editProfile} href="/profile/edit" />
        {DEALS_AVAILABLE ? <Row label={simple.agentsTitle} value={rows.agents} href={profile.settings?.setupDoneAt ? '/profile/setup' : '/setup'} /> : null}
        <Row label={simple.contactTitle} value={rows.contact} href="/profile/contact" />
        <Row label={simple.walletsTitle} href="/profile/wallets" />
        <Row label={messages.payLink.create.title} href="/request" />
        {DEALS_AVAILABLE ? (
          <Row
            label={business || hasBusinessWorkspace ? businessCopy.label : businessCopy.open}
            value={rows.business}
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
        </RowGroup>
      ) : null}

      <RowGroup title={hub.other}>
        <Row label={hub.publicProfile} href={`/credit-passport/${address}`} />
        <Row label={nav.allSettings} href="/settings" />
        <Row label={nav.help} href="/how-it-works" />
      </RowGroup>

      {/* The account address lives in Wallets, with a copy button. */}
      <footer className="flex justify-end px-1">
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
