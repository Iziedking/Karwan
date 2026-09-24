'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { api, type UserProfile } from '@/core/api';
import { PROFILE_SAVED_EVENT } from '@/shared/hooks/useUserProfile';
import { WalletAvatar } from '@/shared/components/WalletAvatar';
import { shortAddress } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { ProfileSignOut } from './ProfileSignOut';
import { WorkspaceSwitcher } from '@/features/workspaces/components/WorkspaceSwitcher';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';

type ProfileAccountHubProps = {
  profile: UserProfile;
  address: string;
  hasOpenDeals: boolean;
  hasAction: boolean;
};

type HubRowProps = {
  label: string;
  description?: string;
  children?: ReactNode;
  onClick?: () => void;
  href?: string;
  note?: string;
};

export function ProfileAccountHub({
  profile,
  address,
  hasOpenDeals,
  hasAction,
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

  return (
    <main className="product-surface min-w-0 overflow-x-clip min-h-[calc(100vh-72px)] bg-[var(--lp-light)] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto min-w-0 max-w-[1180px]">
        <header className="grid min-w-0 gap-5 border-b border-[var(--lp-border-light)] py-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:py-8">
          <div className="flex shrink-0 flex-col items-start gap-1">
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label={savedPhoto ? hub.changePhoto : hub.addPhoto} onChange={(event) => void choosePhoto(event)} />
            <button type="button" disabled={photoBusy} aria-label={savedPhoto ? hub.changePhoto : hub.addPhoto} onClick={() => photoInput.current?.click()} className="group relative size-[72px] rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-offset-2 disabled:opacity-60">
            {(savedPhoto || profile.xProfileImageUrl) && !imageFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={savedPhoto || profile.xProfileImageUrl}
                alt=""
                width={72}
                height={72}
                className="size-[72px] rounded-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <WalletAvatar address={address} size={72} />
            )}
              <span aria-hidden className="absolute -bottom-1 -end-1 grid size-7 place-items-center rounded-full border border-[var(--lp-border-light)] bg-[var(--lp-card)] text-[16px] text-[var(--lp-dark)] group-hover:border-[var(--lp-accent)]">+</span>
            </button>
            {savedPhoto && <button type="button" disabled={photoBusy} onClick={() => void savePhoto(null)} className="min-h-11 text-[12px] font-semibold text-[var(--lp-text-sub)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">{hub.removePhoto}</button>}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[var(--lp-text-sub)]">
              <span>{business ? hub.businessAccount : hub.personalAccount}</span>
              {hasAction ? (
                <span className="rounded-full bg-[var(--lp-workspace-soft)] px-2.5 py-1 text-[var(--lp-workspace-ink)]">
                  {hub.actionNeeded}
                </span>
              ) : null}
            </div>
            <h1 className="mt-1 break-words text-[clamp(2.4rem,5vw,4.5rem)] font-semibold leading-[0.96] tracking-[-0.06em] text-[var(--lp-dark)]">
              {displayName}
            </h1>
            <p className="mt-1 break-words [overflow-wrap:anywhere] text-[14px] text-[var(--lp-text-sub)]">{contact}</p>
            <p className="mt-2 text-[12px] text-[var(--lp-text-sub)]">{hub.photoPublic}</p>
            <p role="status" aria-live="polite" className="mt-1 text-[12px] text-[var(--lp-text-sub)]">{photoBusy ? hub.savingPhoto : ''}</p>
            {photoError && <p role="alert" className="mt-1 text-[12px] text-[var(--color-critical)]">{photoError}</p>}
          </div>
        </header>

        <div className="mt-5 flex items-center justify-between gap-4 rounded-[16px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-[var(--lp-dark)]">{hub.workspaces}</p>
            <p className="mt-0.5 text-[12px] text-[var(--lp-text-sub)]">{hub.switchContext}</p>
          </div>
          <WorkspaceSwitcher />
        </div>

        <div className="mt-10 grid gap-10">
          <HubSection title={hub.account}>
            <HubRow
              label={hub.personalDetails}
              href="/profile/edit"
            />
            <HubRow
              label={business || hasBusinessWorkspace ? businessCopy.label : businessCopy.open}
              description={!business && hasBusinessWorkspace ? businessCopy.manageBody : undefined}
              href="/profile/business"
            />
            <HubRow
              label={hub.accountSetup}
              href="/profile/setup"
            />
            <HubRow
              label={hub.contactDetails}
              href="/profile/contact"
            />
            <HubRow
              label={nav.allSettings}
              href="/settings"
            />
            <HubRow
              label={nav.help}
              href="/how-it-works"
            />
          </HubSection>

          <HubSection title={hub.moneyAndTrade}>
            <HubRow
              label={hub.usdcBalance}
              href="/account"
            />
            <HubRow
              label={hub.wallets}
              href="/profile/wallets"
            />
            <HubRow
              label={hub.openDeals}
              note={hasAction ? hub.reviewNow : hasOpenDeals ? hub.open : undefined}
              href="/profile/open-deals"
            />
            <HubRow
              label={hub.agentFunds}
              href="/profile/agent-funds"
            />
            <HubRow label={hub.activityReceipts} href="/activity" />
            <HubRow label={hub.reputation} href="/stake" />
          </HubSection>
        </div>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--lp-border-light)] pt-4">
          <p className="text-[12px] text-[var(--lp-text-muted)]">
            {hub.accountLabel} {shortAddress(address)}
          </p>
          <div className="ms-auto"><ProfileSignOut /></div>
        </footer>
      </div>
    </main>
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

function HubSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="profile-hub-section">
      <h2 className="mb-4 text-[24px] font-semibold tracking-[-0.025em] text-[var(--lp-dark)]">{title}</h2>
      <div className="overflow-hidden rounded-[14px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]">{children}</div>
    </section>
  );
}

function HubRow({ label, description, onClick, href, note }: HubRowProps) {
  const className = 'group flex min-h-[74px] w-full items-center gap-4 border-b border-[var(--lp-border-light)] px-5 py-3.5 text-start transition-[background-color,padding] duration-200 last:border-b-0 hover:bg-[var(--lp-light)] hover:ps-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)] focus-visible:ring-inset';
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-[var(--lp-dark)]">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[13px] leading-snug text-[var(--lp-text-sub)]">{description}</span>
        ) : null}
      </span>
      {note ? (
        <span className="shrink-0 text-[12px] font-bold text-[var(--lp-workspace-ink)]">{note}</span>
      ) : null}
      <span aria-hidden className="shrink-0 text-[20px] text-[var(--lp-text-muted)] transition-transform group-hover:translate-x-0.5">›</span>
    </>
  );

  if (href) return <Link href={href} className={className}>{content}</Link>;
  return <button type="button" onClick={onClick} className={className}>{content}</button>;
}
