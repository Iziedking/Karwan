'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { type UserProfile } from '@/core/api';
import { isBusinessAccount } from '@/features/account/accountKind';
import { WalletAvatar } from '@/shared/components/WalletAvatar';
import { shortAddress } from '@/shared/utils/format';
import { useTranslations } from '@/shared/i18n/LocaleProvider';

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
  const nav = useTranslations().nav;
  const business = isBusinessAccount(profile);
  const displayName =
    (business ? profile.smeProfile?.companyName : profile.displayName)?.trim() ||
    profile.displayName?.trim() ||
    'Your account';
  const contact = profile.xHandle
    ? `@${profile.xHandle.replace(/^@/, '')}`
    : profile.email || shortAddress(address);

  return (
    <main className="product-surface min-h-[calc(100vh-72px)] bg-[var(--lp-light)] px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1180px]">
        <Link
          href="/app"
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-[14px] font-semibold text-[var(--lp-text-sub)] transition-colors hover:bg-[var(--lp-card)] hover:text-[var(--lp-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]"
        >
          <span aria-hidden>←</span>
          Home
        </Link>

        <header className="mt-4 grid gap-5 border-b border-[var(--lp-border-light)] py-6 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:py-8">
          <span className="relative block size-[72px] shrink-0">
            {profile.xProfileImageUrl && !imageFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.xProfileImageUrl}
                alt=""
                width={72}
                height={72}
                className="size-[72px] rounded-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <WalletAvatar address={address} size={72} />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[var(--lp-text-sub)]">
              <span>{business ? 'Business account' : 'Personal account'}</span>
              {hasAction ? (
                <span className="rounded-full bg-[var(--lp-workspace-soft)] px-2.5 py-1 text-[var(--lp-workspace-ink)]">
                  Action needed
                </span>
              ) : null}
            </div>
            <h1 className="mt-1 break-words text-[clamp(2.4rem,5vw,4.5rem)] font-semibold leading-[0.96] tracking-[-0.06em] text-[var(--lp-dark)]">
              {displayName}
            </h1>
            <p className="mt-1 truncate text-[14px] text-[var(--lp-text-sub)]">{contact}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
            <Link href="/profile/edit" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--lp-outline)] px-4 text-[14px] font-bold text-[var(--lp-dark)] transition-colors hover:bg-[var(--lp-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">Edit profile</Link>
            <Link href="/stake" className="inline-flex min-h-11 items-center text-[13px] font-bold text-[var(--lp-text-sub)] transition-colors hover:text-[var(--lp-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]">View trade reputation →</Link>
          </div>
        </header>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
          <HubSection title="Account" variant="open">
            <HubRow
              label="Personal details"
              href="/profile/edit"
            />
            <HubRow
              label="Business profile"
              href={business ? '/business/verification' : '/onboarding'}
            />
            <HubRow
              label="Account setup"
              href="/profile/setup"
            />
            <HubRow
              label="Contact details"
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

          <HubSection title="Money and trade">
            <HubRow
              label="USDC balance"
              href="/account"
            />
            <HubRow
              label="Wallets"
              href="/profile/wallets"
            />
            <HubRow
              label="Open deals"
              note={hasAction ? 'Review now' : hasOpenDeals ? 'Open' : undefined}
              href="/profile/open-deals"
            />
            <HubRow
              label="Agent funds"
              href="/profile/agent-funds"
            />
            <HubRow label="Activity and receipts" href="/activity" />
            <HubRow label="Reputation" href="/stake" />
          </HubSection>
        </div>

        <p className="mt-6 text-center text-[12px] text-[var(--lp-text-muted)]">
          Karwan account {shortAddress(address)}
        </p>
      </div>
    </main>
  );
}

function HubSection({
  title,
  children,
  variant = 'card',
}: {
  title: string;
  children: ReactNode;
  variant?: 'card' | 'open';
}) {
  return (
    <section
      className={`profile-hub-section overflow-hidden ${
        variant === 'open'
          ? 'border-y border-[var(--lp-border-light)] bg-transparent'
          : 'rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)]'
      }`}
    >
      <div className={`border-b border-[var(--lp-border-light)] py-4 ${variant === 'open' ? 'px-0' : 'px-5'}`}>
        <h2 className="text-[19px] font-extrabold tracking-[-0.025em] text-[var(--lp-dark)]">{title}</h2>
      </div>
      <div>{children}</div>
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
