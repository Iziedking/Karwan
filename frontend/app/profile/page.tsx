'use client';
import { useEffect, useState } from 'react';
import { ARC_NETWORK } from '@/core/arcNetwork';
import { dealsAvailableOn } from '@/shared/utils/routes';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useUserProfile } from '@/shared/hooks/useUserProfile';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useActivation } from '@/shared/hooks/useActivation';
import { ActivationModal } from '@/shared/components/ActivationModal';
import { ConnectXButton } from '@/features/profile/components/ConnectXButton';
import { WalletsPanel } from '@/features/balances/components/WalletsPanel';
import { TelegramConnectButton } from '@/features/telegram/components/TelegramConnectButton';
import { TierCelebration } from '@/features/reputation/components/TierCelebration';
import { SmeCompanyBand } from '@/features/profile/components/SmeCompanyBand';
import { RegisterBusinessBand } from '@/features/profile/components/RegisterBusinessBand';
import { ProfileEmailButton } from '@/features/profile/components/ProfileEmailButton';
import { SME_TRADES_ENABLED } from '@/features/profile/config';
import { ProfileOpenDealsPanel } from '@/features/notifications/components/ProfileOpenDealsPanel';
import { useOpenDeals } from '@/features/notifications/hooks/useOpenDeals';
import { useTranslations } from '@/shared/i18n/LocaleProvider';
import { type UserProfile } from '@/core/api';
import {
  FullBleed,
  Band,
  GridOverlay,
  SectionTag,
  HeroHeadline,
  Punc,
} from '@/shared/components/Bands';
import { ProfileAccountHub } from '@/features/profile/components/ProfileAccountHub';
import { AgentFundsList } from '@/features/profile/components/AgentFundsList';
import { ResearchRows } from '@/features/profile/components/ResearchRows';
import { ProfileFrame, Row, RowGroup } from '@/features/profile/ui/ProfileUi';
import { useWorkspaceContext } from '@/shared/hooks/useWorkspaceContext';

type ProfileSection = 'wallets' | 'open-deals' | 'agents' | 'identity' | 'preferences';

const PROFILE_SECTION_BY_PATH: Record<string, ProfileSection> = {
  '/profile/wallets': 'wallets',
  '/profile/open-deals': 'open-deals',
  '/profile/agent-funds': 'agents',
  '/profile/setup': 'identity',
  '/profile/contact': 'preferences',
};

const PROFILE_ROUTE_BY_PANEL = {
  wallets: '/profile/wallets',
  money: '/account',
  'open-deals': '/profile/open-deals',
  agents: '/profile/agent-funds',
  identity: '/profile/setup',
  preferences: '/profile/contact',
} as const;

const PROFILE_HASH_ROUTE: Record<string, string> = {
  wallets: PROFILE_ROUTE_BY_PANEL.wallets,
  money: PROFILE_ROUTE_BY_PANEL.money,
  'open-deals': PROFILE_ROUTE_BY_PANEL['open-deals'],
  agents: PROFILE_ROUTE_BY_PANEL.agents,
  identity: PROFILE_ROUTE_BY_PANEL.identity,
  company: `${PROFILE_ROUTE_BY_PANEL.identity}?edit=company`,
  preferences: PROFILE_ROUTE_BY_PANEL.preferences,
};


type ProfilePanel = {
  key: ProfileSection;
  label: string;
  content: React.ReactNode;
};


/// Trade agents exist only where deals run (not on Arc mainnet before the escrow ships).
const AGENTS_AVAILABLE = dealsAvailableOn(ARC_NETWORK);
export default function ProfilePage() {
  const t = useTranslations().profile;
  return (
    <AuthGuard gateTag={t.signInGate.tag} gateBody={t.signInGate.body}>
      <ProfilePageInner />
    </AuthGuard>
  );
}

function ProfilePageInner() {
  const messages = useTranslations();
  const t = messages.profile;
  const router = useRouter();
  const pathname = usePathname();
  const activeSection = PROFILE_SECTION_BY_PATH[pathname] ?? null;
  const { profile: loadedProfile, address, fetchState } = useUserProfile();
  const { isBusinessWorkspace } = useWorkspaceContext();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const activation = useActivation();
  const openDeals = useOpenDeals();
  const [activationOpen, setActivationOpen] = useState(false);

  useEffect(() => setProfile(loadedProfile), [loadedProfile]);

  // Preserve existing assistant, email, and bookmark links while removing the
  // hash-controlled profile deck. Each old destination now resolves to a real
  // page with normal browser history and document scrolling.
  useEffect(() => {
    if (pathname !== '/profile') return;
    const hash = window.location.hash.slice(1);
    const destination = PROFILE_HASH_ROUTE[hash];
    if (destination) router.replace(destination);
  }, [pathname, router]);

  const agents = {
    buyer: activation.agents?.buyer,
    seller: activation.agents?.seller,
  };
  const defaultAgent: 'buyer' | 'seller' = profile?.role === 'seller' ? 'seller' : 'buyer';

  if (fetchState === 'error') {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="max-w-[44ch]">
            <SectionTag tone="dark">{t.loadError.tag}</SectionTag>
            <HeroHeadline size="md">
              {t.loadError.title}
              <Punc>.</Punc>
            </HeroHeadline>
            <p className="mt-6 text-[15px] leading-relaxed text-[var(--lp-text-muted)]">
              {t.loadError.body}
            </p>
          </div>
        </Band>
      </FullBleed>
    );
  }

  if (fetchState === 'idle' || fetchState === 'loading') {
    return (
      <FullBleed>
        <Band tone="dark" overlay={<GridOverlay />}>
          <div className="space-y-4 max-w-[44ch]">
            <div className="h-3 w-32 rounded bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
            <div className="h-12 w-64 rounded bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
            <div className="h-3 w-48 rounded bg-[var(--lp-workspace-soft)] animate-pulse motion-reduce:animate-none" />
          </div>
        </Band>
      </FullBleed>
    );
  }

  const isBusiness = isBusinessWorkspace;
  const simple = t.simple;
  const sectionTitle: Record<ProfileSection, string> = {
    wallets: simple.walletsTitle,
    'open-deals': simple.openDealsTitle,
    agents: simple.agentFundsTitle,
    identity: simple.agentsTitle,
    preferences: simple.contactTitle,
  };
  const usdcOrNotSet = (value: unknown) => (isAmount(value) ? `${value} USDC` : simple.notSet);
  const rangeOrNotSet = (min: unknown, max: unknown, template: string) =>
    isAmount(min) && isAmount(max) ? template.replace('{min}', String(min)).replace('{max}', String(max)) : simple.notSet;

  const profilePanels: ProfilePanel[] = [
    {
      key: 'identity',
      label: t.tabs.identity,
      content: (
        <div data-guide="profile-identity" className="space-y-7">
          <TierCelebration address={address} />
          {AGENTS_AVAILABLE ? (
            <RowGroup>
              <Row label={simple.agents} value={activation.loading ? undefined : activation.activated ? simple.on : undefined}>
                {!activation.loading && !activation.activated ? (
                  <button type="button" onClick={() => setActivationOpen(true)} className={ACCENT_PILL}>{simple.setUp}</button>
                ) : null}
              </Row>
            </RowGroup>
          ) : null}
          {SME_TRADES_ENABLED && address && isBusiness ? (
            <div data-guide="profile-business-verification">
              <RegisterBusinessBand address={address} />
            </div>
          ) : null}
          {profile ? (
            <>
              {profile.buyer ? (
                <RowGroup title={activation.agents?.buyerName || simple.buyingAgent}>
                  <Row label={simple.mostItMayPay} value={usdcOrNotSet(profile.buyer.maxBudgetUsdc)} />
                  <Row label={simple.deliveryTime} value={rangeOrNotSet(profile.buyer.minDeadlineDays, profile.buyer.maxDeadlineDays, simple.daysRange)} />
                  <Row label={simple.paymentSplit} value={profile.buyer.milestonePcts?.length ? profile.buyer.milestonePcts.map((pct) => `${pct}%`).join(' / ') : simple.notSet} />
                </RowGroup>
              ) : null}
              {profile.seller ? (
                <RowGroup title={activation.agents?.sellerName || simple.sellingAgent}>
                  <Row label={isBusiness ? t.agentProfiles.rows.supplies : simple.whatYouOffer} value={profile.seller.skills?.length ? profile.seller.skills.join(', ') : simple.notSet} />
                  <Row label={simple.priceRange} value={rangeOrNotSet(profile.seller.minBudgetUsdc, profile.seller.maxBudgetUsdc, simple.usdcRange)} />
                  <Row label={simple.deliveryTime} value={rangeOrNotSet(profile.seller.minDeadlineDays, profile.seller.maxDeadlineDays, simple.daysRange)} />
                </RowGroup>
              ) : null}
              <Link href="/profile/edit" className={QUIET_PILL}>{simple.edit}</Link>
            </>
          ) : (
            <Link href="/start?mode=signup" className={ACCENT_PILL}>{t.noProfile.cta}</Link>
          )}
          {/* A business's company details sit here; the anchor keeps old links working. */}
          <div id="company" aria-hidden style={{ scrollMarginTop: 80 }} />
          {SME_TRADES_ENABLED && address && isBusiness ? (
            <SmeCompanyBand address={address} fallbackName={profile?.displayName} />
          ) : null}
        </div>
      ),
    },
    ...(address
      ? [{
          key: 'open-deals',
          label: t.tabs.openDeals,
          content: (
            <ProfileOpenDealsPanel
              address={address}
              matches={openDeals.matches}
              directDeals={openDeals.directDeals}
              fetchState={openDeals.fetchState}
              onRetry={openDeals.refresh}
            />
          ),
        } satisfies ProfilePanel]
      : []),
    {
      key: 'wallets',
      label: t.tabs.wallets,
      content: (
        <div data-guide="profile-wallets">
          <WalletsPanel address={address ?? undefined} />
        </div>
      ),
    },
    {
      key: 'agents',
      label: t.tabs.agents,
      content: (
        <div className="space-y-7" data-guide="profile-agents">
          <AgentFundsList onSetUp={() => setActivationOpen(true)} />
          {activation.activated ? <ResearchRows /> : null}
        </div>
      ),
    },
    {
      key: 'preferences',
      label: t.tabs.preferences,
      content: (
        <div data-guide="profile-preferences">
          <RowGroup>
            <Row label={messages.profile.hub.email}>{address && <ProfileEmailButton address={address} tone="light" />}</Row>
            <Row label={messages.profile.hub.telegram}><TelegramConnectButton address={address ?? undefined} tone="light" /></Row>
            <Row label={messages.profile.hub.x}><ConnectXButton tone="light" /></Row>
          </RowGroup>
        </div>
      ),
    },
  ];

  const activePanel = activeSection
    ? profilePanels.find((panel) => panel.key === activeSection)
    : null;

  // The loaded profile counts on the first render too; the local copy is only
  // filled by the effect above, so checking it alone flashed this screen.
  if (!activeSection && !(profile ?? loadedProfile)) {
    return (
      <main className="product-surface min-h-[calc(100vh-72px)] bg-[var(--lp-light)] px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-[760px]">
          <h1 className="text-[clamp(2.25rem,5vw,4rem)] font-semibold leading-none tracking-[-0.05em] text-[var(--lp-dark)]">
            {messages.profile.hub.setupTitle}
          </h1>
          <p className="mt-3 text-[15px] text-[var(--lp-text-sub)]">{messages.profile.hub.setupBody}</p>
          <Link
            href="/start?mode=signup"
            className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[var(--lp-accent)] px-5 text-[14px] font-bold text-[var(--lp-band-dark)]"
          >
            {messages.profile.hub.setupCta}
          </Link>
        </div>
      </main>
    );
  }

  if (!activeSection && profile && address) {
    return (
      <ProfileAccountHub
        profile={profile}
        address={address}
        hasOpenDeals={openDeals.hasOpenDeals}
        hasAction={openDeals.hasAction}
        openCount={openDeals.totalCount}
      />
    );
  }

  if (!activePanel) return null;

  return (
    <>
      <ProfileFrame title={sectionTitle[activeSection]} hint={activeSection === 'identity' ? simple.agentsHint : undefined}>
        {activePanel.content}
      </ProfileFrame>
      <ActivationModal
        open={activationOpen}
        onClose={() => setActivationOpen(false)}
        activate={activation.activate}
        renameAgents={activation.renameAgents}
        activating={activation.activating}
        error={activation.error}
        activated={activation.activated}
        agents={activation.agents}
      />
    </>
  );
}

const ACCENT_PILL =
  'inline-flex min-h-11 items-center rounded-full bg-[var(--lp-accent)] px-5 text-[14px] font-semibold text-[var(--lp-band-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]';
const QUIET_PILL =
  'inline-flex min-h-11 items-center rounded-full bg-[var(--tint)] px-5 text-[14px] font-semibold text-[var(--ink)] hover:bg-[var(--line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

const isAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
