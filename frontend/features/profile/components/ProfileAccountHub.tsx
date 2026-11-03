'use client';

import Link from 'next/link';
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
import { ProfileFrame, Row, RowGroup, ToggleRow } from '../ui/ProfileUi';
import { liveOffers, openRequests } from '@/features/home/tradeHub';
import { marketViewHref } from '@/features/market/marketQuery';
import { useRouter } from 'next/navigation';
import { rememberReturn } from '@/features/assistant/assistantReturn';
import { ProfileSignOut } from './ProfileSignOut';
import { PhotoMenu } from './PhotoMenu';
import { WorkspaceSwitcher } from '@/features/workspaces/components/WorkspaceSwitcher';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { useAddPasskey } from '@/features/settings/components/SettingsBand';
import { accountRows } from '../accountRows';
import { useQuery } from '@tanstack/react-query';
import { GUARANTEE_QUERY } from '@/features/guarantee/GuaranteeCard';
import { ownRecord, type OwnRecord } from '../ownRecord';
import { yourAgentCopy } from '@/shared/i18n/messages/yourAgent';

type ProfileAccountHubProps = {
  profile: UserProfile;
  address: string;
};


export function ProfileAccountHub({
  profile,
  address,
}: ProfileAccountHubProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [savedPhoto, setSavedPhoto] = useState(profile.profileImageDataUrl);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);
  const messages = useTranslations();
  const guarantee = useQuery({ queryKey: GUARANTEE_QUERY, queryFn: () => api.guarantee(), enabled: DEALS_AVAILABLE });
  const guaranteeInPlace = guarantee.data?.available && Number(guarantee.data.inPlaceUsdc) > 0 ? `${guarantee.data.inPlaceUsdc} USDC` : undefined;
  const router = useRouter();
  const nav = messages.nav;
  const businessCopy = messages.businessProfilePage;
  const hub = messages.profile.hub;
  const pp = messages.profilePage;
  // Your own record, with your own counts (view 44, P9); others only see words.
  const record = useQuery({ queryKey: ['karwan-record', profile.handle], queryFn: () => api.record(profile.handle!), enabled: !!profile.handle, retry: false });
  const mine = ownRecord(record.data);
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

  // The balance is the money page's one balance on Arc; the agents show beside it.
  const money = useMoneyBalances();
  const { hasPasskey, method, email, refresh } = useAuth();
  const passkey = useAddPasskey(email, () => refresh());
  const { locale } = useLocale();
  const agentCopy = yourAgentCopy[locale as keyof typeof yourAgentCopy] ?? yourAgentCopy.en;
  const simple = messages.profile.simple;
  const balanceFacts = { balance: money.balance, pool: money.pool, loading: money.loading, error: money.error };
  const me = address.toLowerCase();
  const myRequests = useQuery({ queryKey: ['search', 'myRequests', me], queryFn: () => api.buyer(me).then((r) => r.jobs), enabled: DEALS_AVAILABLE && !!me, staleTime: 15_000 });
  const myListings = useQuery({ queryKey: ['trade-hub', 'listings', me], queryFn: () => api.listingsForSeller(me).then((r) => r.listings), enabled: DEALS_AVAILABLE && !!me, staleTime: 15_000 });
  const count = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('{n}', String(n)));
  const trade = {
    requests: myRequests.data ? count(openRequests(myRequests.data, Date.now()).length, pp.openRequestsOne, pp.openRequests) : undefined,
    offers: myListings.data ? count(liveOffers(myListings.data, Date.now()).length, pp.liveOffersOne, pp.liveOffers) : undefined,
  };
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
        <>
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
              <img src={savedPhoto || profile.xProfileImageUrl} referrerPolicy="no-referrer" alt="" width={56} height={56} className="size-14 rounded-full object-cover" onError={() => setImageFailed(true)} />
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
        <Link href="/profile/edit" className="ms-auto inline-flex min-h-11 shrink-0 items-center rounded-full border border-[var(--lp-outline-strong)] px-4 text-[14px] font-semibold tracking-normal text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">{hub.editProfile}</Link>
        </>
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

      {/* One Record card: the numbers, then what others see, earlier deals and sharing (view 44). */}
      <RowGroup title={pp.record}>
        {mine?.kind === 'record' ? <RecordStats record={mine} /> : mine?.kind === 'new' ? <Row label={pp.newHere} /> : null}
        <Row label={pp.publicView} href={profile.handle ? `/r/${profile.handle}` : '/profile/edit'} />
        <Row label={messages.dealGuarantee.profile.legacyContracts} href="/legacy" />
        <Row label={pp.share} href={`/credit-passport/${address}#share`} />
        <Row label={agentCopy.recordSources} href="/profile/sources" />
      </RowGroup>

      {/* Buying, selling and the money in one group, so the app reads at a
          glance (owner notes, 3 Nov 2026). */}
      <RowGroup title={pp.tradeAndMoney}>
        <Row label={pp.balance} value={usdc(heroAmount(balanceFacts))} href="/account" />
        {DEALS_AVAILABLE ? <Row label={pp.withAgents} value={usdc(agentTotal)} href="/profile/agent-funds" /> : null}
        {DEALS_AVAILABLE ? <Row label={messages.dealGuarantee.profile.dealGuarantee} value={guaranteeInPlace} href="/guarantee" /> : null}
        {DEALS_AVAILABLE ? <Row label={pp.buying} value={trade.requests} href={marketViewHref('yours', 'requests')} /> : null}
        {DEALS_AVAILABLE ? <Row label={pp.selling} value={trade.offers} href={marketViewHref('yours', 'offers')} /> : null}
        {DEALS_AVAILABLE ? <Row label={pp.howAgentTrades} href="/profile/setup" /> : null}
        <Row label={hub.activityReceipts} href="/activity" />
      </RowGroup>

      <RowGroup title={pp.accountAndSecurity}>
        {DEALS_AVAILABLE ? <Row label={simple.agentsTitle} value={rows.agents} href={profile.settings?.setupDoneAt ? '/profile/setup' : '/setup'} /> : null}
        <Row label={simple.contactTitle} value={rows.contact} href="/profile/contact" />
        <Row label={simple.walletsTitle} href="/profile/wallets" />
        {DEALS_AVAILABLE ? (
          <Row
            label={business || hasBusinessWorkspace ? businessCopy.label : businessCopy.open}
            value={rows.business}
            href="/profile/business"
          />
        ) : null}
        {/* A wallet account signs with its wallet; passkeys belong to email accounts. */}
        {method === 'circle' ? (
          <>
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
          </>
        ) : null}
      </RowGroup>

      <RowGroup>
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

/// The record's four numbers, each with its plain label under it.
function RecordStats({ record }: { record: Extract<OwnRecord, { kind: 'record' }> }) {
  const pp = useTranslations().profilePage;
  const { locale } = useLocale();
  const n = (value: number) => value.toLocaleString(locale);
  const stats: Array<[string, string]> = [
    [n(record.completed), record.completed === 1 ? pp.statCompletedOne : pp.statCompleted],
  ];
  if (record.onTimePct !== null) stats.push([(record.onTimePct / 100).toLocaleString(locale, { style: 'percent' }), pp.statOnTime]);
  if (record.rating?.kind === 'rated') {
    stats.push([
      record.rating.value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      pp.statRatings.replace('{n}', n(record.rating.count)),
    ]);
  }
  stats.push([n(record.problemsLost), record.problemsLost === 1 ? pp.statProblemsOne : pp.statProblems]);
  return (
    <dl data-record-stats className="grid grid-cols-2 gap-px bg-[var(--lp-border-light)] sm:grid-cols-4">
      {stats.map(([value, label]) => (
        <div key={label} className="flex flex-col-reverse gap-0.5 bg-[var(--lp-card)] px-4 py-3">
          <dt className="text-[13px] font-medium text-[var(--lp-text-sub)]">{label}</dt>
          <dd className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-[var(--lp-dark)]">{value}</dd>
        </div>
      ))}
    </dl>
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
