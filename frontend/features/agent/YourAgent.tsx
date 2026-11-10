'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, type UserProfile } from '@/core/api';
import { rememberReturn } from '@/features/assistant/assistantReturn';
import { waysOf } from '@/features/profile/ways';
import { Row, RowGroup, ToggleRow } from '@/features/profile/ui/ProfileUi';
import { useLiveFeatures } from '@/shared/hooks/useLiveFeatures';
import { PROFILE_SAVED_EVENT } from '@/shared/hooks/useUserProfile';
import { useLocale } from '@/shared/i18n/LocaleProvider';
import { setupCopy } from '@/shared/i18n/messages/setup';
import { yourAgentCopy } from '@/shared/i18n/messages/yourAgent';
import { fill } from '@/features/deals/workspace/presentation';
import { AgentPanel, type PanelKey } from './agentPanels';
import { BeFoundPanel, NEEDS_KEY, ReachPanel, type FindPanelKey } from './findPanels';
import { beFoundOf, meetLine, meetOf, reachableOf } from './findModel';
import { daysOf, mainWay, paidKindOf, sellerUsualGiven } from './yourAgentModel';

const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

/// Your agent (docs/architecture/45-your-agent.md): whether it is on, then five
/// plain questions, each changed in a panel on this page.
export function YourAgent({ profile, address, activated, activationLoading, onTurnOn, onSaved }: {
  profile: UserProfile;
  address: string;
  activated: boolean;
  activationLoading: boolean;
  onTurnOn: () => void;
  onSaved: (p: UserProfile) => void;
}) {
  const { locale } = useLocale();
  const t = yourAgentCopy[locale as keyof typeof yourAgentCopy] ?? yourAgentCopy.en;
  const own = (setupCopy[locale as keyof typeof setupCopy] ?? setupCopy.en).choices.own;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<PanelKey | null>(null);
  const offers = useQuery({
    queryKey: ['your-agent-offers', address],
    queryFn: () => api.seller(address).then((d) => d.activeBids ?? []),
    enabled: activated && !!profile.seller,
    staleTime: 30_000,
  });

  const ways = waysOf(profile);
  const main = mainWay(ways);
  const kind = paidKindOf(ways);
  const days = daysOf(main);
  const given = sellerUsualGiven(profile);
  const mode = profile.agentPrefs?.agentMode ?? 'offers';
  const waiting = offers.data?.length ?? 0;
  // The agent switch (view 75). One change at a time; a failure leaves it as it was.
  const features = useLiveFeatures();
  const agentOn = profile.agentPrefs?.agentOn !== false;
  const [switching, setSwitching] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  async function setPower(on: boolean) {
    if (switching) return;
    setSwitching(true);
    setSwitchFailed(false);
    try {
      await api.changeMandate({ part: 'power', on }, `page:${crypto.randomUUID()}`);
      saved({ ...profile, agentPrefs: { ...(profile.agentPrefs ?? {}), agentOn: on } });
    } catch {
      setSwitchFailed(true);
    } finally {
      setSwitching(false);
    }
  }

  const changeClass = 'inline-flex min-h-11 shrink-0 items-center rounded-full border border-[var(--lp-border-light)] px-4 text-[14px] font-semibold text-[var(--lp-dark)] hover:bg-[var(--lp-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-accent)]';
  const change = (key: PanelKey) => (
    <button type="button" onClick={() => setOpen(key)} className={changeClass}>
      {t.change}
    </button>
  );
  // Be found and be reached (view 72).
  const [findOpen, setFindOpen] = useState<FindPanelKey | null>(null);
  const needs = useQuery({ queryKey: NEEDS_KEY, queryFn: () => api.standingNeeds().then((r) => r.needs), staleTime: 30_000 });
  const place = [profile.location?.area, profile.location?.city].filter(Boolean).join(', ') || null;
  const meetText = meetLine(meetOf(profile), t.find);
  const beFoundLine = beFoundOf(profile) ? fill(t.find.onWays, { ways: meetText }) : t.find.off;
  const needCount = needs.data?.length ?? 0;
  const reachLine = !reachableOf(profile) ? t.find.off : needCount === 0 ? t.find.onNoNeeds : needCount === 1 ? t.find.onOneNeed : fill(t.find.onNeeds, { n: needCount });
  const answer = (label: string, value: string, key: PanelKey) => (
    <Row inline label={<span className="block"><span className="block text-[13px] font-medium text-[var(--lp-text-sub)]">{label}</span><span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{value}</span></span>}>
      {change(key)}
    </Row>
  );
  const daysLine = days ? (days.min === days.max ? fill(t.daysOne, { n: days.min }) : fill(t.daysRange, { min: days.min, max: days.max })) : '';

  function saved(next: UserProfile) {
    onSaved(next);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_SAVED_EVENT));
  }

  return (
    <div data-your-agent className="space-y-7">
      {activationLoading ? null : activated ? (
        <p data-agent-state={agentOn ? 'on' : 'switched-off'} className="flex items-center gap-2 text-[15px] font-semibold text-[var(--lp-dark)]">
          <span aria-hidden className={`size-2.5 rounded-full ${agentOn ? 'bg-[var(--lp-accent)]' : 'bg-[var(--lp-text-sub)]'}`} />
          {agentOn ? t.on : t.power.offState}
          {agentOn && profile.seller && waiting > 0 ? <span className="font-medium text-[var(--lp-text-sub)]">· {waiting === 1 ? t.oneOfferWaiting : fill(t.offersWaiting, { n: waiting })}</span> : null}
        </p>
      ) : (
        <section data-agent-state="off" className="rounded-[20px] border border-[var(--lp-border-light)] bg-[var(--lp-card)] p-5">
          <h2 className="text-[17px] font-semibold text-[var(--lp-dark)]">{t.off}</h2>
          <p className="mt-1 text-[15px] font-medium text-[var(--lp-text-sub)]">{t.offBody}</p>
          <button type="button" onClick={onTurnOn} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[var(--lp-accent)] px-5 text-[14px] font-semibold text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]">
            {t.turnOn}
          </button>
        </section>
      )}

      {activated && !activationLoading && features.sellerAsked ? (
        <div data-agent-power>
          <RowGroup>
            <ToggleRow label={t.power.label} note={agentOn ? t.power.onNote : t.power.offNote} checked={agentOn} onChange={(next) => void setPower(next)} />
          </RowGroup>
          {switchFailed ? <p role="alert" className="mt-2 text-[14px] font-medium text-[var(--lp-dark)]">{t.failed}</p> : null}
        </div>
      ) : null}

      {profile.seller && !given && main ? (
        <section data-price-notice className="rounded-[20px] border border-[var(--lp-accent)] bg-[var(--offer-surface)] p-5">
          <p className="text-[15px] font-semibold text-[var(--lp-dark)]">{t.priceNotice}</p>
          <button type="button" onClick={() => setOpen('price')} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--lp-accent)] px-5 text-[14px] font-semibold text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-dark)]">
            {t.setPrice}
          </button>
        </section>
      ) : null}

      <RowGroup>
        {profile.seller ? (
          <>
            {answer(t.rows.sell, profile.seller.skills.length ? profile.seller.skills.join(', ') : t.notSet, 'sell')}
            {main ? answer(t.rows.price, given ? fill(t.priceLine, { usual: money(main.priceUsual), lowest: money(main.priceMin) }) : t.priceNotGiven, 'price') : null}
            {answer(t.rows.paid, kind ? fill(t.paidLine, { kind: t.kinds[kind], days: daysLine }) : t.otherKind, 'paid')}
          </>
        ) : null}
        {answer(t.rows.alone, own.options[mode].label, 'alone')}
        {profile.buyer ? answer(t.rows.buy, fill(t.buyLine, { max: money(profile.buyer.maxBudgetUsdc), days: profile.buyer.maxDeadlineDays }), 'buy') : null}
      </RowGroup>

      <RowGroup>
        {profile.seller ? (
          <Row inline label={<span className="block"><span className="block text-[13px] font-medium text-[var(--lp-text-sub)]">{t.find.beFound}</span><span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{beFoundLine}</span></span>}>
            <button type="button" onClick={() => setFindOpen('beFound')} className={changeClass}>{t.change}</button>
          </Row>
        ) : null}
        <Row inline label={<span className="block"><span className="block text-[13px] font-medium text-[var(--lp-text-sub)]">{t.find.reach}</span><span className="block text-[15px] font-semibold text-[var(--lp-dark)]">{reachLine}</span></span>}>
          <button type="button" onClick={() => setFindOpen('reach')} className={changeClass}>{t.change}</button>
        </Row>
      </RowGroup>

      <RowGroup>
        {profile.seller ? <Row label={t.moreWays} href="/profile/ways" /> : null}
        <Row label={<span className="block"><span className="block">{t.askAssistant}</span><span className="block text-[14px] font-medium text-[var(--lp-text-sub)]">{t.assistant}</span></span>} onClick={() => { rememberReturn(pathname); router.push('/assistant'); }} />
      </RowGroup>

      {open ? <AgentPanel key={open} open={open} profile={profile} t={t} own={own} onClose={() => setOpen(null)} onSaved={saved} /> : null}
      {findOpen === 'beFound' ? <BeFoundPanel profile={profile} t={t} place={place} onClose={() => setFindOpen(null)} onSaved={saved} /> : null}
      {findOpen === 'reach' ? <ReachPanel profile={profile} t={t} onClose={() => setFindOpen(null)} onSaved={saved} /> : null}
    </div>
  );
}
